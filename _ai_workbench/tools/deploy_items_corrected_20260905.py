"""One checked source tree per process; stage contract and exact preimage rollback."""
import hashlib,json,shlex,sys
from pathlib import Path
from datetime import datetime,timezone
import paramiko
from deploy_usable_item_fixes_20260905 import run,health,pm2_state
WB=Path(__file__).resolve().parents[1];APP='/linhhoasu/lhs/newServer';LOCAL=WB.parent/'linhhoasu/lhs/newServer'
FILES=['src/handlers/item.js','src/services/RandomUsableItemRewardService.js','src/services/RewardGrantService.js']
fixed_release='--fixed-items' in sys.argv
if fixed_release: FILES.append('src/services/FixedEmojiItemService.js')
stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');stage=f'/linhhoasu/_ai_workbench/temp/items_corrected_{stamp}';backup=f'/linhhoasu/_ai_workbench/backups/items_corrected_{stamp}'
sys.stdout.reconfigure(encoding='utf-8')
creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy());ssh.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
result={'generatedAt':datetime.now(timezone.utc).isoformat(),'stage':stage,'backup':backup,'installed':False};touched=False;stopped=False
def ready(port):run(ssh,f"for i in $(seq 1 35); do test \"$(curl -s --max-time 1 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready)\" = 200 && exit 0; sleep 1; done; exit 1",timeout=50)
try:
 result['before']={f:run(ssh,f'if test -f {shlex.quote(APP+"/"+f)}; then sha256sum {shlex.quote(APP+"/"+f)}; else echo MISSING; fi').split()[0] for f in FILES}
 if fixed_release:
  prior=json.loads((WB/'temp/items_corrected_deploy_20260905_074023.json').read_text(encoding='utf-8'))
  assert all(result['before'][f]==h for f,h in prior['after'].items()),'release drift'
  assert result['before'][FILES[-1]]=='MISSING','new service already present'
 else:
  assert result['before'][FILES[0]]=='72a6e25debc3d08d4273531a750323c23f45999204d45140e63e1b887a935674','item.js drift'
  assert result['before'][FILES[2]]=='f25929821bbc643d358b8d5f398b1d0f67113439249895e5a58ba91f38d3b6e6','RewardGrant drift'
 result['beforePm2']=pm2_state(ssh)
 run(ssh,f'install -d -m 700 {stage}/app {stage}/tools {backup}/files')
 run(ssh,f'cp -a {APP}/src {stage}/app/ && ln -s {APP}/node_modules {stage}/app/node_modules')
 sftp=ssh.open_sftp()
 for i,f in enumerate(FILES):
  if result['before'][f]!='MISSING':run(ssh,f'cp -a {shlex.quote(APP+"/"+f)} {backup}/files/{i}.before')
  sftp.put(str(LOCAL/f),stage+'/app/'+f)
 sftp.put(str(WB/'tools/test_gem_family_corrected_20260905.js'),stage+'/tools/test.js')
 if fixed_release:sftp.put(str(WB/'tools/test_fixed_items_20260905.js'),stage+'/tools/test_fixed.js')
 sftp.close()
 for f in FILES:run(ssh,'node --check '+shlex.quote(stage+'/app/'+f))
 env=f'NODE_ENV=test LOG_DIR= LHS_APP_ROOT={stage}/app LHS_CONFIG_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'
 result['stageContract']=run(ssh,f'{env} node {stage}/tools/test.js',timeout=60)
 assert '"result":"PASS"' in result['stageContract']
 if fixed_release:result['fixedContract']=run(ssh,f'{env} node {stage}/tools/test_fixed.js',timeout=60)
 for f in FILES:
  actual=run(ssh,f'if test -f {shlex.quote(APP+"/"+f)}; then sha256sum {shlex.quote(APP+"/"+f)}; else echo MISSING; fi').split()[0]
  assert actual==result['before'][f],'drift before install'
 run(ssh,'pm2 stop lhs-s1001 lhs-s1002',timeout=30);stopped=True;touched=True
 for f in FILES:run(ssh,f'cp -a {shlex.quote(stage+"/app/"+f)} {shlex.quote(APP+"/"+f)}')
 run(ssh,'pm2 restart lhs-s1001 lhs-s1002',timeout=30);ready(8080);ready(8083);stopped=False
 result['after']={f:run(ssh,'sha256sum '+shlex.quote(APP+'/'+f)).split()[0] for f in FILES}
 for f in FILES:assert result['after'][f]==hashlib.sha256((LOCAL/f).read_bytes()).hexdigest()
 result['productionContract']=run(ssh,f'NODE_ENV=test LOG_DIR= LHS_APP_ROOT={APP} LHS_CONFIG_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin node {stage}/tools/test.js',timeout=60)
 result['health']=[health(ssh,9200),health(ssh,9201)];result['pm2']=pm2_state(ssh);result['installed']=True
except Exception as error:
 result['error']=str(error)
 if touched:
  run(ssh,'pm2 stop lhs-s1001 lhs-s1002',timeout=30)
  for i,f in enumerate(FILES):
   if result['before'][f]!='MISSING':run(ssh,f'cp -a {backup}/files/{i}.before {shlex.quote(APP+"/"+f)}')
   else:run(ssh,'rm -f -- '+shlex.quote(APP+'/'+f))
  run(ssh,'pm2 restart lhs-s1001 lhs-s1002',timeout=30);ready(8080);ready(8083);result['rolledBack']=True
 raise
finally:
 ssh.close();target=WB/'temp'/f'items_corrected_deploy_{stamp}.json';target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'evidence':str(target),'installed':result['installed'],'error':result.get('error'),'health':result.get('health')}))
