"""Guarded full-batch install; client + server contract changes deploy together, S2 then S1."""
import json,sys,re
from pathlib import Path
from datetime import datetime,timezone
import paramiko
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready,wait_ready,digest
WB=Path(__file__).resolve().parents[1];ROOT=WB/'temp/fishing_full_candidate_20260906';APP='/linhhoasu/lhs/newServer';GAME='/linhhoasu/webgame/game'
def write(n,x):(ROOT/n).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def main():
 sys.stdout.reconfigure(encoding='utf-8');action=sys.argv[1];assert action in ['prepare','deploy','verify']
 m=json.loads((ROOT/'manifest.json').read_text());baseline=m['expected'];stageData=json.loads((ROOT/'stage-full.json').read_text());stage=stageData['stage'];changed=stageData['changedFiles'];expected={**baseline,**{APP+'/'+rel:digest(ROOT/'app'/rel)for rel in changed}}
 c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
 installed=[];restarted=[];report={}
 try:
  if action=='prepare':
   assert hashes(s,list(baseline))==baseline
   f=s.open_sftp()
   try:f.get(GAME+'/index.html',str(ROOT/'index.before.html'));f.put(str(WB/'tools/qa_fishing_full_live_20260906.js'),stage+'/tools/qa_fishing_full_live_20260906.js')
   finally:f.close()
   old=(ROOT/'index.before.html').read_text(encoding='utf-8');new,n=re.subn(r'(js/main\.min_a6195824\.js)(?:\?[^\s\"\'<>]*)?',r'\1?v=20260906_fishing_full_v1',old);assert n==1
   (ROOT/'index.fixed.html').write_text(new,encoding='utf-8');baseline[GAME+'/index.html']=digest(ROOT/'index.before.html')
   for rel in changed:assert hashes(s,[stage+'/app/'+rel])[stage+'/app/'+rel]==digest(ROOT/'app'/rel),'STAGE_DRIFT_'+rel
   assert hashes(s,[stage+'/main.fixed.js'])[stage+'/main.fixed.js']==digest(ROOT/'main.fixed.js')
   write('deploy-prepared.json',{'stage':stage,'baseline':baseline,'changed':changed,'serverHashes':{rel:digest(ROOT/'app'/rel)for rel in changed},'mainHash':digest(ROOT/'main.fixed.js'),'indexHash':digest(ROOT/'index.fixed.html'),'qaHash':digest(WB/'tools/qa_fishing_full_live_20260906.js')});print('PREPARED_NO_PRODUCTION_WRITES');return
  prepared=json.loads((ROOT/'deploy-prepared.json').read_text());baseline=prepared['baseline'];expected={**baseline,**{APP+'/'+rel:sha for rel,sha in prepared['serverHashes'].items()},GAME+'/js/main.min_a6195824.js':prepared['mainHash'],GAME+'/index.html':prepared['indexHash']}
  if action=='verify':
   assert hashes(s,list(expected))==expected;deployed=json.loads((ROOT/'deploy-full.json').read_text());assert pm2(s)==deployed['afterPm2']
   served={k:run(s,f'curl -fsS --max-time 15 http://127.0.0.1:81/{p} | sha256sum').split()[0]for k,p in [('main','js/main.min_a6195824.js'),('index','')]};assert served['main']==prepared['mainHash'] and served['index']==prepared['indexHash']
   script="""const{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const o={};for(const n of ['lhs_s1001','lhs_s1002']){const d=c.db(n);o[n]={qa:await d.collection('players').countDocuments({userId:/^qafull_/}),mail:await d.collection('mails').countDocuments({userId:/^qafull_/}),bottles:await d.collection('fishingbottles').countDocuments({owner:/^qafull_/}),withFishingEvents:await d.collection('players').countDocuments({isBot:{$ne:true},'activityInfo.datas.id':33001})};}await c.close();console.log(JSON.stringify(o));})().catch(e=>{console.error(e.message);process.exitCode=1;});"""
   stats=json.loads(run(s,'node -',script));assert all(v['qa']==v['mail']==v['bottles']==0 for v in stats.values())
   out={'result':'VERIFIED','time':datetime.now(timezone.utc).isoformat(),'hashCount':len(expected),'pm2':pm2(s),'ready':ready(s),'served':served,'stats':stats};assert out['ready']=={'8080':200,'8083':200};write('verify-full.json',out);print(json.dumps(out));return
  assert {rel:digest(ROOT/'app'/rel)for rel in changed}==prepared['serverHashes'];assert digest(ROOT/'main.fixed.js')==prepared['mainHash'];assert digest(WB/'tools/qa_fishing_full_live_20260906.js')==prepared['qaHash'];assert hashes(s,list(baseline))==baseline
  before=pm2(s);assert ready(s)=={'8080':200,'8083':200};backup=stage.replace('/temp/','/backups/');run(s,f'install -d -m 700 {backup}')
  targets=[(ROOT/'app'/rel,APP+'/'+rel)for rel in changed]+[(ROOT/'main.fixed.js',GAME+'/js/main.min_a6195824.js'),(ROOT/'index.fixed.html',GAME+'/index.html')]
  report={'result':'INSTALLING','backup':backup,'startedAt':datetime.now(timezone.utc).isoformat(),'beforePm2':before,'liveQa':{}}
  f=s.open_sftp()
  try:
   for i,(local,remote)in enumerate(targets):
    if baseline.get(remote):run(s,f'cp -a {remote} {backup}/{i}.before')
    f.put(str(local),stage+f'/install-{i}');assert hashes(s,[stage+f'/install-{i}'])[stage+f'/install-{i}']==digest(local)
  finally:f.close()
  # Compatibility: old clients fail closed on missing request envelope, never consume.
  for i,(_,remote)in enumerate(targets[:-2]):
   installed.append((i,remote));run(s,f'install -m 644 {stage}/install-{i} {remote}.full-next; mv -f {remote}.full-next {remote}')
  stagedExpected={**expected,GAME+'/js/main.min_a6195824.js':baseline[GAME+'/js/main.min_a6195824.js'],GAME+'/index.html':baseline[GAME+'/index.html']}
  assert hashes(s,list(stagedExpected))==stagedExpected
  for name,port,sid in [('lhs-s1002',8083,1002),('lhs-s1001',8080,1001)]:
   restarted.append(name);print(json.dumps({'step':'restart','name':name}),flush=True);run(s,'pm2 restart '+name,timeout=60);wait_ready(s,port)
   qa=json.loads(run(s,f'node {stage}/tools/qa_fishing_full_live_20260906.js {sid}',timeout=60));assert qa['result']=='PASS';report['liveQa'][str(sid)]=qa;write('deploy-progress.json',report);print(json.dumps({'step':'qa-pass','server':sid}),flush=True)
  for i in range(len(targets)-2,len(targets)):
   remote=targets[i][1];installed.append((i,remote));run(s,f'install -m 644 {stage}/install-{i} {remote}.full-next; mv -f {remote}.full-next {remote}')
  after=pm2(s);assert all(next(q for q in after if q['name']==p['name'])==p for p in before if p['name']not in restarted);assert hashes(s,list(expected))==expected
  report.update(result='DEPLOYED',expected=expected,afterPm2=after,ready=ready(s),finishedAt=datetime.now(timezone.utc).isoformat());write('deploy-full.json',report);print(json.dumps({'result':'DEPLOYED','backup':backup}))
 except Exception as error:
  report.update(result='FAIL',error=str(error));write('deploy-full-error.json',report)
  if installed:
   for i,remote in reversed(installed):
    if baseline.get(remote):run(s,f'install -m 644 {report["backup"]}/{i}.before {remote}')
    else:run(s,f'mv {remote} {report["backup"]}/{i}.rolled-back-new')
   for name in restarted:run(s,'pm2 restart '+name,timeout=60);wait_ready(s,8083 if name=='lhs-s1002'else 8080)
   report['rollbackReady']=ready(s);write('deploy-full-error.json',report)
  raise
 finally:s.close()
if __name__=='__main__':main()
