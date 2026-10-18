"""Read-only HTTP/resource comparison for the LHS game entry and VUSA page."""
from __future__ import annotations

import json
import re
import time
from dataclasses import asdict, dataclass
from html import unescape
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


TARGETS = {
    "lhs_game": "http://103.116.105.154:81/",
    "vusa": "https://tutien.vusagaming.net/",
}
OUT = Path(__file__).resolve().parents[1] / "temp" / "public_web_performance_compare_20260901.json"


@dataclass
class Resource:
    url: str
    kind: str
    status: int | None = None
    bytes: int | None = None
    elapsed_ms: float | None = None
    content_type: str = ""
    cache_control: str = ""
    content_encoding: str = ""
    error: str = ""


def request(url: str, method: str = "GET", timeout: int = 25, headers: dict | None = None):
    req = Request(url, method=method, headers={"User-Agent": "LHS-readonly-audit/1.0", **(headers or {})})
    start = time.perf_counter()
    try:
        with urlopen(req, timeout=timeout) as response:
            body = response.read() if method != "HEAD" else b""
            elapsed = (time.perf_counter() - start) * 1000
            return response.status, body, elapsed, dict(response.headers), ""
    except Exception as exc:
        return None, b"", (time.perf_counter() - start) * 1000, {}, str(exc)


def resources_from_html(base: str, body: bytes):
    text = body.decode("utf-8", "replace")
    found = []
    seen = set()
    patterns = [
        ("script", r"<script[^>]+src=[\"']([^\"']+)[\"']"),
        ("stylesheet", r"<link[^>]+href=[\"']([^\"']+)[\"'][^>]*rel=[\"']stylesheet[\"']"),
        ("stylesheet", r"<link[^>]+rel=[\"']stylesheet[\"'][^>]+href=[\"']([^\"']+)[\"']"),
        ("preload", r"<link[^>]+href=[\"']([^\"']+)[\"'][^>]*rel=[\"']preload[\"']"),
        ("image", r"<img[^>]+src=[\"']([^\"']+)[\"']"),
        ("iframe", r"<iframe[^>]+(?:src|data-src)=[\"']([^\"']+)[\"']"),
    ]
    for kind, pattern in patterns:
        for raw in re.findall(pattern, text, flags=re.I):
            raw = unescape(raw.strip())
            if not raw or raw.startswith("data:") or raw.startswith("about:"):
                continue
            absolute = urljoin(base, raw)
            if absolute in seen:
                continue
            seen.add(absolute)
            found.append((kind, absolute))
    return found


def inspect_target(name: str, base: str):
    status, body, elapsed, headers, error = request(base)
    html_info = {
        "url": base,
        "status": status,
        "bytes": len(body),
        "elapsed_ms": round(elapsed, 2),
        "content_type": headers.get("Content-Type", ""),
        "cache_control": headers.get("Cache-Control", ""),
        "content_encoding": headers.get("Content-Encoding", ""),
        "server": headers.get("Server", ""),
        "error": error,
    }
    resources = []
    for kind, url in resources_from_html(base, body)[:120]:
        rs, rbody, relapsed, rh, rerr = request(url, method="HEAD")
        # A few CDNs reject HEAD; use a one-byte range request for metadata.
        if rs is None or rs >= 400 or (not rh.get("Content-Length") and not rh.get("ETag")):
            rs, rbody, relapsed, rh, rerr = request(url, headers={"Range": "bytes=0-0"})
        size = None
        if rh.get("Content-Length", "").isdigit():
            size = int(rh["Content-Length"])
        elif rbody:
            size = len(rbody)
        resources.append(asdict(Resource(url=url, kind=kind, status=rs, bytes=size,
                                         elapsed_ms=round(relapsed, 2),
                                         content_type=rh.get("Content-Type", ""),
                                         cache_control=rh.get("Cache-Control", ""),
                                         content_encoding=rh.get("Content-Encoding", ""),
                                         error=rerr)))
    known = [r for r in resources if r["bytes"] is not None]
    summary = {
        "resource_count": len(resources),
        "script_count": sum(r["kind"] == "script" for r in resources),
        "stylesheet_count": sum(r["kind"] == "stylesheet" for r in resources),
        "image_count": sum(r["kind"] == "image" for r in resources),
        "known_bytes_sum": sum(r["bytes"] for r in known),
        "known_bytes_count": len(known),
        "error_count": sum((r["status"] or 0) >= 400 or bool(r["error"]) for r in resources),
        "compressed_resources": sum(bool(r["content_encoding"]) for r in resources),
    }
    return {"html": html_info, "summary": summary, "resources": resources}


def main():
    data = {"readOnly": True, "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "targets": {name: inspect_target(name, url) for name, url in TARGETS.items()}}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"OUT={OUT}")


if __name__ == "__main__":
    main()
