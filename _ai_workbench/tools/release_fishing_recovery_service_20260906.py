"""Stage/deploy incident-only in-process recovery. This tool never invokes recovery or ban."""
import json,shlex,sys
from pathlib import Path
import paramiko
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready,wait_ready,digest
WB=Path(__file__).resolve().parents[1];ROOT=WB/'temp/fishing_recovery_20260906';APP='/linhhoasu/lhs/newServer';WEB='/linhhoasu/webgame/gm/config.php'
FILES=['src/config/fishingFreeRecovery20260906.json','src/services/FishingFreeRecoveryService.js','src/net/HTTPServer.js']
STAGE='/linhhoasu/_ai_workbench/temp/fishing_recovery_service_20260906';BACKUP='/linhhoasu/_ai_workbench/backups/fishing_recovery_service_20260906'
def write(n,x):(ROOT/n).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def api(s,action,account,sid):return json.loads(run(s,f'node {STAGE}/tools/fishing_incident_api_20260906.js {STAGE}/plan.json {action} {account} {sid}',timeout=30))
def main():
 sys.stdout.reconfigure(encoding='utf-8');action=sys.argv[1];assert action in ['stage','deploy']
 manifest=json.loads((ROOT/'manifest.json').read_text());baseline=manifest['expected'];baseline.update({APP+'/'+rel:None for rel in FILES[:2]})
 cred=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(cred[0].strip(),username='root',password=cred[2],look_for_keys=False,allow_agent=False,timeout=20)
 installed=[];restarted=[]
 try:
  assert hashes(s,list(baseline))==baseline,'SOURCE_DRIFT'
  before=pm2(s);assert before==manifest['pm2'];assert ready(s)=={'8080':200,'8083':200}
  if action=='stage':
   run(s,f'install -d -m 700 {STAGE}/app {STAGE}/tools; cp -a {APP}/src {STAGE}/app/src; cp -a {APP}/scripts {STAGE}/app/scripts')
   f=s.open_sftp()
   try:
    for rel in FILES:f.put(str(ROOT/'app'/rel),STAGE+'/app/'+rel)
    for name in ['plan.json','web-edit.json','web-ban-after.php.txt']:f.put(str(ROOT/name),STAGE+'/'+name)
    f.put(str(WB/'temp/fishing_contest_shop_20260906/server.bin'),STAGE+'/server.bin')
    for name in ['test_fishing_recovery_20260906.js','test_fishing_web_ban_20260906.php','fishing_incident_api_20260906.js']:f.put(str(WB/'tools'/name),STAGE+'/tools/'+name)
   finally:f.close()
   transform="const fs=require('fs'),c=require('crypto');const e=JSON.parse(fs.readFileSync('"+STAGE+"/web-edit.json'));let s=fs.readFileSync('"+WEB+"','utf8');if(c.createHash('sha256').update(s).digest('hex')!==e.expected||s.split(e.before).length!==2)throw Error('WEB_DRIFT');fs.writeFileSync('"+STAGE+"/config.fixed.php',s.replace(e.before,e.after));"
   run(s,'node -',transform);run(s,'php -l '+STAGE+'/config.fixed.php')
   webtests=json.loads(run(s,f'php {STAGE}/tools/test_fishing_web_ban_20260906.php {STAGE}/web-ban-after.php.txt'))
   tests=json.loads(run(s,f'node {STAGE}/tools/test_fishing_recovery_20260906.js {STAGE}',timeout=30));assert tests['result']=='PASS' and webtests['result']=='PASS'
   for rel in FILES[1:]:run(s,'node --check '+STAGE+'/app/'+rel)
   env=f'NODE_PATH={APP}/node_modules NODE_ENV=test LOG_DIR= CONFIG_BIN_PATH={STAGE}/server.bin'
   core=json.loads(run(s,f'cd {STAGE}/app && {env} timeout 45s node scripts/test-core-gameplay-contract.js',timeout=50));assert core['result']=='ok'
   authTests=[api(s,'auth-preview','vanduc97',sid) for sid in [1001,1002]];assert all(t['result'].get('dryRun') for t in authTests)
   expected={**baseline,**{APP+'/'+rel:digest(ROOT/'app'/rel)for rel in FILES},WEB:hashes(s,[STAGE+'/config.fixed.php'])[STAGE+'/config.fixed.php']}
   write('service-stage.json',{'result':'PASS','stage':STAGE,'expected':expected,'baseline':baseline,'tests':tests,'webTests':webtests,'core':core,'authPreview':[x['httpStatus'] for x in authTests],'pm2':before})
   print(json.dumps({'result':'STAGED','unitTests':tests['count'],'webTests':webtests['count'],'core':core['result'],'authPreview':[x['httpStatus']for x in authTests]}));return
  stage=json.loads((ROOT/'service-stage.json').read_text());assert stage['result']=='PASS';assert stage['baseline']==baseline;expected=stage['expected']
  for rel in FILES:assert digest(ROOT/'app'/rel)==expected[APP+'/'+rel]
  run(s,f'install -d -m 700 {BACKUP}')
  targets=[(STAGE+'/app/'+rel,APP+'/'+rel)for rel in FILES]+[(STAGE+'/config.fixed.php',WEB)]
  for i,(src,dst) in enumerate(targets):
   assert hashes(s,[src])[src]==expected[dst]
   if baseline.get(dst):run(s,f'cp -a {dst} {BACKUP}/{i}.before')
   installed.append((i,dst));run(s,f'install -m 600 {src} {dst}.recovery-next; mv -f {dst}.recovery-next {dst}')
   # Runtime game/PHP processes are root in this deployment; preserve web-readable config mode.
   if dst==WEB:run(s,f'chmod --reference={BACKUP}/{i}.before {dst}; chown --reference={BACKUP}/{i}.before {dst}')
  statuses=[]
  for name,sid,port in [('lhs-s1002',1002,8083),('lhs-s1001',1001,8080)]:
   restarted.append(name);run(s,'pm2 restart '+name,timeout=50);wait_ready(s,port);status=api(s,'status','vanduc97',sid);assert not status['result']['ban']['banned'];statuses.append(status)
   print(json.dumps({'step':'ready_and_status','server':sid}),flush=True)
  after=pm2(s);assert all(next(q for q in after if q['name']==p['name'])==p for p in before if p['name']not in restarted)
  assert hashes(s,list(expected))==expected
  write('service-deploy.json',{'result':'DEPLOYED','backup':BACKUP,'expected':expected,'pm2':after,'ready':ready(s),'adminStatus':statuses})
  print(json.dumps({'result':'DEPLOYED','ready':ready(s),'dataActions':0}))
 except Exception as e:
  if installed:
   for i,dst in reversed(installed):
    if baseline.get(dst):run(s,f'cp -a {BACKUP}/{i}.before {dst}')
    else:run(s,f'mv {dst} {BACKUP}/{i}.not-installed')
   for name in restarted:run(s,'pm2 restart '+name,timeout=50);wait_ready(s,8083 if name=='lhs-s1002'else 8080)
  write('service-error.json',{'error':str(e),'installed':installed,'restarted':restarted});raise
 finally:s.close()
if __name__=='__main__':main()
