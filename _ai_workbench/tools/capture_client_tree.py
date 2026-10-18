"""Capture an immutable web-game client tree with URL/size/SHA-256 evidence.

The browser inventory supplies the exact active runtime scripts and resource
manifests.  Static assets are fetched without browser cookies.  Dynamic API
endpoints, launch tickets, and telemetry are deliberately excluded.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_resource_config import parse as parse_resource_manifest  # noqa: E402


USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ClientCompare/1.0"
SKIP_PATHS = {"/gameMsg.do"}
SKIP_PREFIXES = ("/cdn-cgi/", "/api/")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_relative_path(url: str, base_origin: str) -> Path | None:
    parsed = urllib.parse.urlsplit(url)
    base = urllib.parse.urlsplit(base_origin)
    if (parsed.scheme, parsed.netloc.lower()) != (base.scheme, base.netloc.lower()):
        return None
    decoded = urllib.parse.unquote(parsed.path).lstrip("/")
    pure = PurePosixPath(decoded)
    if not decoded or pure.is_absolute() or ".." in pure.parts:
        return None
    if parsed.path in SKIP_PATHS or any(parsed.path.startswith(prefix) for prefix in SKIP_PREFIXES):
        return None
    return Path(*pure.parts)


def normalize_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, parsed.query, ""))


def fetch_one(url: str, target: Path, expected_size: int = 0) -> dict:
    started = time.time()
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_file():
        size = target.stat().st_size
        if expected_size <= 0 or size == expected_size:
            return {
                "status": 200,
                "contentType": None,
                "bytes": size,
                "sha256": sha256_file(target),
                "elapsedMs": 0,
                "cached": True,
            }

    error_text = ""
    for attempt in range(1, 4):
        part = target.with_name(target.name + ".part")
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
            with urllib.request.urlopen(request, timeout=45) as response:
                status = int(response.getcode() or 0)
                content_type = response.headers.get("Content-Type")
                digest = hashlib.sha256()
                total = 0
                with part.open("wb") as output:
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        output.write(chunk)
                        digest.update(chunk)
                        total += len(chunk)
                if status != 200:
                    raise RuntimeError(f"HTTP {status}")
                os.replace(part, target)
                return {
                    "status": status,
                    "contentType": content_type,
                    "bytes": total,
                    "sha256": digest.hexdigest(),
                    "elapsedMs": int((time.time() - started) * 1000),
                    "cached": False,
                }
        except Exception as exc:  # retry transport/HTTP errors uniformly
            error_text = f"{type(exc).__name__}: {exc}"
            try:
                part.unlink(missing_ok=True)
            except OSError:
                pass
            if attempt < 3:
                time.sleep(attempt * 0.5)
    return {
        "status": 0,
        "contentType": None,
        "bytes": 0,
        "sha256": None,
        "elapsedMs": int((time.time() - started) * 1000),
        "cached": False,
        "error": error_text,
    }


def inventory_urls(inventory: dict, base_origin: str) -> dict[str, dict]:
    urls: dict[str, dict] = {}
    for asset in inventory.get("assets", []):
        raw_url = str(asset.get("url") or "").strip()
        if not raw_url:
            continue
        url = normalize_url(raw_url)
        if safe_relative_path(url, base_origin) is None:
            continue
        urls.setdefault(url, {
            "sources": ["browser_inventory"],
            "kind": asset.get("kind"),
            "name": asset.get("name"),
            "expectedSize": 0,
        })
    return urls


def download_batch(
    urls: dict[str, dict],
    raw_dir: Path,
    base_origin: str,
    workers: int,
    phase: str,
) -> list[dict]:
    jobs = []
    for url, meta in sorted(urls.items()):
        relative = safe_relative_path(url, base_origin)
        if relative is None:
            continue
        jobs.append((url, meta, relative, raw_dir / relative))

    rows: list[dict] = []
    lock = threading.Lock()
    done = 0
    ok = 0
    failed = 0
    bytes_total = 0
    print(f"PHASE={phase} queued={len(jobs)} workers={workers}", flush=True)
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {
            pool.submit(fetch_one, url, target, int(meta.get("expectedSize") or 0)): (url, meta, relative)
            for url, meta, relative, target in jobs
        }
        for future in as_completed(futures):
            url, meta, relative = futures[future]
            result = future.result()
            row = {
                "url": url,
                "path": relative.as_posix(),
                "sources": meta.get("sources", []),
                "kind": meta.get("kind"),
                "name": meta.get("name"),
                "expectedSize": int(meta.get("expectedSize") or 0),
                **result,
            }
            rows.append(row)
            with lock:
                done += 1
                if result.get("sha256"):
                    ok += 1
                    bytes_total += int(result.get("bytes") or 0)
                else:
                    failed += 1
                if done == len(jobs) or done % 500 == 0:
                    print(
                        f"PROGRESS phase={phase} done={done}/{len(jobs)} ok={ok} failed={failed} "
                        f"bytes={bytes_total}",
                        flush=True,
                    )
    return sorted(rows, key=lambda row: row["path"])


def discover_manifest_urls(raw_dir: Path, base_origin: str) -> tuple[dict[str, dict], dict]:
    urls: dict[str, dict] = {}
    decoded: dict[str, dict] = {}
    resource_root = raw_dir / "update/resource"
    for manifest_path in sorted(resource_root.glob("default.res*.bin")):
        parsed = parse_resource_manifest(manifest_path)
        decoded[manifest_path.name] = {
            "prefixCount": parsed["prefix_count"],
            "resourceCount": parsed["resource_count"],
            "groupCount": len(parsed["groups"]),
            "bytesTotal": parsed["bytes_total"],
            "bytesUsed": parsed["bytes_used"],
            "resources": parsed["resources"],
        }
        for item in parsed["resources"]:
            relative = str(item.get("url") or "").lstrip("/")
            if not relative:
                continue
            url = urllib.parse.urljoin(base_origin.rstrip("/") + "/update/resource/", relative)
            url = normalize_url(url)
            meta = urls.setdefault(url, {
                "sources": [],
                "kind": item.get("type"),
                "name": item.get("name"),
                "expectedSize": int(item.get("size") or 0),
            })
            source_name = f"resource_manifest:{manifest_path.name}"
            if source_name not in meta["sources"]:
                meta["sources"].append(source_name)
            if not meta.get("expectedSize") and item.get("size"):
                meta["expectedSize"] = int(item["size"])
    return urls, decoded


def write_manifest(output: Path, payload: dict) -> None:
    manifest_path = output / "manifest.json"
    manifest_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    with (output / "manifest.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "path", "url", "status", "bytes", "expectedSize", "sha256", "contentType",
            "kind", "name", "cached", "elapsedMs", "error", "sources",
        ])
        writer.writeheader()
        for row in payload.get("files", []):
            item = dict(row)
            item["sources"] = ";".join(item.get("sources") or [])
            writer.writerow({key: item.get(key) for key in writer.fieldnames})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--base-origin", required=True)
    parser.add_argument("--workers", type=int, default=16)
    parser.add_argument("--full", action="store_true")
    args = parser.parse_args()

    inventory = json.loads(args.inventory.read_text(encoding="utf-8"))
    output = args.output.resolve()
    raw_dir = output / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    base_origin = args.base_origin.rstrip("/")

    seed_urls = inventory_urls(inventory, base_origin)
    seed_rows = download_batch(seed_urls, raw_dir, base_origin, args.workers, "browser_inventory")
    manifest_urls, decoded = discover_manifest_urls(raw_dir, base_origin)
    (output / "normalized").mkdir(parents=True, exist_ok=True)
    (output / "normalized/resource_manifests_decoded.json").write_text(
        json.dumps(decoded, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    resource_rows: list[dict] = []
    if args.full:
        resource_rows = download_batch(
            manifest_urls,
            raw_dir,
            base_origin,
            args.workers,
            "resource_manifests",
        )

    by_path: dict[str, dict] = {}
    for row in [*seed_rows, *resource_rows]:
        current = by_path.get(row["path"])
        if current is None or (not current.get("sha256") and row.get("sha256")):
            by_path[row["path"]] = row
        elif current:
            current["sources"] = sorted(set((current.get("sources") or []) + (row.get("sources") or [])))

    files = sorted(by_path.values(), key=lambda row: row["path"])
    failures = [row for row in files if not row.get("sha256")]
    payload = {
        "baseOrigin": base_origin,
        "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "browserInventoryId": inventory.get("id"),
        "browserObservedAssets": len(inventory.get("assets", [])),
        "resourceManifestFiles": sorted(decoded),
        "resourceManifestUniqueUrls": len(manifest_urls),
        "fullRequested": bool(args.full),
        "summary": {
            "files": len(files),
            "downloaded": sum(1 for row in files if row.get("sha256")),
            "failed": len(failures),
            "bytes": sum(int(row.get("bytes") or 0) for row in files if row.get("sha256")),
        },
        "files": files,
    }
    write_manifest(output, payload)
    print(json.dumps({"output": str(output), **payload["summary"]}, ensure_ascii=False), flush=True)
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
