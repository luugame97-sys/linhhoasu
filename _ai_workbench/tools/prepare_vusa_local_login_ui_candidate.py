"""Restore the local account/password UI in the VUSA main bundle for test QA."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
VUSA_MAIN = ROOT / "_ai_workbench/temp/tutien_vusa_reference_20260831_214348/raw/js/main.min_vi_1e47377c.js"
HYBRID_INDEX = ROOT / "_ai_workbench/temp/vusa_hybrid_test_candidate_20260831_164048/linhhoasu/webgame/game/index.html"
OUT = ROOT / "_ai_workbench/temp/vusa_local_login_ui_candidate_20260901"
HIDE_BLOCK = (
    b",this.textAccount.visible=!1,this.textPassword.visible=!1,"
    b"this.m_dropBtn.visible=!1,this.m_accountListView.visible=!1,"
    b"this.btn_regist.visible=!1,this.btn_login.label=\"V\xc3\xa0o game\","
    b"this.btn_login.left=this.btn_login.right=NaN,"
    b"this.btn_login.horizontalCenter=0"
)
OLD_CACHE = b"20260831_vusa_hybrid_test_v1"
NEW_CACHE = b"20260901_vusa_local_login_ui_v2"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    if OUT.exists() and any(OUT.iterdir()):
        raise FileExistsError(OUT)

    main_source = VUSA_MAIN.read_bytes()
    if main_source.count(HIDE_BLOCK) != 1:
        raise RuntimeError(f"unexpected VUSA login-hide block count: {main_source.count(HIDE_BLOCK)}")
    main_candidate = main_source.replace(HIDE_BLOCK, b"", 1)

    index_source = HYBRID_INDEX.read_bytes()
    if index_source.count(OLD_CACHE) != 3:
        raise RuntimeError(f"unexpected hybrid cache marker count: {index_source.count(OLD_CACHE)}")
    index_candidate = index_source.replace(OLD_CACHE, NEW_CACHE)

    OUT.mkdir(parents=True, exist_ok=True)
    main_path = OUT / "js/main.min_vi_1e47377c.js"
    index_path = OUT / "index.html"
    main_path.parent.mkdir(parents=True)
    main_path.write_bytes(main_candidate)
    index_path.write_bytes(index_candidate)

    manifest = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "scope": "test-vps-only",
        "source": {
            "main": str(VUSA_MAIN),
            "index": str(HYBRID_INDEX),
            "mainSha256": sha256(VUSA_MAIN),
            "indexSha256": sha256(HYBRID_INDEX),
        },
        "candidate": {
            "main": str(main_path),
            "index": str(index_path),
            "mainSha256": sha256(main_path),
            "indexSha256": sha256(index_path),
        },
        "contract": {
            "removedLoginHideBlockCount": 1,
            "bytesRemovedFromMain": len(main_source) - len(main_candidate),
            "mainPrefixUnchanged": main_candidate[: main_source.index(HIDE_BLOCK)]
            == main_source[: main_source.index(HIDE_BLOCK)],
            "mainSuffixUnchanged": main_candidate[main_source.index(HIDE_BLOCK) :]
            == main_source[main_source.index(HIDE_BLOCK) + len(HIDE_BLOCK) :],
            "cacheMarker": NEW_CACHE.decode("ascii"),
        },
    }
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
