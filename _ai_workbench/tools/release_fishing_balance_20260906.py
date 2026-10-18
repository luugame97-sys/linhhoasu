"""Deploy owner-authorized custom wash/box balance with baseline and rollback gates."""
import hashlib,json,shlex,sys,time
from pathlib import Path
from datetime import datetime,timezone
import paramiko
WB=Path(__file__).resolve().parents[1];ROOT=WB/'temp/fishing_balance_20260906'
APP='/linhhoasu/lhs/newServer';GAME='/linhhoasu/webgame/game'
FILES=['src/config/fishingBalance.json','src/services/FishingBalanceService.js','src/handlers/fish.js','src/handlers/fish-soul.js','src/handlers/playerPayload.js','src/handlers/item.js']
NAMES=['lhs-s1001','lhs-s1002','lhs-real-bots','lhs-real-bots-s2','lhs-dist','lhs-admin']
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def run(s,cmd,body=None,timeout=60):
 i,o,e=s.exec_command(cmd,timeout=timeout)
 if body is not None:i.write(body);i.channel.shutdown_write()
 out=o.read().decode('utf-8','replace');err=e.read().decode('utf-8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError((err+out)[-12000:])
 return out
def node(s,body):return json.loads(run(s,'node -',body))
def hashes(s,paths):
 return node(s,"const fs=require('fs'),c=require('crypto');console.log(JSON.stringify(Object.fromEntries("+json.dumps(paths)+".map(p=>[p,fs.existsSync(p)?c.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null]))));")
def pm2(s):
 return json.loads(run(s,"pm2 jlist | node -e "+shlex.quote("let x='';process.stdin.on('data',b=>x+=b).on('end',()=>console.log(JSON.stringify(JSON.parse(x).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))));")))
def ready(s):return {str(p):int(run(s,f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{p}/ready"))for p in [8080,8083]}
def wait_ready(s,port):
 for _ in range(45):
  try:
   if run(s,f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip()=='200':return
  except RuntimeError:pass
  time.sleep(1)
 raise RuntimeError('READY_TIMEOUT_'+str(port))
def main():
 sys.stdout.reconfigure(encoding='utf-8');action=sys.argv[1] if len(sys.argv)>1 else 'stage'
 c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
 manifest=json.loads((ROOT/'manifest.json').read_text());baseline={v['remote']:v['sha256']for v in manifest['files'].values()}
 for rel in FILES:
  if 'app/'+rel not in manifest['files']:baseline[APP+'/'+rel]=None
 installed=[];restarted=[];report={}
 try:
  if action=='probe':
   print(json.dumps({'pm2':pm2(s),'ready':ready(s),'mainHttp':run(s,"curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/js/main.min_a6195824.js").strip(),'mainHttp88':run(s,"curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:88/js/main.min_a6195824.js").strip()}));return
  if action=='stage':
   before=hashes(s,list(baseline));assert before==baseline,'SOURCE_CONFIG_DRIFT'
   stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');stage='/linhhoasu/_ai_workbench/temp/fishing_balance_'+stamp
   run(s,f'install -d -m 700 {stage}/app {stage}/tools; cp -a {APP}/src {stage}/app/src; cp -a {APP}/scripts {stage}/app/scripts')
   run(s,f'install -d -m 755 {stage}/app/src/config')
   f=s.open_sftp()
   try:
    for rel in FILES:f.put(str(ROOT/'app'/rel),stage+'/app/'+rel)
    for name in ['server.bin','main.fixed.js']:f.put(str(ROOT/name),stage+'/'+name)
    f.put(str(WB/'tools/test_fishing_balance_20260906.js'),stage+'/tools/test_fishing_balance_20260906.js')
    f.put(str(WB.parent/'linhhoasu/lhs/newServer/node_modules/acorn/dist/acorn.js'),stage+'/tools/acorn.js')
    f.get(GAME+'/index.html',str(ROOT/'index.before.html'))
   finally:f.close()
   old=(ROOT/'index.before.html').read_text(encoding='utf-8');import re
   new,n=re.subn(r'(js/main\.min_a6195824\.js)(?:\?[^\s\"\'<>]*)?',r'\1?v=20260906_fishing_custom_balance_v1',old);assert n==1,n
   (ROOT/'index.fixed.html').write_text(new,encoding='utf-8')
   baseline[GAME+'/index.html']=digest(ROOT/'index.before.html')
   assert hashes(s,[GAME+'/index.html'])[GAME+'/index.html']==baseline[GAME+'/index.html']
   cmd=f'NODE_PATH={APP}/node_modules FISH_ACORN_PATH={stage}/tools/acorn.js node {stage}/tools/test_fishing_balance_20260906.js {stage}'
   tests=json.loads(run(s,cmd,timeout=60));assert tests['result']=='PASS'
   for rel in FILES:
    if rel.endswith('.js'):run(s,'node --check '+stage+'/app/'+rel)
   run(s,'node --check '+stage+'/main.fixed.js')
   run(s,f'ln -s {APP}/node_modules {stage}/app/node_modules')
   core=run(s,f'cd {stage}/app && NODE_ENV=test LOG_DIR= CONFIG_BIN_PATH={stage}/server.bin node scripts/test-core-gameplay-contract.js',timeout=60)
   report={'result':'STAGED','stage':stage,'baseline':baseline,'beforePm2':pm2(s),'ready':ready(s),'tests':tests,'core':core,'timezone':run(s,'date +%z').strip(),'candidateHashes':{rel:digest(ROOT/'app'/rel)for rel in FILES},'clientHash':digest(ROOT/'main.fixed.js'),'indexHash':digest(ROOT/'index.fixed.html')}
   (ROOT/'stage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
   print(json.dumps({'result':report['result'],'stage':stage,'tests':tests['count'],'ready':report['ready'],'timezone':report['timezone']}));return
  assert action=='deploy'
  stageInfo=json.loads((ROOT/'stage.json').read_text(encoding='utf-8'));baseline=stageInfo['baseline'];stage=stageInfo['stage']
  assert hashes(s,list(baseline))==baseline,'PREINSTALL_DRIFT'
  assert stageInfo['candidateHashes']=={rel:digest(ROOT/'app'/rel)for rel in FILES},'CANDIDATE_CHANGED_RESTAGE'
  assert stageInfo['clientHash']==digest(ROOT/'main.fixed.js') and stageInfo['indexHash']==digest(ROOT/'index.fixed.html'),'CLIENT_CHANGED_RESTAGE'
  before=pm2(s);assert ready(s)=={'8080':200,'8083':200}
  backup=stage.replace('/temp/','/backups/');run(s,f'install -d -m 700 {backup}')
  report={'backup':backup,'stage':stage,'beforePm2':before,'compensation':False,'historicalRepair':False}
  targets=[(ROOT/'app'/rel,APP+'/'+rel)for rel in FILES]+[(ROOT/'main.fixed.js',GAME+'/js/main.min_a6195824.js'),(ROOT/'index.fixed.html',GAME+'/index.html')]
  f=s.open_sftp()
  try:
   for index,(local,target)in enumerate(targets):
    if baseline.get(target):run(s,f'cp -a {shlex.quote(target)} {backup}/{index}.before')
    f.put(str(local),stage+f'/install-{index}')
  finally:f.close()
  expected={target:digest(local)for local,target in targets}
  assert all(hashes(s,[stage+f'/install-{i}'])[stage+f'/install-{i}']==digest(local)for i,(local,_)in enumerate(targets))
  # Dependencies first; both game processes are gracefully restarted individually.
  run(s,f'install -d -m 755 {APP}/src/config')
  for index,(_,target)in enumerate(targets):
   installed.append((index,target));run(s,f'install -m 644 {stage}/install-{index} {shlex.quote(target)}')
  assert hashes(s,list(expected))==expected
  for name,port in [('lhs-s1002',8083),('lhs-s1001',8080)]:
   restarted.append(name);run(s,'pm2 restart '+name,timeout=60);wait_ready(s,port)
  after=pm2(s);untouched=[p for p in before if p['name']not in restarted]
  assert all(next((q for q in after if q['name']==p['name']),None)==p for p in untouched),'UNRELATED_PROCESS_CHANGED'
  assert all(p['status']=='online' for p in after if p['name']in restarted)
  report.update(result='DEPLOYED',afterPm2=after,ready=ready(s),hashes=hashes(s,list(expected)),expected=expected,restarted=restarted)
  assert report['ready']=={'8080':200,'8083':200} and report['hashes']==expected
  # Fetch served JS hash locally on host without hitting players or gameplay.
  served=run(s,'curl -fsS --max-time 15 http://127.0.0.1:81/js/main.min_a6195824.js | sha256sum').split()[0]
  report['servedMainHash']=served
  assert served==stageInfo['clientHash'],'SERVED_CLIENT_MISMATCH'
  report['servedIndexHash']=run(s,'curl -fsS --max-time 15 http://127.0.0.1:81/ | sha256sum').split()[0]
  assert report['servedIndexHash']==stageInfo['indexHash'],'SERVED_INDEX_MISMATCH'
  (ROOT/'deploy.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  print(json.dumps({'result':report['result'],'backup':backup,'ready':report['ready'],'restarted':restarted,'untouchedProcesses':len(untouched),'servedMainMatches':served==stageInfo['clientHash']}))
 except Exception as error:
  report.update(result='FAIL',error=str(error))
  if installed:
   for index,target in reversed(installed):
    if baseline.get(target):run(s,f'install -m 644 {report["backup"]}/{index}.before {shlex.quote(target)}')
    else:run(s,f'mv {shlex.quote(target)} {report["backup"]}/{index}.rolled-back-new')
   for name in restarted:run(s,'pm2 restart '+name,timeout=60)
   report['rollbackReady']=ready(s)
  (ROOT/'release-error.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');raise
 finally:s.close()
if __name__=='__main__':main()
