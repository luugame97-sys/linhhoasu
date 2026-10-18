"""Stage/hash-test and install narrow in-process Donate conversion route."""
import json,shlex,sys,time,hashlib
from snapshot_web_multiserver_20260906 import WB,connect
from snapshot_donate_revision_20260907 import ROOT,APP
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready,wait_ready
FILES=['src/config/donateRevision20260907.json','src/services/DonateRevisionService.js','src/net/HTTPServer.js']
STAGE='/linhhoasu/_ai_workbench/temp/donate_service_20260907';BACKUP='/linhhoasu/_ai_workbench/backups/donate_service_20260907'
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 sys.stdout.reconfigure(encoding='utf-8');mode=sys.argv[1];ssh=connect();cand=ROOT/'candidate/app';manifest=json.loads((ROOT/'manifest.json').read_text())
 baseline={APP+'/'+rel:manifest['sources'].get(APP+'/'+rel)for rel in FILES}
 try:
  if mode=='stage':
   assert hashes(ssh,list(baseline))==baseline,'LIVE_DRIFT'
   run(ssh,'install -d -m 700 '+STAGE+'/app '+STAGE+'/tools; cp -a '+APP+'/src '+STAGE+'/app/src; cp -a '+APP+'/scripts '+STAGE+'/app/scripts')
   with ssh.open_sftp()as f:
    for rel in FILES:f.put(str(cand/rel),STAGE+'/app/'+rel)
    for name in ['test_donate_recovery_20260907.js','donate_revision_api_20260907.js']:f.put(str(WB/'tools'/name),STAGE+'/tools/'+name)
    f.put(str(ROOT/'recovery-plan.json'),STAGE+'/plan.json');f.put(str(WB/'temp/fishing_contest_shop_20260906/server.bin'),STAGE+'/server.bin')
   for rel in FILES[1:]:run(ssh,'node --check '+STAGE+'/app/'+rel)
   # Test resolves the real mutex relative to cwd; source is staged, no game DB.
   testSource=(WB/'tools/test_donate_recovery_20260907.js').read_text(encoding='utf-8').replace("path.resolve('linhhoasu/lhs/newServer/src/services/PlayerMutationService')",json.dumps(STAGE+'/app/src/services/PlayerMutationService.js'))
   with ssh.open_sftp()as f:
    with f.open(STAGE+'/tools/test_donate_recovery_20260907.js','w')as out:out.write(testSource)
   tests=json.loads(run(ssh,'NODE_PATH='+APP+'/node_modules node '+STAGE+'/tools/test_donate_recovery_20260907.js '+STAGE+'/app'));assert tests['result']=='PASS'
   core=run(ssh,'cd '+STAGE+'/app && NODE_PATH='+APP+'/node_modules NODE_ENV=test LOG_DIR= CONFIG_BIN_PATH='+STAGE+'/server.bin node scripts/test-core-gameplay-contract.js',timeout=55)
   if '"result": "ok"'not in core and '"result":"ok"'not in core:raise RuntimeError('CORE_NOT_PASS')
   result={'phase':'staged','stage':STAGE,'backup':BACKUP,'baseline':baseline,'expected':{APP+'/'+rel:digest(cand/rel)for rel in FILES},'tests':tests,'core':core,'beforePm2':pm2(ssh),'ready':ready(ssh)}
   (ROOT/'service-stage.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'phase':'staged','tests':tests['count'],'core':'ok'}));return
  assert mode=='deploy';state=json.loads((ROOT/'service-stage.json').read_text());assert hashes(ssh,list(baseline))==baseline,'PREDEPLOY_DRIFT'
  before=pm2(ssh);assert ready(ssh)=={'8080':200,'8083':200};run(ssh,'install -d -m 700 '+BACKUP)
  for i,rel in enumerate(FILES):
   assert hashes(ssh,[STAGE+'/app/'+rel])[STAGE+'/app/'+rel]==state['expected'][APP+'/'+rel]
   if baseline[APP+'/'+rel]:run(ssh,'cp -a '+APP+'/'+rel+' '+BACKUP+'/'+str(i)+'.before')
   run(ssh,'install -m 644 '+STAGE+'/app/'+rel+' '+APP+'/'+rel)
  for name,port in [('lhs-s1002',8083),('lhs-s1001',8080)]:
   run(ssh,'pm2 restart '+name,timeout=55);wait_ready(ssh,port);print(json.dumps({'step':'ready','process':name}),flush=True)
  after=pm2(ssh)
  assert all(next(r for r in after if r['name']==p['name'])==p for p in before if p['name']not in ['lhs-s1001','lhs-s1002'])
  assert hashes(ssh,list(state['expected']))==state['expected']
  result={'phase':'deployed','beforePm2':before,'afterPm2':after,'backup':BACKUP,'expected':state['expected'],'ready':ready(ssh),'dataActions':0}
  (ROOT/'service-deploy.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'phase':'deployed','ready':result['ready'],'dataActions':0}))
 finally:ssh.close()
if __name__=='__main__':main()
