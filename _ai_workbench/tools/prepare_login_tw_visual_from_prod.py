from __future__ import annotations
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "temp/client_core_audit_20260902"
OUT = ROOT / "temp/login_tw_visual_candidate_20260902"
START_OLD = 'r=d.inChina?"login_bg":"login_bg_tw"'
START_NEW = 'r=d.inChina?"login_bg_tw":"login_bg"'
MAIN_OLD = 'AppInfo.inChina?(this.loadingBGImg&&(this.loadingBGImg.visible=!1),this.logo.top=100):(this.loadingBGImg&&(this.loadingBGImg.visible=!0),this.logo.top=49)'
MAIN_NEW = '(this.loadingBGImg&&(this.loadingBGImg.visible=!0),this.logo.top=49)'
OLD_TOKEN = '20260831_tien_duyen_fix_v1'
NEW_TOKEN = '20260902_login_tw_visual_v1'

def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 occurrence, got {count}')
    return text.replace(old, new)

def main() -> None:
    start = (SOURCE / 'js/start.min_52ac8d58.js').read_text(encoding='utf-8')
    main_js = (SOURCE / 'js/main.min_a6195824.js').read_text(encoding='utf-8')
    index = (SOURCE / 'index.html').read_text(encoding='utf-8')
    start = once(start, START_OLD, START_NEW, 'start TW mapping')
    main_js = once(main_js, MAIN_OLD, MAIN_NEW, 'main TW visual')
    if index.count(OLD_TOKEN) != 2:
        raise RuntimeError(f'index token expected 2 occurrences, got {index.count(OLD_TOKEN)}')
    index = index.replace(OLD_TOKEN, NEW_TOKEN)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'start.min_52ac8d58.js').write_text(start, encoding='utf-8', newline='')
    (OUT / 'main.min_a6195824.js').write_text(main_js, encoding='utf-8', newline='')
    (OUT / 'index.html').write_text(index, encoding='utf-8', newline='')
    print(f'OUT={OUT}')
    print('CHANGED_FILES=3')
    print('START_MAPPING_SWAP=1')
    print('MAIN_TW_VISUAL=1')
    print(f'CACHE_TOKEN={NEW_TOKEN}')

if __name__ == '__main__':
    main()
