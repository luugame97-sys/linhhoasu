from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "_ai_workbench/tools"))
from build_pet_resource_manifest_20260929 import parse, encode  # noqa: E402


MAIN = ROOT / "_ai_workbench/temp/remote_main_pet_vusa_20260930.bin"
CN = ROOT / "linhhoasu/webgame/game/update/resource/default.res_cn_main_f70d4753.bin"
RESOURCE_ROOT = ROOT / "linhhoasu/webgame/game/update/resource"
OUT = ROOT / "_ai_workbench/temp/role_lian_manifest_20260930"
OUT_FILE = OUT / "default.res_main_c669f2c0_pet_vusa_lian_20260930.bin"
TARGETS = {"sp_lian_3010", "sp_lian_3040", "sp_lian_3041", "sp_lian_3080"}


def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    base_bytes = MAIN.read_bytes()
    base = parse(base_bytes)
    source = parse(CN)
    existing_names = {row["name"] for row in base["resources"]}
    prefixes = list(base["prefixes"])
    added = []

    for row in source["resources"]:
        if not any(row["name"].startswith(target) for target in TARGETS):
            continue
        if row["name"] in existing_names:
            continue
        source_prefix = source["prefixes"][row["prefix"]]
        if source_prefix not in prefixes:
            prefixes.append(source_prefix)
        item = dict(row)
        item["prefix"] = prefixes.index(source_prefix)
        asset = RESOURCE_ROOT / item["url"]
        if not asset.is_file():
            raise FileNotFoundError(asset)
        if item.get("size", 0) and item["size"] != asset.stat().st_size:
            raise RuntimeError(f"ASSET_SIZE_MISMATCH:{asset}")
        base["resources"].append(item)
        existing_names.add(item["name"])
        added.append({"name": item["name"], "url": item["url"], "type": item["type"], "bytes": asset.stat().st_size})

    expected = 12
    if len(added) != expected:
        raise RuntimeError(f"Lian resource delta expected {expected}, got {len(added)}")
    base["prefixes"] = prefixes
    candidate = encode(base)
    check = parse(candidate)
    check_names = {row["name"] for row in check["resources"]}
    if not all(row["name"] in check_names for row in added):
        raise RuntimeError("ROUNDTRIP_RESOURCE_MISSING")
    if any(row["name"] in existing_names for row in []):
        raise RuntimeError("UNEXPECTED")
    OUT_FILE.write_bytes(candidate)
    report = {
        "result": "PASS",
        "base": {"path": str(MAIN), "bytes": len(base_bytes), "sha256": sha(base_bytes), "resources": len(parse(base_bytes)["resources"])},
        "candidate": {"path": str(OUT_FILE), "bytes": len(candidate), "sha256": sha(candidate), "resources": len(check["resources"])},
        "added": added,
        "productionWrites": 0,
    }
    (OUT / "build.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
