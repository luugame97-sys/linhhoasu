"""Stage only. No production source install, no restart, no event activation."""
import json,sys
from datetime import datetime,timezone
import paramiko
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready,digest
from pathlib import Path
WB=Path(__file__).resolve().parents[1];ROOT=WB/'temp/fishing_full_candidate_20260906';APP='/linhhoasu/lhs/newServer'
def main():
 sys.stdout.reconfigure(encoding='utf-8');manifest=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'));baseline=manifest['expected'];c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
 try:
  assert hashes(s,list(baseline))==baseline,'PRODUCTION_DRIFT';before=pm2(s)
  stage='/linhhoasu/_ai_workbench/temp/fishing_full_'+datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');run(s,f'install -d -m 700 {stage}/app {stage}/tools; cp -a {APP}/src {stage}/app/src; cp -a {APP}/scripts {stage}/app/scripts')
  f=s.open_sftp();changed=[]
  try:
   for p in (ROOT/'app/src').rglob('*'):
    if not p.is_file():continue
    rel=p.relative_to(ROOT/'app').as_posix();sha=digest(p)
    if baseline.get(APP+'/'+rel)!=sha:f.put(str(p),stage+'/app/'+rel);changed.append(rel)
   for name in ['server.bin','lang.bin','main.js','main.fixed.js','client-known-build.json','gameplay-client-build.json']:f.put(str(ROOT/name),stage+'/'+name)
   for name in ['test_fishing_gameplay_events_20260906.js','test_fishing_full_known_20260906.js','test_fishing_auto_20260906.js','test_fishing_gear_fix_20260906.js','test_fishing_balance_20260906.js','test_huyenvu_daily_20260906.js','fishing_legacy_regression_adapter_20260906.js','test_fishing_mongo_integration_20260906.js']:f.put(str(WB/'tools'/name),stage+'/tools/'+name)
   f.put(str(WB.parent/'linhhoasu/lhs/newServer/node_modules/acorn/dist/acorn.js'),stage+'/tools/acorn.js')
   f.put(str(WB/'temp/fishing_auto_20260906/main.js'),stage+'/auto-original.js');f.put(str(WB/'temp/fishing_audit_20260906T041024Z/app/src/handlers/commerce-compat.js'),stage+'/commerce-baseline.js')
  finally:f.close()
  env=f'NODE_PATH={APP}/node_modules FISH_ACORN_PATH={stage}/tools/acorn.js FISH_ROOM_REGISTRY=1 FISH_AUTO_FRAMED=1 AUTO_ORIGINAL_MAIN={stage}/auto-original.js AUTO_SKIP_COMMERCE_DIAGNOSTICS=1 DAILY_BASE_SOURCE={stage}/commerce-baseline.js'
  results={}
  for name in ['gameplay_events','full_known','auto','gear_fix','balance','daily']:
   script='test_huyenvu_daily_20260906.js' if name=='daily' else 'test_fishing_'+name+'_20260906.js';adapter=f'--require {stage}/tools/fishing_legacy_regression_adapter_20260906.js 'if name in ['gear_fix','balance']else ''
   results[name]=json.loads(run(s,f'{env} timeout 55s node {adapter}{stage}/tools/{script} {stage}',timeout=60));assert results[name]['result']=='PASS',name
   print(json.dumps({'test':name,'count':results[name]['count'],'result':'PASS'}),flush=True)
  integration=run(s,f'{env} timeout 55s node {stage}/tools/test_fishing_mongo_integration_20260906.js {stage}',timeout=60)
  parsed=json.loads(integration);assert parsed['result']=='PASS'
  assert hashes(s,list(baseline))==baseline;assert pm2(s)==before
  out={'result':'STAGED','stage':stage,'changedFiles':changed,'tests':results,'mongoIntegration':parsed,'beforePm2':before,'ready':ready(s),'productionWrites':0}
  (ROOT/'stage-full.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8');print(json.dumps({'result':'STAGED','stage':stage,'count':sum(t['count']for t in results.values()),'mongoIntegration':parsed['result']}))
 finally:s.close()
if __name__=='__main__':main()
