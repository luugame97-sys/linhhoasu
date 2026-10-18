#!/usr/bin/env python3
"""Patch the game login button to open the canonical invite registration page."""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / 'linhhoasu/webgame/game/js/main.min_a6195824.js'
INDEX = ROOT / 'linhhoasu/webgame/game/index.html'
OLD_TOKEN = '20260831_touch_alpha_watchdog_guard22'
NEW_TOKEN = '20260831_register_redirect_v1'
REGISTER_URL = 'http://103.116.105.154:81/register.html?inviteCode=TY7C1A'

text = BUNDLE.read_text(encoding='utf-8')
prefix = 'b.onRegClick=function(){return R(this,void 0,void 0,function(){var e=this;'
if text.count(prefix) != 1:
    raise RuntimeError(f'expected one login registration handler, found {text.count(prefix)}')
start = text.index(prefix)
end_marker = ',rbi.LAYER_LEVEL='
end = text.index(end_marker, start)
replacement = (
    'b.onRegClick=function(){var t="'
    + REGISTER_URL
    + '";if(RuntimeUtil.isRuntime&&platform&&platform.openUrl){try{platform.openUrl(t);return}catch(e){}}if("undefined"!=typeof window&&window.location){window.location.href=t}}'
)
BUNDLE.write_text(text[:start] + replacement + text[end:], encoding='utf-8', newline='')

idx = INDEX.read_text(encoding='utf-8')
count = idx.count(OLD_TOKEN)
if count != 2:
    raise RuntimeError(f'expected two old cache tokens, found {count}')
INDEX.write_text(idx.replace(OLD_TOKEN, NEW_TOKEN), encoding='utf-8', newline='')

print(f'PATCHED_URL={REGISTER_URL}')
print(f'CACHE_TOKEN={NEW_TOKEN}')
