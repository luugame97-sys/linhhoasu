import argparse
import concurrent.futures
import json
import re
import sys
import threading
import time
import urllib.parse
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path


sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HAN_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
TOKEN_RE = re.compile(
    r"\{[^{}\r\n]+\}|%[-+0-9.]*[sdif]|</?[a-zA-Z][^>]*>|\\[nrt]|\$\{[^}]+\}|https?://[^\s<]+"
)
SEP_TEMPLATE = "ZXQSEP{:04d}QXZ"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"


def escape_single_line(text):
    return (
        text.replace("\\", "\\\\")
        .replace("\r", "\\r")
        .replace("\n", "\\n")
        .replace("\t", "\\t")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )


def decode_single_line(text):
    output = []
    index = 0
    while index < len(text):
        if text[index] != "\\" or index + 1 >= len(text):
            output.append(text[index])
            index += 1
            continue
        next_char = text[index + 1]
        mapping = {"\\": "\\", "n": "\n", "r": "\r", "t": "\t"}
        if next_char in mapping:
            output.append(mapping[next_char])
            index += 2
        elif text.startswith("\\u2028", index):
            output.append("\u2028")
            index += 6
        elif text.startswith("\\u2029", index):
            output.append("\u2029")
            index += 6
        else:
            output.extend(("\\", next_char))
            index += 2
    return "".join(output)


def token_multiset(text):
    return Counter(TOKEN_RE.findall(text))


def protect(text):
    saved = []

    def replace(match):
        marker = f"ZXQKEEP{len(saved):03d}QXZ"
        saved.append((marker, match.group(0)))
        return marker

    protected = TOKEN_RE.sub(replace, text)
    protected = protected.replace("\r\n", "\n").replace("\r", "\n")
    protected = protected.replace("\n", "ZXQNEWLINEQXZ")
    return protected, saved


def restore(text, saved):
    result = text.replace("ZXQNEWLINEQXZ", "\n")
    for marker, value in saved:
        result = re.sub(re.escape(marker), lambda _m, value=value: value, result, flags=re.IGNORECASE)
    return result.strip()


