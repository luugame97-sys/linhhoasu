"""Prepare TW visual-only candidate from the latest production snapshot."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "temp/client_core_audit_20260902"
OUT = ROOT / "temp/login_tw_full_visual_candidate_20260902"

START_OLD = 'r=d.inChina?"login_bg_tw":"login_bg"'
START_NEW = 'r="login_bg_tw"'
MAIN_OLD = 'AppInfo.inChina?(this.loadingBGImg&&(this.loadingBGImg.visible=!1),this.logo.top=100):(this.loadingBGImg&&(this.loadingBGImg.visible=!0),this.logo.top=49)'
MAIN_NEW = '(this.loadingBGImg&&(this.loadingBGImg.visible=!0),this.logo.top=49)'
TOKEN_OLD = '20260902_login_tw_swap_v1'
TOKEN_NEW = '20260902_login_tw_full_visual_v2'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one occurrence, got {count}")
    return text.replace(old, new)


def main() -> None:
    start = (SOURCE / "js/start.min_52ac8d58.js").read_text(encoding="utf-8")
    main_js = (SOURCE / "js/main.min_a6195824.js").read_text(encoding="utf-8")
    index = (SOURCE / "index.html").read_text(encoding="utf-8")
    start = replace_once(start, START_OLD, START_NEW, "start mapping")
    main_js = replace_once(main_js, MAIN_OLD, MAIN_NEW, "TW visual branch")
    token_count = index.count(TOKEN_OLD)
    if token_count != 2:
        raise RuntimeError(f"index token: expected two occurrences, got {token_count}")
    index = index.replace(TOKEN_OLD, TOKEN_NEW)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "start.min_52ac8d58.js").write_text(start, encoding="utf-8", newline="")
    (OUT / "main.min_a6195824.js").write_text(main_js, encoding="utf-8", newline="")
    (OUT / "index.html").write_text(index, encoding="utf-8", newline="")
    print(f"OUT={OUT}")
    print("START_SWAP=1")
    print("MAIN_VISUAL_BRANCH=1")
    print(f"INDEX_TOKEN={TOKEN_NEW}")


if __name__ == "__main__":
    main()
