"""Read the live EUI definitions for OldTrek. No production writes."""
import json
import hashlib
from pathlib import Path
from skin_incident_remote import connect
from decode_bin_manifest import decode

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/oldtrek_full_audit_20261016'
with connect() as client:
    sftp = client.open_sftp()
    data = sftp.open('/linhhoasu/webgame/game/update/resource/assets/cfg/gameEui_18e11b8e.bin', 'rb').read()
skins = decode(data)['value']
selected = {k: v for k, v in skins.items() if 'OldTrek' in k}
(OUT / 'skins.json').write_text(json.dumps(selected, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'sha256': hashlib.sha256(data).hexdigest(), 'count': len(selected), 'view': selected.get('OldTrekEventViewSkin'), 'item': selected.get('OldTrekEventItemSkin')}, ensure_ascii=True))
