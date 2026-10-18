"""Download the current production client entry files for a conflict-safe patch."""
from __future__ import annotations
import hashlib, json, os
from datetime import datetime, timezone
from pathlib import Path
import paramiko

HOST='103.116.105.154'
ROOT=Path(__file__).resolve().parents[1]
FILES={
    '/linhhoasu/webgame/game/js/main.min_a6195824.js':'main.min_a6195824.js',
    '/linhhoasu/webgame/game/index.html':'index.html',
}
credentials=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines()
if credentials[0].strip()!=HOST or credentials[1].strip()!='root': raise RuntimeError('TARGET_MISMATCH')
stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
out=ROOT/'temp'/('silent_mode_snapshot_'+stamp);out.mkdir(parents=True)
ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh.connect(HOST,username='root',password=credentials[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
    sftp=ssh.open_sftp(); manifest=[]
    try:
        for remote,name in FILES.items():
            local=out/name;sftp.get(remote,str(local));manifest.append({'remote':remote,'name':name,'bytes':local.stat().st_size,'sha256':hashlib.sha256(local.read_bytes()).hexdigest()})
    finally:sftp.close()
    (out/'manifest.json').write_text(json.dumps({'generatedAt':datetime.now(timezone.utc).isoformat(),'files':manifest},indent=2),encoding='utf-8')
    print(json.dumps({'result':'PASS','snapshot':str(out),'files':manifest}))
finally:ssh.close()
