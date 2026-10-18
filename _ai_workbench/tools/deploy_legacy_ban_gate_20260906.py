"""Close the verified no-token ban bypass; do not alter incident data or expiry."""
import json,sys,shutil
from pathlib import Path
import paramiko
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready,wait_ready,digest
from release_fishing_recovery_service_20260906 import WB,ROOT,STAGE,api
APP='/linhhoasu/lhs/newServer';REL='src/handlers/account.js';BACKUP='/linhhoasu/_ai_workbench/backups/fishing_recovery_service_20260906/legacy-gate'
def main():
 sys.stdout.reconfigure(encoding='utf-8');deploy=json.loads((ROOT/'service-deploy.json').read_text(encoding='utf-8'));expected=deploy['expected'];candidate=ROOT/'app'/REL
 assert digest(ROOT/'account.before.js')==expected[APP+'/'+REL];assert json.loads((ROOT/'legacy-ban-gate-tests.json').read_text(encoding='utf-8'))['result']=='PASS'
 c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
 installed=False;restarted=[]
 try:
  assert hashes(s,list(expected))==expected;assert pm2(s)==deploy['pm2']
  f=s.open_sftp()
  try:f.put(str(candidate),STAGE+'/app/'+REL)
  finally:f.close()
  run(s,'node --check '+STAGE+'/app/'+REL)
  core=json.loads(run(s,f'cd {STAGE}/app && NODE_PATH={APP}/node_modules NODE_ENV=test LOG_DIR= CONFIG_BIN_PATH={STAGE}/server.bin timeout 45s node scripts/test-core-gameplay-contract.js',timeout=50));assert core['result']=='ok'
  run(s,f'install -d -m 700 {BACKUP}; cp -a {APP}/{REL} {BACKUP}/account.before.js; install -m 644 {STAGE}/app/{REL} {APP}/{REL}')
  installed=True
  afterExpected={**expected,APP+'/'+REL:digest(candidate)};checks=[]
  for name,port,sid in [('lhs-s1002',8083,1002),('lhs-s1001',8080,1001)]:
   restarted.append(name);run(s,'pm2 restart '+name,timeout=50);wait_ready(s,port)
   normal=api(s,'status','vanduc97',sid);blocked=api(s,'status','nood100',sid)
   assert not normal['result']['ban']['banned'];assert blocked['result']['ban']['banned'];checks.append({'server':sid,'adminBanned':False,'incidentAccountBanned':True})
   print(json.dumps(checks[-1]),flush=True)
  after=pm2(s);assert all(next(x for x in after if x['name']==p['name'])==p for p in deploy['pm2'] if p['name']not in restarted);assert hashes(s,list(afterExpected))==afterExpected
  backupLocal=WB/'backups/fishing_recovery_20260906/service-deploy-before-legacy.json';assert not backupLocal.exists();shutil.copy2(ROOT/'service-deploy.json',backupLocal)
  out={'result':'DEPLOYED','backup':BACKUP,'sha256':digest(candidate),'core':core,'checks':checks,'pm2':after,'dataWrites':0}
  (ROOT/'legacy-gate-deploy.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  deploy.update(expected=afterExpected,pm2=after,legacyGate='legacy-gate-deploy.json');(ROOT/'service-deploy.json').write_text(json.dumps(deploy,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  print(json.dumps({'result':'DEPLOYED','ready':ready(s),'penaltyTimesChanged':False}))
 except Exception:
  if installed:
   run(s,f'cp -a {BACKUP}/account.before.js {APP}/{REL}')
   for name in restarted:run(s,'pm2 restart '+name,timeout=50);wait_ready(s,8083 if name=='lhs-s1002'else 8080)
  raise
 finally:s.close()
if __name__=='__main__':main()
