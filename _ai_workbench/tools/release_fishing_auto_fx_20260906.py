"""Client-only native auto FX release. No server source edits/restarts or compensation."""
import json,re,shlex,sys
from pathlib import Path
from datetime import datetime,timezone
import paramiko
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready,digest
WB=Path(__file__).resolve().parents[1];ROOT=WB/'temp/fishing_auto_fx_20260906'
APP='/linhhoasu/lhs/newServer';GAME='/linhhoasu/webgame/game';VERSION='20260906_fishing_auto_fx_v1'
def write(name,data):
 (ROOT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def qa_remaining(s):
 script="""const{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const out={};for(const n of ['lhs_s1001','lhs_s1002'])out[n]={players:await c.db(n).collection('players').countDocuments({userId:/^qa_fish_auto_fx_/}),mails:await c.db(n).collection('mails').countDocuments({userId:/^qa_fish_auto_fx_/})};await c.close();console.log(JSON.stringify(out));})().catch(e=>{console.error(e.message);process.exitCode=1;});"""
 return json.loads(run(s,'node -',script))
def main():
 sys.stdout.reconfigure(encoding='utf-8');action=sys.argv[1] if len(sys.argv)>1 else 'stage';assert action in ['stage','deploy','verify']
 c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
 manifest=json.loads((ROOT/'manifest.json').read_text());baseline={v['remote']:v['sha256']for v in manifest['files'].values()};report={};installed=[]
 try:
  if action=='stage':
   assert hashes(s,list(baseline))==baseline,'BASELINE_DRIFT';before=pm2(s)
   stage='/linhhoasu/_ai_workbench/temp/fishing_auto_fx_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
   run(s,f'install -d -m 700 {stage}/app {stage}/tools; cp -a {APP}/src {stage}/app/src; cp -a {APP}/scripts {stage}/app/scripts')
   f=s.open_sftp()
   try:
    for name in ['server.bin','main.js','main.fixed.js','client-build.json']:f.put(str(ROOT/name),stage+'/'+name)
    for name in ['test_fishing_auto_fx_20260906.js','test_fishing_auto_20260906.js','test_fishing_gear_fix_20260906.js','test_fishing_balance_20260906.js','test_huyenvu_daily_20260906.js','qa_fishing_auto_fx_live_20260906.js']:f.put(str(WB/'tools'/name),stage+'/tools/'+name)
    f.put(str(WB/'temp/fishing_auto_20260906/main.js'),stage+'/auto-original.js')
    f.put(str(WB/'temp/fishing_audit_20260906T041024Z/app/src/handlers/commerce-compat.js'),stage+'/commerce-baseline.js')
    f.put(str(WB.parent/'linhhoasu/lhs/newServer/node_modules/acorn/dist/acorn.js'),stage+'/tools/acorn.js')
    f.get(GAME+'/index.html',str(ROOT/'index.before.html'))
   finally:f.close()
   old=(ROOT/'index.before.html').read_text(encoding='utf-8');new,count=re.subn(r'(js/main\.min_a6195824\.js)(?:\?[^\s\"\'<>]*)?',r'\1?v='+VERSION,old);assert count==1
   (ROOT/'index.fixed.html').write_text(new,encoding='utf-8');baseline[GAME+'/index.html']=digest(ROOT/'index.before.html')
   env=f'NODE_PATH={APP}/node_modules FISH_ACORN_PATH={stage}/tools/acorn.js AUTO_ORIGINAL_MAIN={stage}/auto-original.js AUTO_SKIP_COMMERCE_DIAGNOSTICS=1 DAILY_BASE_SOURCE={stage}/commerce-baseline.js';tests={}
   for name in ['auto_fx','auto','gear_fix','balance','daily']:
    script='test_huyenvu_daily_20260906.js' if name=='daily'else 'test_fishing_'+name+'_20260906.js'
    result=json.loads(run(s,f'{env} node {stage}/tools/{script} {stage}',timeout=60));assert result['result']=='PASS',name+'_FAIL';tests[name]=result;print(json.dumps({'test':name,'count':result['count'],'result':'PASS'}),flush=True)
   run(s,f'node --check {stage}/main.fixed.js');run(s,f'ln -s {APP}/node_modules {stage}/app/node_modules')
   core=json.loads(run(s,f'cd {stage}/app && NODE_ENV=test LOG_DIR= CONFIG_BIN_PATH={stage}/server.bin node scripts/test-core-gameplay-contract.js',timeout=60));assert core['result']=='ok'
   live={}
   for serverId in [1002,1001]:
    live[str(serverId)]=json.loads(run(s,f'node {stage}/tools/qa_fishing_auto_fx_live_20260906.js {serverId}',timeout=60));assert live[str(serverId)]['result']=='PASS';print(json.dumps({'liveQa':serverId,'result':'PASS'}),flush=True)
   remaining=qa_remaining(s);assert all(v=={'players':0,'mails':0}for v in remaining.values());assert hashes(s,list(baseline))==baseline
   assert pm2(s)==before,'PROCESS_CHANGED_DURING_STAGE'
   report={'result':'STAGED','stage':stage,'baseline':baseline,'beforePm2':before,'ready':ready(s),'tests':tests,'core':core,'liveQa':live,'qaRemaining':remaining,'mainHash':digest(ROOT/'main.fixed.js'),'indexHash':digest(ROOT/'index.fixed.html')}
   write('stage.json',report);print(json.dumps({'result':'STAGED','stage':stage,'tests':sum(v['count']for v in tests.values()),'noRestarts':True}));return
  stageInfo=json.loads((ROOT/'stage.json').read_text(encoding='utf-8'));stage=stageInfo['stage'];baseline=stageInfo['baseline']
  expected={**baseline,GAME+'/js/main.min_a6195824.js':stageInfo['mainHash'],GAME+'/index.html':stageInfo['indexHash']}
  if action=='verify':
   assert hashes(s,list(expected))==expected,'FINAL_HASH_MISMATCH'
   before=json.loads((ROOT/'deploy.json').read_text(encoding='utf-8'))['beforePm2'];after=pm2(s);assert after==before
   served={k:run(s,f'curl -fsS --max-time 15 http://127.0.0.1:81/{p} | sha256sum').split()[0]for k,p in [('main','js/main.min_a6195824.js'),('index','')]};assert served=={'main':stageInfo['mainHash'],'index':stageInfo['indexHash']}
   remaining=qa_remaining(s);assert all(v=={'players':0,'mails':0}for v in remaining.values())
   report={'result':'VERIFIED','time':datetime.now(timezone.utc).isoformat(),'hashCount':len(expected),'changed':2,'unchanged':len(expected)-2,'serverSourceUnchanged':True,'noRestarts':True,'pm2':after,'ready':ready(s),'served':served,'qaRemaining':remaining}
   assert report['ready']=={'8080':200,'8083':200};write('verify.json',report);print(json.dumps(report));return
  assert digest(ROOT/'main.fixed.js')==stageInfo['mainHash'] and digest(ROOT/'index.fixed.html')==stageInfo['indexHash'],'CANDIDATE_DRIFT'
  assert hashes(s,list(baseline))==baseline,'PREINSTALL_DRIFT';before=pm2(s);assert before==stageInfo['beforePm2'];assert ready(s)=={'8080':200,'8083':200}
  backup=stage.replace('/temp/','/backups/');run(s,f'install -d -m 700 {backup}');report={'result':'INSTALLING','backup':backup,'stage':stage,'beforePm2':before,'noRestarts':True}
  targets=[(ROOT/'main.fixed.js',GAME+'/js/main.min_a6195824.js'),(ROOT/'index.fixed.html',GAME+'/index.html')];f=s.open_sftp()
  try:
   for i,(local,target)in enumerate(targets):
    run(s,f'cp -a {target} {backup}/{i}.before');assert hashes(s,[backup+f'/{i}.before'])[backup+f'/{i}.before']==baseline[target]
    f.put(str(local),stage+f'/install-{i}');assert hashes(s,[stage+f'/install-{i}'])[stage+f'/install-{i}']==digest(local)
  finally:f.close()
  for i,(_,target)in enumerate(targets):
   installed.append((i,target))
   # Atomic replacement on the same filesystem avoids a partial JS response.
   run(s,f'install -m 644 {stage}/install-{i} {target}.auto-fx-next; mv -f {target}.auto-fx-next {target}')
  assert hashes(s,list(expected))==expected;assert pm2(s)==before
  report.update(result='DEPLOYED',time=datetime.now(timezone.utc).isoformat(),expected=expected,afterPm2=pm2(s),ready=ready(s));write('deploy.json',report);print(json.dumps({'result':'DEPLOYED','backup':backup,'noRestarts':True,'ready':report['ready']}))
 except Exception as error:
  report.update(result='FAIL',error=str(error));write('release-error.json',report)
  if installed:
   try:
    for i,target in reversed(installed):run(s,f'install -m 644 {report["backup"]}/{i}.before {target}.auto-fx-rollback; mv -f {target}.auto-fx-rollback {target}')
    report['rollbackHashes']=hashes(s,list(baseline));assert report['rollbackHashes']==baseline
   except Exception as rollback_error:report['rollbackError']=str(rollback_error)
  write('release-error.json',report);raise
 finally:s.close()
if __name__=='__main__':main()
