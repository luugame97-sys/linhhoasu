"""Compare the test-VPS core client against production and VUSA reference."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TEST_ROOT = sorted((ROOT / "_ai_workbench/temp").glob("lhs_test_vps_192168200151_*/raw"))[-1]
PROD_ROOT = ROOT / "_ai_workbench/temp/lhs_freeze_prod_20260831_214348/raw"
VUSA_ROOT = ROOT / "_ai_workbench/temp/tutien_vusa_reference_20260831_214348/raw"

PATHS = {
    "index": "linhhoasu/webgame/game/index.html",
    "engine": "linhhoasu/webgame/game/js/egret.min_7d668222.js",
    "web_engine": "linhhoasu/webgame/game/js/egret.web.min_587897e9.js",
    "socket": "linhhoasu/webgame/game/js/egretex.min_37b3ee13.js",
    "thirds": "linhhoasu/webgame/game/js/thirds.min_b052d442.js",
    "start": "linhhoasu/webgame/game/js/start.min_52ac8d58.js",
    "main": "linhhoasu/webgame/game/js/main.min_a6195824.js",
    "start_manifest": "linhhoasu/webgame/game/update/resource/default.res_326514c1.bin",
    "main_manifest": "linhhoasu/webgame/game/update/resource/default.res_main_c669f2c0.bin",
    "cn_manifest": "linhhoasu/webgame/game/update/resource/default.res_cn_main_f70d4753.bin",
    "eui": "linhhoasu/webgame/game/update/resource/assets/cfg/gameEui_18e11b8e.bin",
    "config": "linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin",
}

MARKERS = [
    "installLhsActionCompletionGuards",
    "installLhsSocketSendGuard",
    "__lhsNativeSendGuardV2",
    "__lhsNativeSendGuardV4",
    "installLhsTopCombatProtocolGuard",
    "[LHS][TouchTrace]",
    "[LHS][TouchRecovery]",
    "dispatchEventWith(egret.TouchEvent.TOUCH_TAP",
    "lhsBattleGuard",
    "lhsBoxContinue",
    "lhsSelectGuard",
    "lhsLandOpenSeq",
    "lhsMineOpenSeq",
    "lhsRpcTimerMap",
    "RepeatRpcBlockModel",
    "lhsLoginUi",
    "20260831_tien_duyen_fix_v1",
    "20260731_fsm9",
]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def read(root: Path, rel: str) -> tuple[Path | None, bytes | None]:
    path = root / rel
    return (path, path.read_bytes()) if path.is_file() else (None, None)


def path_for(root: Path, label: str, role: str) -> Path:
    rel = PATHS[role]
    if label == "test":
        return root / rel
    if role == "index":
        return root / ("index.runtime.html" if label == "vusa" and (root / "index.runtime.html").is_file() else "index.html")
    if label == "vusa" and role in {"engine", "main", "start"}:
        return root / "js" / ({"engine": "egret.min_vi_45030898.js", "main": "main.min_vi_1e47377c.js", "start": "start.min_vi_fe8efd0a.js"}[role])
    return root / "/".join(rel.split("/")[3:])


def text_markers(data: bytes | None) -> dict[str, int]:
    text = (data or b"").decode("utf-8", "replace")
    return {marker: text.count(marker) for marker in MARKERS}


def source_summary(data: bytes | None) -> dict[str, int]:
    text = (data or b"").decode("utf-8", "replace")
    return {
        "bytes": len(data or b""),
        "functions": text.count("function"),
        "prototypes": text.count("prototype"),
        "touchEnabled": text.count("touchEnabled"),
        "touchChildren": text.count("touchChildren"),
        "hitTest": text.count("hitTest"),
        "rpcCalls": text.count("Rpc("),
        "timeouts": text.count("setTimeout"),
    }


def main() -> None:
    roots = {"test": TEST_ROOT, "production": PROD_ROOT, "vusa": VUSA_ROOT}
    payload = {"roots": {key: str(value) for key, value in roots.items()}, "files": {}, "findings": []}
    for role, rel in PATHS.items():
        rows = {}
        for label, root in roots.items():
            path = path_for(root, label, role)
            data = path.read_bytes() if path.is_file() else None
            if data is None:
                rows[label] = None
                continue
            rows[label] = {
                "path": str(path),
                "bytes": len(data),
                "sha256": sha256(path),
                "summary": source_summary(data) if role in {"index", "engine", "web_engine", "socket", "thirds", "start", "main"} else {"bytes": len(data)},
                "markers": text_markers(data) if role in {"index", "main", "start"} else {},
            }
        payload["files"][role] = rows

    test_main = path_for(roots["test"], "test", "main").read_bytes()
    prod_main = path_for(roots["production"], "production", "main").read_bytes()
    vusa_main = path_for(roots["vusa"], "vusa", "main").read_bytes()
    test_index = path_for(roots["test"], "test", "index").read_text(encoding="utf-8", errors="replace")
    prod_index = path_for(roots["production"], "production", "index").read_text(encoding="utf-8", errors="replace")
    vusa_index = path_for(roots["vusa"], "vusa", "index").read_text(encoding="utf-8", errors="replace")

    payload["findings"].extend([
        {
            "id": "test-vps-client-is-pre-patch-lineage",
            "evidence": {
                "testMain": sha256(path_for(roots["test"], "test", "main")),
                "productionMain": sha256(path_for(roots["production"], "production", "main")),
                "vusaMain": sha256(path_for(roots["vusa"], "vusa", "main")),
            },
            "meaning": "Test VPS client is a third build; it must be tested as its own baseline, not assumed identical to either side.",
        },
        {
            "id": "shared-original-socket",
            "evidence": {
                "testEqualsProduction": path_for(roots["test"], "test", "socket").read_bytes() == path_for(roots["production"], "production", "socket").read_bytes(),
                "productionEqualsVusa": path_for(roots["production"], "production", "socket").read_bytes() == path_for(roots["vusa"], "vusa", "socket").read_bytes(),
            },
            "meaning": "The difference is wrapper/loader behavior, not the original egretex payload.",
        },
        {
            "id": "test-wrapper",
            "evidence": {
                "testV2": test_index.count("__lhsNativeSendGuardV2"),
                "testV4": test_index.count("__lhsNativeSendGuardV4"),
                "productionV2": prod_index.count("__lhsNativeSendGuardV2"),
                "vusaV4": vusa_index.count("__lhsNativeSendGuardV4"),
            },
            "meaning": "Test VPS currently carries the same V2 socket wrapper family as production; it is not yet the VUSA V4 candidate.",
        },
        {
            "id": "battle-recovery-lineage",
            "evidence": {
                "testLhsBattleGuard": test_main.count(b"lhsBattleGuard"),
                "productionLhsBattleGuard": prod_main.count(b"lhsBattleGuard"),
                "vusaLhsBattleGuard": vusa_main.count(b"lhsBattleGuard"),
                "testLhsBoxContinue": test_main.count(b"lhsBoxContinue"),
                "productionLhsBoxContinue": prod_main.count(b"lhsBoxContinue"),
                "vusaLhsBoxContinue": vusa_main.count(b"lhsBoxContinue"),
            },
            "meaning": "Test VPS has recovery code in its older main build; this makes it useful for a controlled server/client matrix, but not proof that the recovery is sufficient.",
        },
    ])

    (ROOT / "_ai_workbench/temp/lhs_test_vps_core_compare.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [
        "# Test VPS core client comparison",
        f"- Test root: `{TEST_ROOT}`",
        f"- Production capture: `{PROD_ROOT}`",
        f"- VUSA reference: `{VUSA_ROOT}`",
        "- Read-only evidence; no production/test mutation performed.",
        "",
        "## Core hashes",
        "| Role | Test VPS | Production | VUSA reference |",
        "|---|---|---|---|",
    ]
    for role, rows in payload["files"].items():
        values=[]
        for label in ("test","production","vusa"):
            x=rows.get(label)
            values.append("MISSING" if not x else f"`{x['sha256'][:16]}` / {x['bytes']} bytes")
        lines.append(f"| {role} | {values[0]} | {values[1]} | {values[2]} |")
    lines += ["", "## Findings"]
    for finding in payload["findings"]:
        lines.append(f"### {finding['id']}")
        lines.append(f"- {finding['meaning']}")
        lines.append("- Evidence: `" + json.dumps(finding["evidence"], ensure_ascii=False, sort_keys=True) + "`")
    lines += ["", "## Next gate", "Start one test process only, expose it on an isolated HTTP/WS port, then run A/B matrix: test VPS current client, VUSA V4 wrapper candidate, and only after that the BattleRaid/BoxReward candidate. Capture synchronized RPC/hit-test/UI state before claiming a cause."]
    (ROOT / "_ai_workbench/temp/lhs_test_vps_core_compare.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"testRoot": str(TEST_ROOT), "output": str(ROOT / '_ai_workbench/temp/lhs_test_vps_core_compare.md'), "findings": len(payload['findings'])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
