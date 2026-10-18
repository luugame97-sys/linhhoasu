"""Build a test-only VUSA runtime candidate while retaining local login/API routing."""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TEST_CAPTURE = sorted((ROOT / "_ai_workbench/temp").glob("lhs_test_vps_192168200151_*/raw"))[-1]
TEST_GAME = TEST_CAPTURE / "linhhoasu/webgame/game"
VUSA_GAME = ROOT / "_ai_workbench/temp/tutien_vusa_reference_20260831_214348/raw"
VUSA_RUNTIME = ROOT / "_ai_workbench/temp/tutien_vusa_reference_20260831_214348/normalized/runtime_inline_0.js"
STAMP = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
OUT = ROOT / "_ai_workbench/temp" / f"vusa_hybrid_test_candidate_{STAMP}"
GAME_OUT = OUT / "linhhoasu/webgame/game"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract_block(text: str, start: str, end: str) -> str:
    left = text.index(start)
    right = text.index(end, left)
    return text[left:right]


def main() -> None:
    source_index = (TEST_GAME / "index.html").read_text(encoding="utf-8")
    vusa_runtime = VUSA_RUNTIME.read_text(encoding="utf-8")

    old_socket = extract_block(
        source_index,
        "\tvar installLhsSocketSendGuard = function () {",
        "\tvar installLhsTopCombatProtocolGuard = function () {",
    )
    new_socket = extract_block(
        vusa_runtime,
        "\tvar installLhsSocketSendGuard = function () {",
        "\tvar installLhsTopCombatProtocolGuard = function () {",
    )
    if "__lhsNativeSendGuardV2" not in old_socket:
        raise RuntimeError("test index is not the expected V2 baseline")
    if "__lhsNativeSendGuardV4" not in new_socket or "callNativeSend" not in new_socket:
        raise RuntimeError("VUSA V4 socket block missing")

    index = source_index.replace(old_socket, new_socket, 1)
    replacements = {
        '"js/egret.min_7d668222.js"': '"js/egret.min_vi_45030898.js"',
        '"js/start.min_52ac8d58.js"': '"js/start.min_vi_fe8efd0a.js"',
        '"js/main.min_a6195824.js"': '"js/main.min_vi_1e47377c.js"',
        "var isMainScript = /js\\/main\\.min_a6195824\\.js$/.test(src);":
            "var isMainScript = /js\\/main\\.min_vi_1e47377c\\.js$/.test(src);",
        "if (/js\\/(egretex\\.min_37b3ee13|main\\.min_a6195824)\\.js$/.test(src)) {":
            "if (/js\\/(egretex\\.min_37b3ee13|main\\.min_vi_1e47377c)\\.js$/.test(src)) {",
        "src += '?v=20260731_fsm9';": "src += '?v=20260831_vusa_hybrid_test_v1';",
    }
    for old, new in replacements.items():
        count = index.count(old)
        if count != 1:
            raise RuntimeError(f"index anchor count for {old!r}: {count}")
        index = index.replace(old, new, 1)

    # The VUSA engine defaults to this font. Add it without replacing the local
    # login page, API routing, game assets, or resource manifests.
    font_head = """\n\t<link rel=\"preload\" href=\"./fonts/vusagaming_a3b36b35.woff2?v=20260831_vusa_hybrid_test_v1\" as=\"font\" type=\"font/woff2\" crossorigin>\n\t<style>@font-face{font-family:'VusaGaming';src:url('./fonts/vusagaming_a3b36b35.woff2?v=20260831_vusa_hybrid_test_v1') format('woff2');font-display:swap}</style>\n"""
    head_anchor = "</head>"
    if index.count(head_anchor) != 1:
        raise RuntimeError("head close anchor missing")
    index = index.replace(head_anchor, font_head + head_anchor, 1)

    if "backendHost = query.get('backendHost')" not in index:
        raise RuntimeError("local backend routing was not preserved")
    if "apiBase = 'http://' + backendHost + ':' + httpPort" not in index:
        raise RuntimeError("local HTTP login routing was not preserved")
    if "__lhsNativeSendGuardV2" in index or "__lhsNativeSendGuardV4" not in index:
        raise RuntimeError("socket wrapper replacement incomplete")

    files = {
        "index.html": index.encode("utf-8"),
        "js/egret.min_vi_45030898.js": (VUSA_GAME / "js/egret.min_vi_45030898.js").read_bytes(),
        "js/start.min_vi_fe8efd0a.js": (VUSA_GAME / "js/start.min_vi_fe8efd0a.js").read_bytes(),
        "js/main.min_vi_1e47377c.js": (VUSA_GAME / "js/main.min_vi_1e47377c.js").read_bytes(),
        "fonts/vusagaming_a3b36b35.woff2": (VUSA_GAME / "fonts/vusagaming_a3b36b35.woff2").read_bytes(),
    }
    for relative, data in files.items():
        path = GAME_OUT / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    main_text = files["js/main.min_vi_1e47377c.js"].decode("utf-8", "replace")
    required_login = ["LoginToken", "LoginInput", "RegistUI", "_LoginLaunch", "sendCheckAccount"]
    missing_login = [marker for marker in required_login if marker not in main_text]
    if missing_login:
        raise RuntimeError("VUSA runtime lacks local login markers: " + ", ".join(missing_login))

    manifest = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "scope": "test VPS 192.168.200.151 only",
        "keptFromTest": ["index shell", "local account/password login", "HTTP/WS routing", "resource tree", "EUI", "config"],
        "takenFromVusa": ["egret engine", "start runtime", "main runtime", "socket V4 wrapper", "VusaGaming font"],
        "files": [
            {
                "path": relative,
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
            for relative, data in files.items()
        ],
        "loginMarkers": {marker: main_text.count(marker) for marker in required_login},
        "guards": {
            "V2": index.count("__lhsNativeSendGuardV2"),
            "V4": index.count("__lhsNativeSendGuardV4"),
            "battle": main_text.count("lhsBattleGuard"),
            "boxContinuation": main_text.count("lhsBoxContinue"),
        },
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(OUT), "files": len(files), "guards": manifest["guards"], "loginMarkers": manifest["loginMarkers"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
