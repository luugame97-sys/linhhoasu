"""Stage and deploy the scoped Quản gia Điền farm handler fix with CAS/rollback."""
import hashlib,json,shlex,sys
from datetime import datetime,timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import WB,connect
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready,wait_ready
from deploy_farm_alchemy_20260908 import install_one,log_positions

APP='/linhhoasu/lhs/newServer'
GAME='/linhhoasu/webgame/game'
TARGET=APP+'/src/handlers/farm.js'
OUT=WB/'temp/farm_manager_fix_20260909'
LOCAL_CANDIDATE=WB/'temp/farm_manager_audit_20260909/candidate-farm.js'
TESTS=['test-farm-alchemy-fix.js','test-farm-foundation.js']

def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(name,data): (OUT/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def test_env(source,stage,patch=GAME+'/js/lhs-farm-alchemy-v2.js'):
 return ('CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin '
         f'FEATURE_APP={source} FEATURE_RUNTIME={APP} FEATURE_GAME={GAME} '
         f'FEATURE_MAIN={GAME}/js/main.min_a6195824.js FEATURE_PATCH={patch} '
         f'FEATURE_ACORN={stage}/tools/acorn.js')
def run_tests(s,source,stage):
 result={}
 for name in TESTS:
  out=run(s,test_env(source,stage)+f' node {stage}/app/scripts/{name}',timeout=90)
  result[name]=json.loads(out)
  assert result[name]['result']=='PASS',name
 return result

def check_scoped_logs(s, positions):
 # PM2 restart closes existing Mongo/Redis sessions. These exact close-path
 # messages are expected during shutdown; keep rejecting all other runtime
 # markers (TypeError, startup failure, lock failure, unknown rejection).
 js = r"""const fs=require('fs');const pos=POSITIONS;const out=[];for(const[p,start]of Object.entries(pos)){if(!fs.existsSync(p))continue;const len=fs.statSync(p).size,off=len<start?0:start,n=Math.min(len-off,262144);if(!n)continue;const f=fs.openSync(p,'r'),b=Buffer.alloc(n);fs.readSync(f,b,0,n,len-n);fs.closeSync(f);const lines=b.toString('utf8').split('\\n');const raw=lines.filter(x=>/uncaught exception|unhandled rejection|startup failed|TypeError|ReferenceError|SyntaxError|Cannot find module|FARM_WRITER_NOT_LOCKED|FARM_TARGET_NOT_LOCKED|PLAYER_LOCK_UPGRADE_DENIED/.test(x));const allowed=raw.filter(x=>/Connection is closed/.test(x)&&(/session cleanup check failed|save on close failed|tag=1/.test(x)));out.push({file:p,newBytes:n,failures:raw.filter(x=>!allowed.includes(x)).slice(-10),shutdownClose:allowed.length,mongooseReservedWarning:lines.some(x=>/reserved schema/.test(x))});}console.log(JSON.stringify(out));""".replace('POSITIONS',json.dumps(positions))
 result=json.loads(run(s,'node -',js));assert not any(r['failures'] for r in result),'POST_RESTART_ERROR_MARKER: '+json.dumps(result);return result

def stage_release(s):
 OUT.mkdir(exist_ok=True)
 assert LOCAL_CANDIDATE.exists(), 'CANDIDATE_MISSING'
 before=hashes(s,[TARGET])[TARGET]
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
 stage='/linhhoasu/_ai_workbench/temp/farm_manager_fix_'+stamp
 run(s,f'install -d -m 700 {stage}/app/scripts {stage}/tools; cp -a {APP}/src {stage}/app/src; ln -s {APP}/node_modules {stage}/app/node_modules')
 with s.open_sftp() as f:
  f.put(str(LOCAL_CANDIDATE),stage+'/app/src/handlers/farm.js')
  for name in TESTS: f.put(str(WB.parent/'linhhoasu/lhs/newServer/scripts'/name),stage+'/app/scripts/'+name)
  f.put(str(WB.parent/'linhhoasu/lhs/newServer/node_modules/acorn/dist/acorn.js'),stage+'/tools/acorn.js')
 run(s,'node --check '+stage+'/app/src/handlers/farm.js')
 tests=run_tests(s,stage+'/app',stage)
 report={'status':'STAGED_NOT_DEPLOYED','stage':stage,'createdAt':datetime.now(timezone.utc).isoformat(),'before':{TARGET:before},'candidateHashes':{TARGET:sha(LOCAL_CANDIDATE)},'tests':tests,'ready':ready(s),'pm2':pm2(s),'playerDataRepair':False}
 save('stage.json',report)
 print(json.dumps({'status':report['status'],'stage':stage,'before':before,'candidate':report['candidateHashes'][TARGET],'tests':{k:v['count'] for k,v in tests.items()},'ready':report['ready']}))

def rollback(s,report):
 for row in reversed(report['installed']):
  cur=hashes(s,[row['target']])[row['target']]
  if cur==row['before']: continue
  assert cur==row['after'],'ROLLBACK_TARGET_CHANGED'
  install_one(s,row['backup'],row['target'],row['after'],row['before'])
 for name,port in reversed(report['restarted']):
  run(s,'pm2 restart '+name,timeout=60);wait_ready(s,port)
 report['status']='ROLLED_BACK';report['rolledBackAt']=datetime.now(timezone.utc).isoformat();report['ready']=ready(s);save('release.json',report)

def deploy_release(s):
 stage_meta=json.loads((OUT/'stage.json').read_text(encoding='utf-8'))
 assert stage_meta['status']=='STAGED_NOT_DEPLOYED'
 assert hashes(s,list(stage_meta['before']))==stage_meta['before'],'LIVE_BASELINE_DRIFT'
 assert ready(s)=={'8080':200,'8083':200},'NOT_HEALTHY_BEFORE_DEPLOY'
 before_pm2=pm2(s);stage=stage_meta['stage'];candidate=stage+'/app/src/handlers/farm.js';expected=stage_meta['candidateHashes'][TARGET]
 assert hashes(s,[candidate])[candidate]==expected,'STAGED_CANDIDATE_DRIFT'
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup='/linhhoasu/_ai_workbench/backups/farm_manager_fix_'+stamp
 run(s,'install -d -m 700 '+backup);run(s,'cp -a '+shlex.quote(TARGET)+' '+shlex.quote(backup+'/farm.js.before'))
 assert hashes(s,[backup+'/farm.js.before'])[backup+'/farm.js.before']==stage_meta['before'][TARGET]
 positions=log_positions(s)
 report={'status':'INSTALLING','stage':stage,'backup':backup,'beforeHashes':stage_meta['before'],'expectedHashes':{TARGET:expected},'beforePm2':before_pm2,'installed':[],'restarted':[],'canary':{},'playerDataRepair':False}
 save('release.json',report)
 try:
  report['installed'].append({'target':TARGET,'before':stage_meta['before'][TARGET],'after':expected,'backup':backup+'/farm.js.before'});save('release.json',report)
  install_one(s,candidate,TARGET,stage_meta['before'][TARGET],expected)
  for name,port in [('lhs-s1002',8083),('lhs-s1001',8080)]:
   report['restarted'].append((name,port));save('release.json',report)
   run(s,'pm2 restart '+name,timeout=60);wait_ready(s,port)
   canary=run_tests(s,APP,stage)
   logs=check_scoped_logs(s,positions)
   report['canary'][name]={'tests':canary,'newLogs':logs,'ready':200};save('release.json',report)
  after=pm2(s);assert hashes(s,[TARGET])[TARGET]==expected
  assert ready(s)=={'8080':200,'8083':200}
  report.update(status='DEPLOYED',completedAt=datetime.now(timezone.utc).isoformat(),afterPm2=after,ready=ready(s),newLogs=check_scoped_logs(s,positions))
  save('release.json',report)
  print(json.dumps({'status':report['status'],'backup':backup,'ready':report['ready'],'tests':{k:v['count'] for k,v in report['canary']['lhs-s1001']['tests'].items()}}))
 except Exception as error:
  report['error']=str(error);save('release.json',report)
  if report['installed']:
   rollback(s,report)
  raise

def main():
 action=sys.argv[1] if len(sys.argv)>1 else 'stage';s=connect()
 try:
  if action=='stage': stage_release(s)
  elif action=='deploy': deploy_release(s)
  elif action=='rollback': rollback(s,json.loads((OUT/'release.json').read_text(encoding='utf-8')))
  else: raise ValueError('UNKNOWN_ACTION')
 finally: s.close()
if __name__=='__main__': main()
