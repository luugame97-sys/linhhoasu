"""Compare two captured Egret client trees without modifying either raw tree."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_resource_config import parse as parse_resource_manifest  # noqa: E402


CORE_PATTERNS = {
    "engine": re.compile(r"(?:^|/)egret(?:\.web)?(?:\.min|_vi_)[^/]*\.js$", re.I),
    "socket": re.compile(r"(?:^|/)egretex(?:\.min|_vi_)[^/]*\.js$", re.I),
    "thirds": re.compile(r"(?:^|/)thirds(?:\.min|_vi_)[^/]*\.js$", re.I),
    "start": re.compile(r"(?:^|/)start(?:\.min|_vi_)[^/]*\.js$", re.I),
    "main": re.compile(r"(?:^|/)main(?:\.min|_vi_)[^/]*\.js$", re.I),
}

KEY_MARKERS = {
    "touch": ["$hitTest", "hitTest", "touchEnabled", "touchChildren", "TOUCH_BEGIN", "TOUCH_END", "TOUCH_TAP", "stage"],
    "view_layer": ["ViewManager", "LayerManager", "checkFullScreenDialog", "showMainUI", "hideMainUI", "showCloud", "hideCloud", "_opens"],
    "mask_loading": ["GuideMask", "GuideHand", "PowerSaving", "LoadingLayer", "CloudComp", "ClickCloseTipLayer", "mask", "scrollRect"],
    "socket_rpc": ["GameSocket", "HTML5WebSocket", "sendPack", "RepeatRpcBlockModel", "msgUid", "ACK", "timeout", "Rpc("],
    "activity": ["ActivityLoginPrivileges", "LoginPrivileges", "Activity9", "10501", "10502"],
    "guards": ["20260831_", "__lhs", "installLhs", "guard"],
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def find_core(root: Path) -> dict[str, Path]:
    found: dict[str, Path] = {}
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()
        for role, pattern in CORE_PATTERNS.items():
            if role not in found and pattern.search(rel):
                found[role] = path
    return found


def marker_counts(data: bytes) -> dict[str, dict[str, int]]:
    text = data.decode("utf-8", "replace")
    return {
        group: {marker: text.count(marker) for marker in markers}
        for group, markers in KEY_MARKERS.items()
    }


def token_summary(data: bytes) -> dict[str, int]:
    text = data.decode("utf-8", "replace")
    strings = re.findall(r"[A-Za-z_$][A-Za-z0-9_$]{2,}", text)
    return {
        "bytes": len(data),
        "asciiTokens": len(strings),
        "uniqueTokens": len(set(strings)),
        "functions": text.count("function"),
        "classTokens": text.count("class"),
        "prototype": text.count("prototype"),
        "rpcCalls": text.count("Rpc("),
        "touchNames": sum(text.count(x) for x in KEY_MARKERS["touch"]),
    }


def parse_manifests(root: Path) -> dict[str, dict]:
    result: dict[str, dict] = {}
    for path in sorted((root / "update/resource").glob("default.res*.bin")):
        try:
            parsed = parse_resource_manifest(path)
        except Exception as exc:
            result[path.name] = {"error": f"{type(exc).__name__}: {exc}"}
            continue
        result[path.name] = {
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "prefixes": parsed["prefixes"],
            "resourceCount": parsed["resource_count"],
            "groupCount": len(parsed["groups"]),
            "resources": parsed["resources"],
            "groups": parsed["groups"],
        }
    return result


def semantic_manifest_diff(left: dict[str, dict], right: dict[str, dict]) -> dict:
    output = {}
    for name in sorted(set(left) | set(right)):
        a, b = left.get(name), right.get(name)
        if not a or not b or "error" in a or "error" in b:
            output[name] = {"left": a, "right": b}
            continue
        amap = {item["name"]: item for item in a["resources"]}
        bmap = {item["name"]: item for item in b["resources"]}
        common = sorted(set(amap) & set(bmap))
        changed = [
            {
                "name": key,
                "left": {k: amap[key].get(k) for k in ("type", "type_code", "url", "size")},
                "right": {k: bmap[key].get(k) for k in ("type", "type_code", "url", "size")},
            }
            for key in common
            if tuple(amap[key].get(k) for k in ("type", "type_code", "url", "size"))
            != tuple(bmap[key].get(k) for k in ("type", "type_code", "url", "size"))
        ]
        output[name] = {
            "leftResourceCount": len(amap),
            "rightResourceCount": len(bmap),
            "common": len(common),
            "leftOnly": len(set(amap) - set(bmap)),
            "rightOnly": len(set(bmap) - set(amap)),
            "changed": len(changed),
            "changedSelected": [item for item in changed if any(token in (item["name"] + " " + item["left"].get("url", "")).lower() for token in ("eui", "guide", "loading", "mask", "cloud", "power", "spine/ui", "touch"))],
            "changedExamples": changed[:80],
        }
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--left", required=True, type=Path, help="known-bad/production capture")
    parser.add_argument("--right", required=True, type=Path, help="known-good/reference capture")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    left, right = args.left.resolve(), args.right.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)

    left_core, right_core = find_core(left / "raw"), find_core(right / "raw")
    core_rows = []
    for role in sorted(set(left_core) | set(right_core)):
        a, b = left_core.get(role), right_core.get(role)
        row = {"role": role, "left": None, "right": None}
        for label, path in (("left", a), ("right", b)):
            if path is None:
                continue
            data = path.read_bytes()
            row[label] = {
                "path": path.relative_to((left if label == "left" else right) / "raw").as_posix(),
                "bytes": len(data),
                "sha256": sha256(path),
                "summary": token_summary(data),
                "markers": marker_counts(data),
            }
        if a is not None and b is not None:
            ad, bd = a.read_bytes(), b.read_bytes()
            row["sameBytes"] = ad == bd
            row["sameSize"] = len(ad) == len(bd)
        core_rows.append(row)

    left_manifests = parse_manifests(left / "raw")
    right_manifests = parse_manifests(right / "raw")
    manifest_diff = semantic_manifest_diff(left_manifests, right_manifests)

    # Compare only names/metadata; raw files remain untouched.  This lets the
    # report expose whether the good and bad builds differ in the exact
    # skeleton/UI/config entries linked to input handling.
    selected_manifest_rows = {}
    for name, row in manifest_diff.items():
        if not isinstance(row, dict):
            continue
        selected_manifest_rows[name] = {
            key: row.get(key)
            for key in ("leftResourceCount", "rightResourceCount", "common", "leftOnly", "rightOnly", "changed", "changedSelected")
            if key in row
        }

    report = {
        "left": str(left),
        "right": str(right),
        "core": core_rows,
        "manifestDiff": manifest_diff,
        "manifestSummary": selected_manifest_rows,
        "keyFindings": [
            "This report is static evidence only; it does not assign root cause.",
            "A difference is actionable only if the dynamic A/B trace links it to the first bad mutation and failed hit-test.",
        ],
    }
    (output / "comparison.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# Client tree comparison",
        f"- Left (production/known-bad): `{left}`",
        f"- Right (VUSA/reference/known-good): `{right}`",
        "- Static comparison only; no root cause is claimed.",
        "",
        "## Core files",
        "| Role | Left file/hash/bytes | Right file/hash/bytes | Same bytes | Key interpretation |",
        "|---|---|---|---|---|",
    ]
    for row in core_rows:
        def describe(label: str) -> str:
            item = row.get(label)
            if not item:
                return "MISSING"
            return f"`{item['path']}` / `{item['sha256'][:16]}` / {item['bytes']}"
        lines.append(f"| {row['role']} | {describe('left')} | {describe('right')} | {row.get('sameBytes', False)} | token={row.get('left',{}).get('summary',{}).get('uniqueTokens','-')} vs {row.get('right',{}).get('summary',{}).get('uniqueTokens','-')}; touch-marker counts require dynamic trace |")
    lines.extend(["", "## Resource manifest summary", "| Manifest | Left resources | Right resources | Common | Left only | Right only | Changed | Selected changed |", "|---|---:|---:|---:|---:|---:|---:|---:|"])
    for name, row in selected_manifest_rows.items():
        if "leftResourceCount" not in row:
            continue
        lines.append(f"| `{name}` | {row['leftResourceCount']} | {row['rightResourceCount']} | {row['common']} | {row['leftOnly']} | {row['rightOnly']} | {row['changed']} | {len(row.get('changedSelected') or [])} |")
    lines.extend(["", "## Guardrail", "A static difference is not a fix target by itself. Next step is synchronized A/B runtime tracing of touch target, hit-test, ViewManager/layer/mask, lifecycle mutation, and RPC ACK state."])
    (output / "comparison.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), "coreRoles": len(core_rows), "manifests": len(manifest_diff)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
