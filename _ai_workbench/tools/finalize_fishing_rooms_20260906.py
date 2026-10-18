"""Final one-service ACK replay guard; re-run regression and 8-client canaries."""
import json,sys
import paramiko
from release_fishing_rooms_20260906 import ROOT,WB,APP,run,hashes,pm2,ready,wait_ready,digest,write
REL='src/services/FishingRoomService.js';TARGET=APP+'/'+REL
def main():
 sys.stdout.reconfigure(encoding='utf-8');previous=json.loads((ROOT/'ui-update.json').read_text(encoding='utf-8'));expected=previous['expected'];release=json.loads((ROOT/'stage.json').read_text(encoding='utf-8'));stage=release['stage'];installed=False;restarted=[]
 c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
 report={}
 try:
  assert hashes(s,list(expected))==expected,'DRIFT';before=pm2(s);assert ready(s)=={'8080':200,'8083':200}
  f=s.open_sftp()
  try:
   f.put(str(ROOT/'app'/REL),stage+'/app/'+REL)
   for name in ['main.fixed.js','client-build.json']:f.put(str(ROOT/name),stage+'/'+name)
   for name in ['test_fishing_rooms_20260906.js','qa_fishing_rooms_v2_20260906.js']:f.put(str(WB/'tools'/name),stage+'/tools/'+name)
  finally:f.close()
  env=f'NODE_PATH={APP}/node_modules FISH_ACORN_PATH={stage}/tools/acorn.js FISH_ROOM_REGISTRY=1 FISH_AUTO_FRAMED=1 AUTO_ORIGINAL_MAIN={stage}/auto-original.js AUTO_SKIP_COMMERCE_DIAGNOSTICS=1 DAILY_BASE_SOURCE={stage}/commerce-baseline.js'
  tests={}
  for name in ['rooms','auto','gear_fix','balance','daily']:
   script='test_huyenvu_daily_20260906.js' if name=='daily' else 'test_fishing_'+name+'_20260906.js'
   tests[name]=json.loads(run(s,f'{env} timeout 55s node {stage}/tools/{script} {stage}',timeout=60));assert tests[name]['result']=='PASS';print(json.dumps({'test':name,'count':tests[name]['count'],'result':'PASS'}),flush=True)
  backup=stage.replace('/temp/','/backups/')+'/ack-cache';run(s,f'install -d -m 700 {backup}; cp -a {TARGET} {backup}/service.before')
  assert hashes(s,[backup+'/service.before'])[backup+'/service.before']==expected[TARGET]
  report={'result':'INSTALLING','backup':backup,'tests':tests,'beforePm2':before,'liveQa':{}}
  installed=True;run(s,f'install -m 644 {stage}/app/{REL} {TARGET}');newExpected={**expected,TARGET:digest(ROOT/'app'/REL)}
  for name,port,sid in [('lhs-s1002',8083,1002),('lhs-s1001',8080,1001)]:
   restarted.append(name);print(json.dumps({'step':'restart','name':name}),flush=True);run(s,'pm2 restart '+name,timeout=60);wait_ready(s,port)
   qa=json.loads(run(s,f'node {stage}/tools/qa_fishing_rooms_v2_20260906.js {sid}',timeout=60));assert qa['result']=='PASS' and qa['cleanupRemaining']==0
   report['liveQa'][str(sid)]=qa;write('final-progress.json',report);print(json.dumps({'step':'qa-pass','server':sid}),flush=True)
  after=pm2(s);assert all(next(q for q in after if q['name']==p['name'])==p for p in before if p['name']not in restarted)
  assert hashes(s,list(newExpected))==newExpected
  report.update(result='DEPLOYED',expected=newExpected,afterPm2=after,ready=ready(s));write('final-deploy.json',report);print(json.dumps({'result':'DEPLOYED','tests':sum(t['count']for t in tests.values()),'backup':backup}))
 except Exception as e:
  report.update(result='FAIL',error=str(e));write('final-error.json',report)
  if installed:
   run(s,f'install -m 644 {report["backup"]}/service.before {TARGET}')
   for name in restarted:run(s,'pm2 restart '+name,timeout=60);wait_ready(s,8083 if name=='lhs-s1002'else 8080)
  raise
 finally:s.close()
if __name__=='__main__':main()
