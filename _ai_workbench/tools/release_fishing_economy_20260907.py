"""Scoped rollout with baseline guards, S2 canary, real QA and rollback checkpoints."""
import hashlib,json,re,shlex,sys
from datetime import datetime,timezone
from snapshot_web_multiserver_20260906 import WB,connect
from stage_fishing_economy_20260907 import ROOT,BASE,APP,GAME,STAGE,FILES
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready,wait_ready
STATE=ROOT/'deploy.json'
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(value):STATE.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def main():
 sys.stdout.reconfigure(encoding='utf-8');mode=sys.argv[1];s=connect();state={};installed=[];restarted=[]
 try:
  if mode=='verify':
   state=json.loads(STATE.read_text());assert state['result']=='DEPLOYED';assert hashes(s,list(state['expected']))==state['expected'],'HASH_DRIFT'
   assert pm2(s)==state['afterPm2'],'PROCESS_DRIFT';assert ready(s)=={'8080':200,'8083':200}
   urls={GAME+'/index.html':'/',GAME+'/update/resource/assets/excel/config_e5ac72c2.bin':'/update/resource/assets/excel/config_e5ac72c2.bin',GAME+'/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin':'/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin'}
   for remote,url in urls.items():assert run(s,'curl -fsS --max-time 15 '+shlex.quote('http://127.0.0.1:81'+url+'?v=20260907_fishing_economy_v1')+' | sha256sum').split()[0]==state['expected'][remote]
   result={'result':'VERIFIED','at':datetime.now(timezone.utc).isoformat(),'sourceFiles':len(state['expected']),'ready':ready(s),'pm2':pm2(s),'httpHashes':True};(ROOT/'verify.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));return
  assert mode=='deploy';assert not STATE.exists(),'ALREADY_RUN_REVIEW_CHECKPOINT'
  pre=json.loads((ROOT/'preflight.json').read_text());stage=json.loads((ROOT/'stage.json').read_text());manifest=json.loads((BASE/'manifest.json').read_text());assert stage['tests']['result']=='PASS';assert hashes(s,list(pre['expected']))==pre['expected'],'LIVE_DRIFT';assert pm2(s)==pre['processes'],'PM2_DRIFT'
  index=(ROOT/'index.before.html').read_bytes();nextIndex,n=re.subn(rb"var translationVersion = '[^']+';",b"var translationVersion = '20260907_fishing_economy_v1';",index);assert n==1
  (ROOT/'index.fixed.html').write_bytes(nextIndex)
  targets=[(ROOT/'app'/rel,APP+'/'+rel)for rel in FILES]+[(ROOT/'server.bin',manifest['files']['server.bin']['remote']),(ROOT/'client.bin',manifest['files']['client.bin']['remote']),(ROOT/'lang.bin',manifest['files']['lang.bin']['remote']),(ROOT/'index.fixed.html',GAME+'/index.html')]
  backup='/linhhoasu/_ai_workbench/backups/fishing_economy_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');run(s,'install -d -m 700 '+backup)
  state={'result':'PREPARING','backup':backup,'beforePm2':pm2(s),'expected':{remote:h(p)for p,remote in targets},'baseline':pre['expected'],'liveQA':{}};write(state)
  with s.open_sftp()as f:
   f.put(str(WB/'tools/qa_fishing_economy_live_20260907.js'),STAGE+'/tools/qa_live.js')
   for i,(local,remote)in enumerate(targets):
    if pre['expected'].get(remote):run(s,'cp -a '+shlex.quote(remote)+' '+backup+'/'+str(i)+'.before')
    f.put(str(local),backup+'/'+str(i)+'.next')
    assert hashes(s,[backup+'/'+str(i)+'.next'])[backup+'/'+str(i)+'.next']==h(local)
  # Existing 8 source dependencies and server binary installed before reload.
  for i,(_,remote)in enumerate(targets[:-3]):
   run(s,'install -m 644 '+backup+'/'+str(i)+'.next '+shlex.quote(remote+'.eco-next')+'; mv -f '+shlex.quote(remote+'.eco-next')+' '+shlex.quote(remote));installed.append((i,remote));state['installed']=installed;write(state)
  for name,port,sid in [('lhs-s1002',8083,1002),('lhs-s1001',8080,1001)]:
   restarted.append(name);state['restarted']=restarted;write(state);run(s,'pm2 restart '+name,timeout=55);wait_ready(s,port);print(json.dumps({'step':'ready','server':sid}),flush=True)
   qa=json.loads(run(s,'node '+STAGE+'/tools/qa_live.js '+str(sid),timeout=90));assert qa['result']=='PASS';state['liveQA'][str(sid)]=qa;write(state);print(json.dumps({'step':'qa-pass','server':sid,'checks':qa}),flush=True)
  for i in range(len(targets)-3,len(targets)):
   remote=targets[i][1];run(s,'install -m 644 '+backup+'/'+str(i)+'.next '+shlex.quote(remote+'.eco-next')+'; mv -f '+shlex.quote(remote+'.eco-next')+' '+shlex.quote(remote));installed.append((i,remote))
  assert hashes(s,list(state['expected']))==state['expected'];after=pm2(s)
  assert all(next(q for q in after if q['name']==p['name'])==p for p in state['beforePm2']if p['name']not in restarted)
  state.update(result='DEPLOYED',installed=installed,afterPm2=after,ready=ready(s),finishedAt=datetime.now(timezone.utc).isoformat());write(state);print(json.dumps({'result':'DEPLOYED','backup':backup,'ready':state['ready']}))
 except Exception as e:
  if state and mode=='deploy':
   state.update(result='FAILED',error=str(e),installed=installed,restarted=restarted);write(state)
   for i,remote in reversed(installed):
    if state['baseline'].get(remote):run(s,'cp -a '+state['backup']+'/'+str(i)+'.before '+shlex.quote(remote))
    else:run(s,'mv '+shlex.quote(remote)+' '+state['backup']+'/'+str(i)+'.unused')
   for name in restarted:run(s,'pm2 restart '+name,timeout=55);wait_ready(s,8083 if name=='lhs-s1002' else 8080)
   state['rolledBack']=bool(installed);state['rollbackReady']=ready(s);write(state)
  raise
 finally:s.close()
if __name__=='__main__':main()
