"""Upload/run disposable multi-client room QA only; guard source and process state."""
import json,sys
from pathlib import Path
import paramiko
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready
WB=Path(__file__).resolve().parents[1];QA=WB/'tools/qa_fishing_room_live_20260906.js';DEPLOY=WB/'temp/fishing_auto_fx_20260906/deploy.json';APP='/linhhoasu/lhs/newServer'
def main():
 raise RuntimeError('WITHDRAWN: flawed QA identity and waiter/cleanup handling. Use detached room-audit.json; do not run live without a new reviewed harness and user authorization.')
 c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
 expected=json.loads(DEPLOY.read_text(encoding='utf-8'))['expected'];before=pm2(s);assert hashes(s,[APP+'/src/handlers/fish.js'])[APP+'/src/handlers/fish.js']==expected[APP+'/src/handlers/fish.js'];assert ready(s)=={'8080':200,'8083':200}
 stage='/tmp/qa_fishing_room_20260906.js';f=s.open_sftp()
 try:f.put(str(QA),stage)
 finally:f.close()
 out={}
 try:
  for sid in [1002,1001]:
   raw=run(s,f'node {stage} {sid}',timeout=90);out[str(sid)]=json.loads(raw)
   assert out[str(sid)]['result']=='PASS' and out[str(sid)]['firstClientPeerCount']>=4 and out[str(sid)]['lastClientPeerCount']==0
  assert pm2(s)==before and ready(s)=={'8080':200,'8083':200};assert hashes(s,[APP+'/src/handlers/fish.js'])[APP+'/src/handlers/fish.js']==expected[APP+'/src/handlers/fish.js']
  print(json.dumps({'result':'PASS','qa':out,'pm2Unchanged':True,'sourceUnchanged':True,'ready':ready(s)}))
 finally:
  try:run(s,f'rm -f {stage}')
  except Exception:pass
  s.close()
if __name__=='__main__':main()
