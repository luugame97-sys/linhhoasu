"""Fetch only OldTrek recovery dependencies, preserving an immutable preimage."""
from pathlib import Path
import datetime as dt
import hashlib
import json
import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/oldtrek_recovery_20261002'
APP='/linhhoasu/lhs/newServer'
SOURCES=['src/handlers/old-trek.js','src/services/OldTrekEventService.js',
 'src/services/OldTrekProgressService.js','src/services/OldTrekLedgerService.js',
 'src/services/OldTrekScheduleService.js','src/services/OldTrekArenaService.js',
 'src/services/OldTrekPuzzleService.js','src/services/PlayerService.js',
 'src/services/PlayerMutationService.js','src/services/CurrencySync.js',
 'src/config/oldTrekGameplayPolicy.json','src/net/WSServer.js']

def main():
 args,kw=ssh_config();assert args[0]=='103.116.104.165'
 c=paramiko.SSHClient();c.set_missing_host_key_policy(paramiko.AutoAddPolicy());c.connect(*args,**kw)
 manifest={}
 try:
  with c.open_sftp() as s:
   pairs=[(APP+'/'+x,'server/'+x) for x in SOURCES]+[
    ('/linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js','client/lhs-oldtrek-errors-v1.js'),
    ('/linhhoasu/webgame/game/js/lhs-oldtrek-minigames-v1.js','client/lhs-oldtrek-minigames-v1.js'),
    ('/linhhoasu/webgame/game/index.html','client/index.html')]
   for remote,rel in pairs:
    with s.open(remote,'rb') as f:data=f.read()
    out=OUT/'baseline'/rel
    if out.exists() and out.read_bytes()!=data:raise RuntimeError('BASELINE_DRIFT:'+rel)
    out.parent.mkdir(parents=True,exist_ok=True)
    if not out.exists():out.write_bytes(data)
    manifest[rel]={'remote':remote,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
   cfg='/linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin'
   _,o,e=c.exec_command('sha256sum '+cfg,timeout=15);h=o.read().decode().split()[0]
   assert o.channel.recv_exit_status()==0
   local=ROOT/'_ai_workbench/temp/petsoul_release_20261002/baseline/config.bin'
   assert hashlib.sha256(local.read_bytes()).hexdigest()==h,'CONFIG_DRIFT'
   manifest['config.bin']={'remote':cfg,'local':str(local),'sha256':h}
  report={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'remoteWrites':0,'files':manifest}
  (OUT/'snapshot.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
  for rel in ['server/src/handlers/old-trek.js','client/lhs-oldtrek-errors-v1.js','client/index.html']:
   dest=OUT/'candidate'/rel;dest.parent.mkdir(parents=True,exist_ok=True)
   if not dest.exists():dest.write_bytes((OUT/'baseline'/rel).read_bytes())
  print(json.dumps(report,ensure_ascii=False,indent=2))
 finally:c.close()

if __name__=='__main__':main()
