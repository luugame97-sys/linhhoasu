#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, shlex, time
from datetime import datetime, timezone
from pathlib import Path
import paramiko

ROOT=Path(__file__).resolve().parents[2]
CREDS=ROOT/'_ai_workbench/VPS103.116.104.165.txt'
LIVE=ROOT/'_ai_workbench/temp/artifact_quench_audit_20261009'
OUT=ROOT/'_ai_workbench/temp/artifact_quench_release_20261009'
REMOTE_ROOT='/linhhoasu/lhs/newServer'
FILES=[
 ('src/handlers/artifact.js','artifact.js.live'),
 ('src/services/BattleService.js','BattleService.js.live'),
 ('src/net/WSServer.js','WSServer.js.live'),
]
EXPECTED={
 'src/handlers/artifact.js':'0eb1d3d15f64f06285e5763194b0cbad732e189f19b4f314ee7ad5d1ea41cfa7',
 'src/services/BattleService.js':'323622609b25c40808d2835473118e20df72cd19e1e52582884c5e59f0ad340b',
 'src/net/WSServer.js':'191dede9b17fbaf2288ee53506bb8d6b751f7a07896264ebf672383edb4550e7',
}
NODES=[('lhs-s1001',8080),('lhs-s1002',8083),('lhs-s1003',8084),('lhs-s1004',8085),('lhs-s1005',8086),('lhs-s1006',8087),('lhs-s1007',8088),('lhs-s1008',8089)]

def sha(b): return hashlib.sha256(b).hexdigest()
def q(x): return shlex.quote(x)
def connect():
 h,u,p=CREDS.read_text(encoding='utf-8-sig').splitlines()
 s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy())
 s.connect(h,username=u,password=p,look_for_keys=False,allow_agent=False,timeout=20);return s
def run(s,cmd,timeout=120):
 i,o,e=s.exec_command(cmd,timeout=timeout);out=o.read().decode('utf-8','replace');err=e.read().decode('utf-8','replace');rc=o.channel.recv_exit_status()
 if rc: raise RuntimeError(f'RC{rc}:{err[-1200:]}:{out[-600:]}')
 return out
def rh(s,path): return run(s,f"sha256sum -- {q(path)} | awk '{{print $1}}'").strip()
def ready(s,p):
 try:return run(s,f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 10 http://127.0.0.1:{p}/ready",20).strip()
 except Exception:return '000'
def procs(s):
 code="const a=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(JSON.stringify(a.filter(p=>/^lhs-s100[1-8]$/.test(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,forceUnlock:(p.pm2_env.env||{}).FORCE_UNLOCK_SYSTEM_IDS||null}))));"
 return json.loads(run(s,'pm2 jlist | node -e '+q(code)))
def main():
 OUT.mkdir(parents=True,exist_ok=True); stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
 backup=f'/linhoasu/_ai_workbench/backups/artifact_quench_fix_20261009_{stamp}'
 stage=f'/linhoasu/_ai_workbench/temp/artifact_quench_fix_20261009_{stamp}'
 ev={'at':datetime.now(timezone.utc).isoformat(),'result':'FAILED','productionWrites':0,'playerWrites':0}
 s=connect()
 try:
  ev['preProcesses']=procs(s)
  pm2={x['name']:x for x in ev['preProcesses']}
  if len(pm2)!=8 or any(x['status']!='online' for x in ev['preProcesses']): raise RuntimeError('PROCESS_BASELINE')
  ev['preReady']={str(p):ready(s,p) for _,p in NODES}
  if any(v!='200' for v in ev['preReady'].values()): raise RuntimeError('PRE_READY')
  run(s,f'install -d -m 700 -- {q(stage)} {q(backup)}')
  candidates={}
  for rel,name in FILES:
   data=(LIVE/name).read_bytes(); h=sha(data); target=f'{REMOTE_ROOT}/{rel}'
   if h!=sha(data): raise RuntimeError('LOCAL_HASH')
   if rh(s,target)!=EXPECTED[rel]: raise RuntimeError(f'CAS:{rel}:{rh(s,target)}')
   candidates[rel]=h
   remote_stage=f'{stage}/{rel}'
   run(s,f'install -d -m 700 -- {q(remote_stage.rsplit("/",1)[0])}')
   with s.open_sftp() as sf:
    with sf.open(remote_stage,'wb') as f:f.write(data)
   if rh(s,remote_stage)!=h: raise RuntimeError('STAGE_HASH')
   backup_target = backup+'/'+rel
   run(s,f'install -d -m 700 -- {q(backup_target.rsplit("/",1)[0])}')
   run(s,f'cp -p -- {q(target)} {q(backup_target)}')
   if rh(s,backup_target)!=EXPECTED[rel]: raise RuntimeError('BACKUP_HASH')
  ev['backup']=backup;ev['candidateHashes']=candidates
  for rel,_ in FILES:
   target=f'{REMOTE_ROOT}/{rel}';remote_stage=f'{stage}/{rel}'
   if rh(s,target)!=EXPECTED[rel]: raise RuntimeError('PUBLISH_CAS')
   tmp=target+'.artifact_quench.tmp'
   run(s,f'cp -- {q(remote_stage)} {q(tmp)} && chmod --reference={q(target)} {q(tmp)} && chown --reference={q(target)} {q(tmp)}')
   if rh(s,tmp)!=candidates[rel]:raise RuntimeError('TEMP_HASH')
   run(s,f'mv -f -- {q(tmp)} {q(target)}')
   if rh(s,target)!=candidates[rel]:raise RuntimeError('FINAL_HASH')
  ev['installedHashes']={rel:rh(s,f'{REMOTE_ROOT}/{rel}') for rel,_ in FILES}
  ev['restarted']=[]
  for name,p in NODES:
   run(s,f'pm2 restart {q(name)}',120); deadline=time.time()+90;code='000'
   while time.time()<deadline:
    code=ready(s,p)
    if code=='200':break
    time.sleep(1)
   if code!='200':raise RuntimeError(f'READY:{name}:{code}')
   ev['restarted'].append({'name':name,'port':p,'ready':code})
  ev['postReady']={str(p):ready(s,p) for _,p in NODES}
  ev['postProcesses']=procs(s)
  syntax=run(s, "for f in /linhoasu/lhs/newServer/src/handlers/artifact.js /linhoasu/lhs/newServer/src/services/BattleService.js /linhoasu/lhs/newServer/src/net/WSServer.js; do node --check \"$f\"; done; echo SYNTAX_PASS", 60).strip()
  if syntax != 'SYNTAX_PASS': raise RuntimeError('REMOTE_SYNTAX')
  ev['syntax']='PASS'
  ev['result']='PASS'; ev['verifiedAt']=datetime.now(timezone.utc).isoformat()
  (OUT/'release.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  print(json.dumps({'result':'PASS','backup':backup,'installedHashes':ev['installedHashes'],'restarted':ev['restarted'],'productionWrites':0,'playerWrites':0},ensure_ascii=False))
 except Exception as e:
  ev['error']=str(e);(OUT/'release.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');raise
 finally:
  try:run(s,f'rm -rf -- {q(stage)}',30)
  except Exception:pass
  s.close()
if __name__=='__main__':main()

