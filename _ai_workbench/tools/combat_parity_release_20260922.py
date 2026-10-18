"""Selective backup and read-only runtime inspection; no game mutation by default."""
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/combat_parity_20260922'
FILES = [
 'lhs/newServer/src/services/BattleService.js',
 'lhs/newServer/src/services/ArenaReadModelService.js',
 'lhs/newServer/src/services/CrossArenaService.js',
 'lhs/newServer/src/handlers/arena.js',
 'lhs/newServer/src/handlers/raid.js',
 'lhs/newServer/src/handlers/playerPayload.js',
 'lhs/newServer/src/handlers/basic.js',
 'lhs/newServer/src/net/WSServer.js',
 'webgame/game/js/main.min_drop100.js',
 'webgame/game/js/lhs-power-relogin-v1.js',
 'webgame/game/index.html',
]
def sha(data): return hashlib.sha256(data).hexdigest()
def backup():
 OUT.mkdir(parents=True, exist_ok=True)
 manifest_path=OUT/'baseline.json'
 if manifest_path.exists():
  data=json.loads(manifest_path.read_text(encoding='utf-8'))
  print(json.dumps({'status':'REUSE_EXISTING_BACKUP','localBackup':data['localBackup'],'remoteBackup':data['remoteBackup']}));return
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
 local=ROOT/'_ai_workbench/backups'/('combat_parity_'+stamp)
 remote='/linhhoasu/_ai_workbench/backups/combat_parity_'+stamp
 local.mkdir(parents=True,exist_ok=False)
 s=connect()
 try:
  data={'at':datetime.now(timezone.utc).isoformat(),'localBackup':str(local),'remoteBackup':remote,'files':{},'gameWrites':0}
  with s.open_sftp() as sf:
   sf.mkdir(remote,0o700)
   for rel in FILES:
    rp='/linhhoasu/'+rel
    with sf.open(rp,'rb') as f: live=f.read()
    before=(ROOT/'linhhoasu'/rel).read_bytes()
    for label,value in [('local',before),('remote',live)]:
     dest=local/label/rel;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(value)
     if dest.read_bytes()!=value: raise RuntimeError('BACKUP_READBACK_FAILED:'+rel)
    backup_name=rel.replace('/','__')
    with sf.open(remote+'/'+backup_name,'wx') as f:f.write(live)
    sf.chmod(remote+'/'+backup_name,0o600)
    with sf.open(remote+'/'+backup_name,'rb') as f:
     if f.read()!=live:raise RuntimeError('REMOTE_BACKUP_READBACK_FAILED:'+rel)
    data['files'][rel]={'localSha':sha(before),'remoteSha':sha(live),'equal':before==live,'remoteBackupName':backup_name}
  data['runtime']=json.loads(run(s,"pm2 jlist | node -e \"let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,cwd:p.pm2_env.pm_cwd})))));\""))
  manifest_path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  print(json.dumps({'status':'BACKUP_VERIFIED','localBackup':str(local),'remoteBackup':remote,'files':data['files']},ensure_ascii=False))
 finally:s.close()

if __name__=='__main__':backup()
