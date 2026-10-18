"""Decode exact native panel/skin assets for layout work; no binary edits."""
import json,sys
from pathlib import Path
from decode_bin_manifest import decode
WB=Path(__file__).resolve().parents[1]
data=decode((WB.parent/'linhhoasu/webgame/game/update/resource/assets/cfg/gameEui_18e11b8e.bin').read_bytes())['value']
keys=[k for k in data if ('Fish' in k and ('Auto' in k or 'MainPanel' in k or 'LevelP' in k)) or k in ['CommonBtnSkin','CheckBox1Skin','CommonWinDialog0Skin','BtnYellow0Skin','BtnBlue0Skin','BtnCloseSkin','BtnDropdown1Skin']]
out={k:data[k]for k in keys}
(WB/'temp/fishing_rooms_release_20260906/skins.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8');print(json.dumps({k:v for k,v in out.items()if k in ['CommonWinDialog0Skin','BtnYellow0Skin','BtnBlue0Skin']},ensure_ascii=False))
