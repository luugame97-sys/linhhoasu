"""Prepare isolated native Egret fixture, with real skins/fonts/config and no account."""
import json
from pathlib import Path
from decode_bin_manifest import decode
from audit_item_count_font_20260907 import read_pack

ROOT=Path(__file__).resolve().parents[2]
DEST=ROOT/'_ai_workbench/temp/item_quantity_20260907'
GAME=ROOT/'linhhoasu/webgame/game'
DEST.mkdir(exist_ok=True)
skins=decode((GAME/'update/resource/assets/cfg/gameEui_18e11b8e.bin').read_bytes())['value']
(DEST/'skins.json').write_text(json.dumps(skins,ensure_ascii=False),encoding='utf-8')
fonts={}
for rel in ['fnt_pack_128141c4.bin','lang_cn/fnt_lang_pack_3f07747f.bin']:
    fonts.update(read_pack(GAME/'update/resource/assets/cfg'/rel))
(DEST/'fonts.json').write_text(json.dumps(fonts,ensure_ascii=False),encoding='utf-8')
print(json.dumps({'skins':len(skins),'fonts':len(fonts)}))
