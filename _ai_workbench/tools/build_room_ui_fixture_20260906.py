"""Local rendering fixture for native EUI skins and the actual candidate methods."""
import json,re
from pathlib import Path
from decode_bin_manifest import decode
WB=Path(__file__).resolve().parents[1];GAME=WB.parent/'linhhoasu/webgame/game';OUT=WB/'temp/fishing_rooms_release_20260906'
skins=decode((GAME/'update/resource/assets/cfg/gameEui_18e11b8e.bin').read_bytes())['value']
images={}
for p in (GAME/'update/resource/assets/atlas_ui').rglob('*'):
 if p.suffix.lower() not in ['.png','.jpg','.webp']:continue
 m=re.match(r'(.+)_([a-f0-9]{8})$',p.stem)
 if m:images[m[1]]='/game/'+p.relative_to(GAME).as_posix()
(OUT/'all-skins.json').write_text(json.dumps(skins,ensure_ascii=False),encoding='utf-8')
(OUT/'images.json').write_text(json.dumps(images,ensure_ascii=False),encoding='utf-8')
print(json.dumps({'skins':len(skins),'images':len(images)}))
