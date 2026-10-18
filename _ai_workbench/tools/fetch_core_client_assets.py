"""Fetch only the core client files needed for a first comparison pass."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
import urllib.request
from pathlib import Path


def fetch(url: str, path: Path) -> dict:
    path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 ClientCompare/1.0"})
    started = time.time()
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read()
        status = int(response.getcode() or 0)
        content_type = response.headers.get("Content-Type")
    path.write_bytes(data)
    return {
        "url": url,
        "path": path.as_posix(),
        "status": status,
        "contentType": content_type,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "elapsedMs": int((time.time() - started) * 1000),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-origin", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    base = args.base_origin.rstrip("/")
    output = args.output.resolve()
    raw = output / "raw"
    raw.mkdir(parents=True, exist_ok=True)

    index_url = base + "/"
    index_path = raw / "index.html"
    index_row = fetch(index_url, index_path)
    index_text = index_path.read_text(encoding="utf-8", errors="replace")
    core = {
        "js/egret.min_7d668222.js",
        "js/egret.web.min_587897e9.js",
        "js/egretex.min_37b3ee13.js",
        "js/thirds.min_b052d442.js",
        "js/start.min_52ac8d58.js",
        "js/main.min_a6195824.js",
    }
    core.update(re.findall(r'"(js/[^" ]+\.js)"', index_text))
    rows = [index_row]
    for relative in sorted(core):
        try:
            rows.append(fetch(base + "/" + relative, raw / relative))
        except Exception as exc:
            rows.append({"url": base + "/" + relative, "path": relative, "status": 0, "bytes": 0, "sha256": None, "error": f"{type(exc).__name__}: {exc}"})
    payload = {
        "baseOrigin": base,
        "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "coreFiles": rows,
    }
    (output / "core_manifest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "files": len(rows), "failed": sum(1 for x in rows if not x.get("sha256"))}, ensure_ascii=False))


if __name__ == "__main__":
    main()
