"""Capture the client actually served by a production game origin.

This is the production counterpart of capture_client_tree.py.  It fetches the
served index and its static scripts/manifests first, then expands the exact
resource manifests and downloads all same-origin static resources.  It never
uses game cookies, credentials, API requests, or websocket traffic.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from capture_client_tree import (  # noqa: E402
    USER_AGENT,
    download_batch,
    discover_manifest_urls,
    normalize_url,
    safe_relative_path,
    fetch_one,
    write_manifest,
)


def get(url: str) -> tuple[int, str | None, bytes]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urllib.request.urlopen(request, timeout=45) as response:
        return int(response.getcode() or 0), response.headers.get("Content-Type"), response.read()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-origin", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--workers", type=int, default=24)
    args = parser.parse_args()

    base = args.base_origin.rstrip("/")
    output = args.output.resolve()
    raw = output / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    (output / "normalized").mkdir(parents=True, exist_ok=True)

    index_url = base + "/"
    status, content_type, index_bytes = get(index_url)
    (raw / "index.html").write_bytes(index_bytes)
    index_text = index_bytes.decode("utf-8", "replace")

    # Runtime scripts and the hashed resource manifests are the only files
    # needed to discover the complete static client tree.
    paths: set[str] = set()
    for match in re.finditer(r"(?:src|href)=[\"']([^\"']+)[\"']", index_text, flags=re.I):
        value = urllib.parse.urljoin(base + "/", match.group(1))
        rel = safe_relative_path(value, base)
        if rel:
            paths.add(rel.as_posix())
    for match in re.finditer(r"(?:default\.res[^\"'<> ]*\.bin|[A-Za-z0-9_.-]+\.bin)", index_text):
        name = match.group(0)
        # Index manifest names are relative to /update/resource/ in this
        # client family; only include known default.res files here.
        if name.startswith("default.res"):
            paths.add("update/resource/" + name)

    seed_urls = {
        normalize_url(base + "/" + rel): {
            "sources": ["production_index"],
            "kind": "seed",
            "name": Path(rel).name,
            "expectedSize": 0,
        }
        for rel in sorted(paths)
    }
    # Download the seed set directly; index.html is already present.
    seed_rows = []
    for url, meta in seed_urls.items():
        rel = safe_relative_path(url, base)
        if rel is None or rel.as_posix() == "index.html":
            continue
        row = fetch_one(url, raw / rel, 0)
        seed_rows.append({
            "url": url,
            "path": rel.as_posix(),
            "sources": meta["sources"],
            "kind": meta["kind"],
            "name": meta["name"],
            "expectedSize": 0,
            **row,
        })

    manifest_urls, decoded = discover_manifest_urls(raw, base)
    (output / "normalized/resource_manifests_decoded.json").write_text(
        json.dumps(decoded, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    resource_rows = download_batch(manifest_urls, raw, base, args.workers, "resource_manifests")

    files = [{
        "url": index_url,
        "path": "index.html",
        "sources": ["production_index"],
        "kind": "html",
        "name": "index.html",
        "status": status,
        "contentType": content_type,
        "bytes": len(index_bytes),
        "sha256": __import__("hashlib").sha256(index_bytes).hexdigest(),
        "elapsedMs": 0,
        "cached": False,
        "expectedSize": 0,
    }]
    by_path = {row["path"]: row for row in files}
    for row in [*seed_rows, *resource_rows]:
        current = by_path.get(row["path"])
        if current is None or (not current.get("sha256") and row.get("sha256")):
            by_path[row["path"]] = row
        elif current:
            current["sources"] = sorted(set((current.get("sources") or []) + (row.get("sources") or [])))

    ordered = sorted(by_path.values(), key=lambda row: row["path"])
    failures = [row for row in ordered if not row.get("sha256")]
    payload = {
        "baseOrigin": base,
        "capturedAt": __import__("time").strftime("%Y-%m-%dT%H:%M:%SZ", __import__("time").gmtime()),
        "resourceManifestFiles": sorted(decoded),
        "resourceManifestUniqueUrls": len(manifest_urls),
        "summary": {
            "files": len(ordered),
            "downloaded": sum(1 for row in ordered if row.get("sha256")),
            "failed": len(failures),
            "bytes": sum(int(row.get("bytes") or 0) for row in ordered if row.get("sha256")),
        },
        "files": ordered,
    }
    write_manifest(output, payload)
    print(json.dumps({"output": str(output), **payload["summary"]}, ensure_ascii=False), flush=True)
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
