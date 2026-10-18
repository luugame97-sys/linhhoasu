#!/usr/bin/env python3
"""Dịch tiếp file TXT do người dùng chỉnh, bảo toàn format để importer dùng lại."""
import argparse
import concurrent.futures
import json
import re
import sys
import threading
from collections import Counter
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from complete_chinese_translation import (
    HAN_RE,
    escape_single_line,
    make_batches,
    translate_batch,
    token_multiset,
)


def load_lines(path: Path):
    raw = path.read_text(encoding="utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
    if raw.endswith("\n"):
        raw = raw[:-1]
    return raw.split("\n") if raw else []


def valid(original: str, translated: str) -> bool:
    return bool(translated.strip()) and not HAN_RE.search(translated) and token_multiset(original) == token_multiset(translated)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    mapping = json.loads((args.root / "mapping.json").read_text(encoding="utf-8-sig"))
    groups = mapping["groups"]
    input_lines = load_lines(args.input)
    if len(input_lines) != len(groups):
        raise SystemExit(f"Line count mismatch: input={len(input_lines)} mapping={len(groups)}")

    outputs = list(input_lines)
    pending = []
    reused = 0
    for index, group in enumerate(groups):
        original = group["original_text"]
        candidate = input_lines[index]
        if valid(original, candidate):
            reused += 1
        else:
            # Translate the user's current line so existing Vietnamese fragments remain context.
            pending.append((index, candidate or original))

    batches = make_batches(pending)
    print(json.dumps({"groups": len(groups), "reused": reused, "pending": len(pending), "batches": len(batches)}, ensure_ascii=False), flush=True)
    failures = []
    lock = threading.Lock()
    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = {executor.submit(translate_batch, batch): batch for batch in batches}
        for future in concurrent.futures.as_completed(futures):
            batch = futures[future]
            try:
                for index, translated in future.result():
                    outputs[index] = translated
            except Exception as error:
                failures.append({"indices": [item[0] for item in batch], "error": str(error)})
            with lock:
                completed += 1
                if completed % 25 == 0 or completed == len(batches):
                    print(f"progress {completed}/{len(batches)} failures={len(failures)}", flush=True)

    bad_rows = []
    reasons = Counter()
    for index, (group, translated) in enumerate(zip(groups, outputs), start=1):
        original = group["original_text"]
        if not translated.strip():
            reason = "empty"
        elif HAN_RE.search(translated):
            reason = "han_remaining"
        elif token_multiset(original) != token_multiset(translated):
            reason = "placeholder_mismatch"
        else:
            reason = "ok"
        reasons[reason] += 1
        if reason != "ok":
            bad_rows.append({"line": index, "reason": reason, "original": original, "translated": translated})

    report = {"groups": len(groups), "reused": reused, "translated_now": len(pending), "validation": dict(reasons), "failures": failures, "bad_rows": bad_rows}
    report_path = args.root / "user_translation_autofix_report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if failures or bad_rows:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        raise SystemExit(2)

    content = "\r\n".join(escape_single_line(text) for text in outputs)
    args.output.write_bytes(("\ufeff" + content).encode("utf-8"))
    print(json.dumps({"ok": True, "output": str(args.output), **report}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
