"""Preview, then stop only affected game processes, commit atomic replacements and resume."""
import hashlib,json,shlex,sys
from pathlib import Path
from datetime import datetime,timezone
import paramiko
from deploy_usable_item_fixes_20260905 import run,pm2_state,health
WB=Path(__file__).resolve().parents[1];APP='/linhhoasu/lhs/newServer'
sys.stdout.reconfigure(encoding='utf-8')
commit='--commit' in sys.argv
stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
stage='/linhhoasu/_ai_workbench/temp/gem_box_conversion_'+stamp
backup='/linhhoasu/_ai_workbench/backups/gem_box_conversion_'+stamp
creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
result={'generatedAt':datetime.now(timezone.utc).isoformat(),'stage':stage,'backup':backup,'requestedCommit':commit,'committed':False}
stopped=[]
env='NODE_ENV=audit LOG_DIR= CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'
def invoke(suffix=''):
 text=run(ssh,f'cd {APP} && {env} GEM_REPAIR_BACKUP={backup} node {stage}/repair.js {suffix}',timeout=60)
 return json.loads(text.split('GEM_REPAIR_RESULT=',1)[1].splitlines()[0])
def ready(port):
 run(ssh,f"for n in $(seq 1 35); do test \"$(curl -s --max-time 1 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready)\" = 200 && exit 0; sleep 1; done; exit 1",timeout=50)
try:
 result['beforePm2']=pm2_state(ssh);result['beforeHealth']=[health(ssh,9200),health(ssh,9201)]
 run(ssh,f'install -d -m 700 {stage}')
 sf=ssh.open_sftp();sf.put(str(WB/'tools/repair_gem_boxes_20260905.js'),stage+'/repair.js');sf.close()
 run(ssh,f'node --check {stage}/repair.js');result['selfTest']=run(ssh,f'node {stage}/repair.js --self-test')
 result['preview']=invoke()
 if commit:
  affected=[db for db,row in result['preview']['databases'].items() if row['eligiblePlayers']>0]
  assert not any(row['blocked'] for row in result['preview']['databases'].values()),'preview has invalid data'
  for db in affected:
   name='lhs-s1001' if db=='lhs_s1001' else 'lhs-s1002'
   state=next(p for p in result['beforePm2'] if p['name']==name)
   assert state['status']=='online'
   stopped.append(name);run(ssh,'pm2 stop '+name,timeout=35)
  result['stopped']=stopped[:]
  state=pm2_state(ssh);assert all(next(p for p in state if p['name']==n)['status']=='stopped' for n in stopped)
  # Rescan after graceful stop flushes sessions; do not use stale preview counts.
  result['frozenPreview']=invoke()
  assert not any(row['blocked'] for row in result['frozenPreview']['databases'].values())
  assert all(db in affected or row['eligiblePlayers']==0 for db,row in result['frozenPreview']['databases'].items()),'new affected server must be stopped first'
  result['commit']=invoke('--commit');result['committed']=True
  result['secondRun']=invoke('--commit')
  assert all(r['convertedPlayers']==0 and r['remainingPlayers']==0 for r in result['secondRun']['databases'].values()),'not idempotent'
except Exception as error:
 result['error']=str(error)
 raise
finally:
 try:
  for name in stopped:
   run(ssh,'pm2 restart '+name,timeout=35);ready(8080 if name=='lhs-s1001' else 8083)
  result['afterPm2']=pm2_state(ssh);result['afterHealth']=[health(ssh,9200),health(ssh,9201)]
  if result['committed']:result['postRestart']=invoke()
 finally:
  ssh.close();target=WB/'temp'/('gem_box_conversion_'+stamp+'.json');target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  def compact(payload):return {db:{k:v for k,v in row.items() if k!='subjects'} for db,row in payload.get('databases',{}).items()}
  print(json.dumps({'evidence':str(target),'committed':result['committed'],'backup':backup,'preview':compact(result.get('preview',{})),'commit':compact(result.get('commit',{})),'postRestart':compact(result.get('postRestart',{})),'error':result.get('error')},ensure_ascii=False))
