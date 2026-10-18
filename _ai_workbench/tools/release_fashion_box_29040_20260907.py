"""Small source-only rollout. No remediation until separate explicit operator run."""
import hashlib,json,shlex,stat,sys,difflib
from datetime import datetime,timezone
from snapshot_web_multiserver_20260906 import WB,connect
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready,wait_ready
ROOT=WB/'temp/fashion_box_29040_20260907';APP='/linhhoasu/lhs/newServer';STAGE='/linhhoasu/_ai_workbench/temp/fashion_box_29040_20260907';LOCAL=WB.parent/'linhhoasu/lhs/newServer'
FILES=['src/services/FashionBoxService.js','src/services/FashionBoxRepairService.js','src/services/RewardGrantService.js','src/net/HTTPServer.js']
GUARDS=['src/handlers/item.js','src/handlers/mail.js','src/handlers/fashion.js','src/services/FishingEconomyService.js','src/services/RoleAppearanceService.js','src/services/PlayerService.js','src/services/PlayerMutationService.js','src/net/WSServer.js','src/services/BattleService.js','src/handlers/account.js']
CLIENT='/linhhoasu/webgame/game/js/main.min_a6195824.js';BIN='/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(name,v):(ROOT/name).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def candidate(rel):return ROOT/'HTTPServer.candidate.js' if rel=='src/net/HTTPServer.js' else LOCAL/rel
def main():
 ROOT.mkdir(exist_ok=True);mode=sys.argv[1];s=connect();state=None;installed=[];restarted=[]
 try:
  if mode=='operator':
   state=json.loads((ROOT/'release.json').read_text());assert state['result']=='DEPLOYED'
   assert hashes(s,list(state['expected']))==state['expected'],'LIVE_DRIFT_BEFORE_REPAIR'
   action=sys.argv[2];assert action in ['plan','apply','verify']
   with s.open_sftp() as f:f.put(str(WB/'tools/fashion_box_operator_20260907.js'),STAGE+'/tools/fashion_box_operator_20260907.js')
   arguments=action
   if action=='apply':
    sid=int(sys.argv[3]);assert sid in [1001,1002];limit=int(sys.argv[4]) if len(sys.argv)>4 else 25;assert 1<=limit<=50
    arguments+=' '+str(sid)+' '+str(limit)
   output=run(s,'node '+STAGE+'/tools/fashion_box_operator_20260907.js '+arguments,timeout=60)
   print(output.strip())
   with s.open_sftp() as f:
    names=['targets.json'] if action=='plan' else ['results-'+str(sid)+'.json'] if action=='apply' else ['verify.json']
    for n in names:f.get(STAGE+'/'+n,str(ROOT/n))
   return
  if mode=='inspect':
   with s.open_sftp() as f:
    for rel in FILES[2:]:
     name=rel.split('/')[-1]
     with f.open(APP+'/'+rel,'rb') as remote:raw=remote.read()
     old=(WB/'backups/fashion_box_29040_20260907'/name).read_bytes()
     (ROOT/(name+'.live-before')).write_bytes(raw)
     print(name,json.dumps({'localHash':hashlib.sha256(old).hexdigest(),'liveHash':hashlib.sha256(raw).hexdigest(),'lineEndingsOnly':old.replace(b'\r\n',b'\n')==raw.replace(b'\r\n',b'\n')}))
     if old.replace(b'\r\n',b'\n')!=raw.replace(b'\r\n',b'\n'):print(''.join(list(difflib.unified_diff(old.decode().splitlines(True),raw.decode().splitlines(True),n=2))[:100]))
   return
  if mode=='stage':
   assert not (ROOT/'release.json').exists(),'RELEASE_EXISTS'
   baseline=hashes(s,[APP+'/'+r for r in FILES+GUARDS]+[CLIENT,BIN])
   for r in FILES[:2]:assert baseline[APP+'/'+r] is None,'NEW_FILE_EXISTS'
   assert baseline[APP+'/src/services/RewardGrantService.js']==h(WB/'backups/fashion_box_29040_20260907/RewardGrantService.js'),'SOURCE_DRIFT'
   with s.open_sftp() as f:
    with f.open(APP+'/src/net/HTTPServer.js','rb') as source:remote_http=source.read()
   original=(WB/'backups/fashion_box_29040_20260907/HTTPServer.js').read_bytes()
   normalized_remote=remote_http.replace(b'\r',b'')
   preserved_route=b"    internalRouter.post('/player/donate-revision-20260907', async (req, res) => {\n      try { res.json(await require('../services/DonateRevisionService').dispatch(req.body || {}, this.wsServer)); }\n      catch (error) { res.status(409).json({ success: false, error: error.message }); }\n    });\n"
   assert normalized_remote.count(preserved_route)==1,'DONATE_ROUTE_SHAPE'
   assert original.replace(b'\r',b'')==normalized_remote.replace(preserved_route,b'',1),'HTTP_OTHER_LOGIC_DRIFT'
   local_http=(LOCAL/'src/net/HTTPServer.js').read_bytes().replace(b'\r',b'')
   start=local_http.index(b"    internalRouter.post('/player/repair-fashion-box-29040'")
   end=local_http.index(b'    // ',start)
   insert=local_http[start:end]
   assert local_http.replace(insert,b'',1)==original.replace(b'\r',b''),'HTTP_PATCH_SCOPE'
   anchor=b'    // '+local_http[end+7:local_http.index(b'\n',end)]
   # Preserve the live file's existing CR/CR/LF encoding, insert only the new route.
   assert remote_http.count(anchor)==1,'HTTP_ANCHOR';(ROOT/'HTTPServer.candidate.js').write_bytes(remote_http.replace(anchor,insert.replace(b'\n',b'\r\r\n')+anchor,1))
   for r in GUARDS:assert baseline[APP+'/'+r]==h(LOCAL/r),'GUARD_DRIFT_'+r
   assert baseline[CLIENT]==h(WB.parent/'linhhoasu/webgame/game/js/main.min_a6195824.js')
   before=pm2(s);assert ready(s)=={'8080':200,'8083':200}
   for sub in ['candidate/src/services','candidate/src/net','tools']:run(s,'install -d -m 700 '+STAGE+'/'+sub)
   with s.open_sftp() as f:
    for rel in FILES:f.put(str(candidate(rel)),STAGE+'/candidate/'+rel)
    for name in ['test_fashion_box_29040_20260907.js','fashion_box_candidate_overlay_20260907.js','fashion_box_operator_20260907.js','qa_fashion_box_live_20260907.js']:f.put(str(WB/'tools'/name),STAGE+'/tools/'+name)
   for rel in FILES:run(s,'node --check '+STAGE+'/candidate/'+rel)
   env='FASHION_CANDIDATE_ROOT='+STAGE+'/candidate NODE_ENV=test LOG_DIR= CONFIG_BIN_PATH='+BIN
   test=json.loads(run(s,env+' node -r '+STAGE+'/tools/fashion_box_candidate_overlay_20260907.js '+STAGE+'/tools/test_fashion_box_29040_20260907.js '+APP,timeout=45));assert test['result']=='PASS' and test['count']==20
   core=run(s,env+' node -r '+STAGE+'/tools/fashion_box_candidate_overlay_20260907.js '+APP+'/scripts/test-core-gameplay-contract.js',timeout=50);assert '"result":"ok"' in core or '"result": "ok"' in core
   inventory=json.loads(run(s,'node '+STAGE+'/tools/fashion_box_operator_20260907.js inventory',timeout=30))
   state={'result':'STAGED','at':datetime.now(timezone.utc).isoformat(),'baseline':baseline,'expected':{**baseline,**{APP+'/'+r:h(candidate(r)) for r in FILES}},'pm2':before,'tests':test,'core':core,'inventory':inventory,'httpPreservedLiveLineEndings':True}
   save('stage.json',state);print(json.dumps({'result':'STAGED','tests':test['count'],'core':'PASS','inventory':inventory}));return
  if mode=='verify':
   state=json.loads((ROOT/'release.json').read_text());assert state['result']=='DEPLOYED';assert hashes(s,list(state['expected']))==state['expected'];assert ready(s)=={'8080':200,'8083':200};assert pm2(s)==state['afterPm2'];print(json.dumps({'result':'VERIFIED','ready':ready(s),'sourceHashes':True}));return
  assert mode=='deploy';assert not (ROOT/'release.json').exists(),'RELEASE_EXISTS'
  stage=json.loads((ROOT/'stage.json').read_text());assert stage['result']=='STAGED';assert hashes(s,list(stage['baseline']))==stage['baseline'],'DRIFT';assert pm2(s)==stage['pm2'],'PROCESS_DRIFT'
  for rel in FILES:assert h(candidate(rel))==stage['expected'][APP+'/'+rel],'LOCAL_CANDIDATE_CHANGED'
  backup='/linhhoasu/_ai_workbench/backups/fashion_box_code_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');run(s,'install -d -m 700 '+backup)
  state={'result':'PREPARING','backup':backup,'baseline':stage['baseline'],'expected':stage['expected'],'beforePm2':pm2(s),'installed':[],'restarted':[]};save('release.json',state)
  with s.open_sftp() as f:
   for i,rel in enumerate(FILES):
    dst=APP+'/'+rel
    if stage['baseline'][dst]:run(s,'cp -p '+dst+' '+backup+'/'+str(i)+'.before')
    a=f.stat(dst if stage['baseline'][dst] else APP+'/src/services/RewardGrantService.js');nextFile=backup+'/'+str(i)+'.next';f.put(str(candidate(rel)),nextFile);f.chmod(nextFile,stat.S_IMODE(a.st_mode));f.chown(nextFile,a.st_uid,a.st_gid)
    assert hashes(s,[nextFile])[nextFile]==state['expected'][dst]
   assert hashes(s,list(stage['baseline']))==stage['baseline'],'FINAL_CAS'
   for i,rel in enumerate(FILES):f.posix_rename(backup+'/'+str(i)+'.next',APP+'/'+rel);installed.append(i);state['installed']=installed;save('release.json',state)
  for name,sid,port in [('lhs-s1002',1002,8083),('lhs-s1001',1001,8080)]:
   restarted.append(name);state['restarted']=restarted;save('release.json',state);run(s,'pm2 restart '+name,timeout=55);wait_ready(s,port)
   qa=json.loads(run(s,'node '+STAGE+'/tools/qa_fashion_box_live_20260907.js '+str(sid),timeout=55));assert qa['result']=='PASS';state.setdefault('qa',{})[str(sid)]=qa;save('release.json',state);print(json.dumps({'server':sid,'ready':True,'liveQA':qa}),flush=True)
  assert hashes(s,list(stage['expected']))==stage['expected'],'POST_HASH'
  after=pm2(s)
  for p in state['beforePm2']:
   q=next(x for x in after if x['name']==p['name'])
   if p['name'] in restarted:assert q['status']=='online' and q['restarts']==p['restarts']+1
   else:assert p==q,'UNRELATED_PROCESS_CHANGED'
  state.update(result='DEPLOYED',afterPm2=after,ready=ready(s),finishedAt=datetime.now(timezone.utc).isoformat());save('release.json',state);print(json.dumps({'result':'DEPLOYED','backup':backup,'ready':state['ready']}))
 except Exception as error:
  if mode=='deploy' and state:
   state.update(result='FAILED',error=str(error));save('release.json',state)
   if installed:
    with s.open_sftp() as f:
     for i in reversed(installed):
      dst=APP+'/'+FILES[i];assert hashes(s,[dst])[dst]==state['expected'][dst],'ROLLBACK_DRIFT'
      if state['baseline'][dst]:run(s,'cp -p '+state['backup']+'/'+str(i)+'.before '+state['backup']+'/'+str(i)+'.restore');f.posix_rename(state['backup']+'/'+str(i)+'.restore',dst)
      else:f.posix_rename(dst,state['backup']+'/'+str(i)+'.unused')
    for name in restarted:run(s,'pm2 restart '+name,timeout=55);wait_ready(s,8083 if name=='lhs-s1002' else 8080)
    state.update(rolledBack=True,rollbackReady=ready(s));save('release.json',state)
  raise
 finally:s.close()
if __name__=='__main__':main()
