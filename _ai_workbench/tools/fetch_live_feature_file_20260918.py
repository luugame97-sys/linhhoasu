"""Read-only fetch of one live source file for CAS rebase."""
import hashlib
import json
import sys
from pathlib import Path
sys.dont_write_bytecode=True
WB=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(WB/'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect
rel=sys.argv[1] if len(sys.argv)>1 else 'src/handlers/arena.js'
if rel.startswith('/') or '..' in Path(rel).parts or not rel.endswith(('.js','.json','.html')): raise SystemExit('BAD_REL')
remote=('/linhhoasu/lhs/newServer/'+rel if rel.startswith(('src/','ecosystem.'))
        else '/linhhoasu/webgame/game/'+rel)
out=WB/'temp/feature_unlock_release_20260917/live-rebase'/rel
ssh=connect()
try:
    with ssh.open_sftp() as sftp:
        data=sftp.open(remote,'rb').read()
finally:
    ssh.close()
out.parent.mkdir(parents=True,exist_ok=True)
out.write_bytes(data)
print(json.dumps({'path':remote,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'output':str(out),'productionWrites':0}))
