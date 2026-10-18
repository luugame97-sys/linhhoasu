import json,sys,posixpath,hashlib
from pathlib import Path
from datetime import datetime,timezone
import paramiko
WB=Path(__file__).resolve().parents[1];ROOT=WB/'temp/webshop_upgrade_20260906';CAND=ROOT/'candidate';REMOTE='/linhhoasu/webgame/gm'
def run(s,command,source=None):
 i,o,e=s.exec_command(command,timeout=60)
 if source is not None:i.write(source);i.channel.shutdown_write()
 out=o.read().decode('utf-8','replace');err=e.read().decode('utf-8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError((out+'\n'+err)[-5000:])
 return out
def main():
 sys.stdout.reconfigure(encoding='utf-8');c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');stage='/linhhoasu/_ai_workbench/temp/webshop_upgrade_'+stamp
 try:
  schema=json.loads(run(s,'php',(WB/'tools/webshop_schema_probe_20260906.php').read_text(encoding='utf-8')));(ROOT/'schema.json').write_text(json.dumps(schema,indent=2)+'\n')
  run(s,f'install -d -m 700 {stage}/gm {stage}/tools')
  f=s.open_sftp()
  try:
   for p in CAND.rglob('*'):
    if not p.is_file():continue
    rel=p.relative_to(CAND).as_posix();parent=posixpath.dirname(stage+'/gm/'+rel);run(s,'mkdir -p '+parent);f.put(str(p),stage+'/gm/'+rel)
  finally:f.close()
  lint={}
  for p in CAND.rglob('*.php'):lint[p.relative_to(CAND).as_posix()]=run(s,'php -l '+stage+'/gm/'+p.relative_to(CAND).as_posix()).strip()
  result={'stage':stage,'lint':lint,'generatedAt':datetime.now(timezone.utc).isoformat(),'sourceInstalled':False};(ROOT/'stage.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'stage':stage,'lintFiles':len(lint),'php':schema['php'],'statuses':schema['statuses']}))
 finally:s.close()
if __name__=='__main__':main()
