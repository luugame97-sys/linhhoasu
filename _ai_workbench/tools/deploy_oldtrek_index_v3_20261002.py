from __future__ import annotations
import datetime as dt, hashlib, json, shlex
from pathlib import Path
import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config

ROOT=Path(__file__).resolve().parents[2]
LOCAL=ROOT/'_ai_workbench/temp/oldtrek_guard_v3_20261002/index.html'
REMOTE='/linhhoasu/webgame/game/index.html'
EXPECTED='d6f7447f14f1f915f523ead42b577bfe8d2b04e519fed531e48a7b863226f236'
OUT=ROOT/'_ai_workbench/temp/oldtrek_guard_v3_20261002'
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
 data=LOCAL.read_bytes();assert b'20261002_oldtrek_guard_v3' in data;after=sha(data)
 args,kw=ssh_config();assert args[0]=='103.116.104.165';c=paramiko.SSHClient();c.set_missing_host_key_policy(paramiko.AutoAddPolicy());c.connect(*args,**kw);s=c.open_sftp()
 stamp=dt.datetime.now().strftime('%Y%m%d_%H%M%S');backup=f'/linhhoasu/_ai_workbench/backups/oldtrek_index_v3_{stamp}';stage=REMOTE+'.oldtrek_v3_'+stamp+'.html';report={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'backupDir':backup,'productionPlayerWrites':0,'pm2Restart':False,'before':EXPECTED,'after':after}
 def run(cmd):
  _,o,e=c.exec_command(cmd,timeout=45);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');rc=o.channel.recv_exit_status()
  if rc:raise RuntimeError(f'REMOTE({rc}):{err[-600:]}')
  return out.strip()
 def rh(p):return sha(s.open(p,'rb').read())
 try:
  if rh(REMOTE)!=EXPECTED:raise RuntimeError('CAS_INDEX_DRIFT:'+rh(REMOTE))
  run('mkdir -m 700 -- '+shlex.quote(backup));run('cp -p -- '+shlex.quote(REMOTE)+' '+shlex.quote(backup+'/index.html'))
  assert rh(backup+'/index.html')==EXPECTED
  s.put(str(LOCAL),stage);run('chmod 644 -- '+shlex.quote(stage));assert rh(stage)==after
  if rh(REMOTE)!=EXPECTED:raise RuntimeError('CAS_BEFORE_SWAP')
  run('mv -f -- '+shlex.quote(stage)+' '+shlex.quote(REMOTE));assert rh(REMOTE)==after
  loop=run('curl --max-time 15 -fsS http://127.0.0.1:81/index.html | sha256sum').split()[0]
  pub=run('curl --max-time 20 -fsS https://linhhoasu.lol/index.html?v=20261002_oldtrek_guard_v3 | sha256sum').split()[0]
  if loop!=after or pub!=after:raise RuntimeError('SERVED_HASH:'+loop+':'+pub)
  report.update(result='DEPLOYED',loopbackHash=loop,publicHash=pub,completedAt=dt.datetime.now(dt.timezone.utc).isoformat());OUT.mkdir(parents=True,exist_ok=True);(OUT/'deployment.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print(json.dumps(report,indent=2))
 except Exception as exc:
  report.update(result='FAILED',error=str(exc));OUT.mkdir(parents=True,exist_ok=True);(OUT/'deployment.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');raise
 finally:
  try:s.remove(stage)
  except FileNotFoundError:pass
  s.close();c.close()
if __name__=='__main__':main()