def google_translate(text, source="auto", attempts=5):
    query = urllib.parse.urlencode(
        {"client": "gtx", "sl": source, "tl": "vi", "dt": "t", "q": text}
    )
    url = f"https://translate.googleapis.com/translate_a/single?{query}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
            return "".join(part[0] for part in payload[0] if part and part[0])
        except urllib.error.HTTPError as error:
            if error.code in (400, 401, 403, 429):
                break
            if attempt + 1 >= attempts:
                break
            time.sleep(min(8, 1.5 * (attempt + 1)))
        except Exception:
            if attempt + 1 >= attempts:
                break
            time.sleep(min(8, 1.5 * (attempt + 1)))
    # Google throttles burst traffic. Fall back to the public MyMemory MT
    # endpoint; first try the Jina read-through proxy to avoid a temporary
    # Google IP throttle, then use MyMemory as a final fallback.
    proxy_url = "https://r.jina.ai/http://" + url.removeprefix("https://")
    proxy_request = urllib.request.Request(proxy_url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(proxy_request, timeout=45) as response:
            proxy_text = response.read().decode("utf-8", errors="replace")
        marker = "Markdown Content:\n"
        if marker in proxy_text:
            proxy_text = proxy_text.split(marker, 1)[1].strip()
        payload = json.loads(proxy_text)
        translated = "".join(part[0] for part in payload[0] if part and part[0])
        if translated:
            return translated
    except Exception:
        pass

    # MyMemory accepts the same protected separators/placeholders.
    memory_url = "https://api.mymemory.translated.net/get?" + urllib.parse.urlencode(
        {"q": text, "langpair": "zh-CN|vi"}
    )
    request = urllib.request.Request(memory_url, headers={"User-Agent": USER_AGENT})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if payload.get("quotaFinished"):
                raise RuntimeError("MyMemory quota exhausted")
            translated = payload.get("responseData", {}).get("translatedText")
            if translated:
                return translated
            raise RuntimeError("MyMemory returned no translation")
        except Exception:
            if attempt + 1 >= attempts:
                raise
            time.sleep(min(8, 1.5 * (attempt + 1)))


def validate_translation(original, translated):
    if not translated.strip():
        return False, "empty"
    if token_multiset(original) != token_multiset(translated):
        return False, "placeholder_mismatch"
    if HAN_RE.search(translated):
        return False, "han_remaining"
    return True, "ok"


def translate_one(text):
    protected, saved = protect(text)
    translated = restore(google_translate(protected, "auto"), saved)
    ok, reason = validate_translation(text, translated)
    if ok:
        return translated
    if reason == "han_remaining":
        protected_again, saved_again = protect(translated)
        translated_again = restore(google_translate(protected_again, "zh-CN"), saved_again)
        ok, _ = validate_translation(text, translated_again)
        if ok:
            return translated_again
    # Translating the original individually is the safest placeholder fallback.
    protected, saved = protect(text)
    translated = restore(google_translate(protected, "zh-CN"), saved)
    ok, reason = validate_translation(text, translated)
    if not ok:
        raise ValueError(f"{reason}: {text[:120]!r} -> {translated[:120]!r}")
    return translated


def make_batches(items, max_items=8, max_chars=2600):
    batches = []
    current = []
    current_chars = 0
    for item in items:
        size = len(item[1])
        if current and (len(current) >= max_items or current_chars + size > max_chars):
            batches.append(current)
            current = []
            current_chars = 0
        current.append(item)
        current_chars += size
    if current:
        batches.append(current)
    return batches


def translate_batch(batch):
    protected_rows = []
    saved_rows = []
    separators = []
    for position, (_index, text) in enumerate(batch):
        protected, saved = protect(text)
        protected_rows.append(protected)
        saved_rows.append(saved)
        if position < len(batch) - 1:
            separators.append(SEP_TEMPLATE.format(position))
    combined_parts = []
    for position, protected in enumerate(protected_rows):
        combined_parts.append(protected)
        if position < len(separators):
            combined_parts.append(separators[position])
    combined = "\n".join(combined_parts)
    try:
        translated_combined = google_translate(combined, "auto")
        pieces = [translated_combined]
        for separator in separators:
            next_pieces = []
            for piece in pieces:
                next_pieces.extend(re.split(rf"\s*{re.escape(separator)}\s*", piece, maxsplit=1))
            pieces = next_pieces
        if len(pieces) != len(batch):
            raise ValueError("separator_count")
        results = []
        for (index, original), piece, saved in zip(batch, pieces, saved_rows):
            translated = restore(piece, saved)
            ok, _reason = validate_translation(original, translated)
            if not ok:
                translated = translate_one(original)
            results.append((index, translated))
        return results
    except Exception:
        return [(index, translate_one(original)) for index, original in batch]


def load_lines(path):
    raw = path.read_text(encoding="utf-8-sig").replace("\r\n", "\n")
    if raw.endswith("\n"):
        raw = raw[:-1]
    return raw.split("\n") if raw else []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--new-root", type=Path, required=True)
    parser.add_argument("--old-root", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    new_mapping = json.loads((args.new_root / "mapping.json").read_text(encoding="utf-8-sig"))
    old_mapping = json.loads((args.old_root / "mapping.json").read_text(encoding="utf-8-sig"))
    old_done = load_lines(args.old_root / "ALL_CHINESE_TEXT_TO_TRANSLATE_done.txt")
    if len(old_done) != len(old_mapping["groups"]):
        raise SystemExit("Old translation line count mismatch")

    known = {}
    for group, translated_line in zip(old_mapping["groups"], old_done):
        translated = decode_single_line(translated_line)
        original = group["original_text"]
        if translated and translated != original:
            known[original] = translated

    outputs = [""] * len(new_mapping["groups"])
    pending = []
    reused = 0
    for index, group in enumerate(new_mapping["groups"]):
        original = group["original_text"]
        candidate = known.get(original, "")
        ok, _ = validate_translation(original, candidate) if candidate else (False, "missing")
        if ok:
            outputs[index] = candidate
            reused += 1
        else:
            pending.append((index, candidate or original))

    cache_path = args.new_root / "translation_cache.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    remaining = []
    for index, text in pending:
        original = new_mapping["groups"][index]["original_text"]
        cached = cache.get(original, "")
        ok, _ = validate_translation(original, cached) if cached else (False, "missing")
        if ok:
            outputs[index] = cached
        else:
            remaining.append((index, text))

    batches = make_batches(remaining)
    print(json.dumps({"groups": len(outputs), "reused": reused, "pending": len(remaining), "batches": len(batches)}, ensure_ascii=False))
    lock = threading.Lock()
    completed = 0
    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        future_map = {executor.submit(translate_batch, batch): batch for batch in batches}
        for future in concurrent.futures.as_completed(future_map):
            batch = future_map[future]
            try:
                results = future.result()
                with lock:
                    for index, translated in results:
                        original = new_mapping["groups"][index]["original_text"]
                        outputs[index] = translated
                        cache[original] = translated
                    cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
            except Exception as error:
                failures.append({"indices": [item[0] for item in batch], "error": str(error)})
            completed += 1
            if completed % 25 == 0 or completed == len(batches):
                print(f"progress {completed}/{len(batches)} failures={len(failures)}", flush=True)

    validation = Counter()
    bad_rows = []
    for index, (group, translated) in enumerate(zip(new_mapping["groups"], outputs), start=1):
        ok, reason = validate_translation(group["original_text"], translated)
        validation[reason] += 1
        if not ok:
            bad_rows.append({"line": index, "reason": reason, "original": group["original_text"], "translated": translated})

    report = {
        "groups": len(outputs),
        "reused": reused,
        "translated_now": len(remaining) - len(failures),
        "validation": dict(validation),
        "failures": failures,
        "bad_rows": bad_rows,
    }
    (args.new_root / "translation_completion_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    if bad_rows or failures:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        raise SystemExit(2)
    content = "\r\n".join(escape_single_line(text) for text in outputs)
    (args.new_root / "ALL_CHINESE_TEXT_TO_TRANSLATE_done.txt").write_text(
        "\ufeff" + content, encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
