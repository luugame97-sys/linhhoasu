"""Hash-guarded reward candidate: stage first, explicit deploy flag, exact rollback."""
import hashlib
import json
import os
import shlex
import sys
from datetime import datetime,timezone
from pathlib import Path
import paramiko
from deploy_usable_item_fixes_20260905 import run,pm2_state,health

WB=Path(__file__).resolve().parents[1]
REL=WB/'temp/reward_release_20260905'
APP='/linhhoasu/lhs/newServer'
BASE=json.loads((REL/'baseline.json').read_text(encoding='utf-8'))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
sys.stdout.reconfigure(encoding='utf-8')
changed={}
for file in (REL/'app/src').rglob('*.js'):
    relative=file.relative_to(REL/'app').as_posix()
    old=BASE['files'].get('app/'+relative,{}).get('sha256')
    if sha(file)!=old:changed[relative]={'before':old,'after':sha(file),'local':str(file)}
assert 1<=len(changed)<=20
assert all(r['exit']==0 for r in json.loads((REL/'regressions.json').read_text(encoding='utf-8')))
credentials=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh.connect(credentials[0].strip(),username='root',password=credentials[2],look_for_keys=False,allow_agent=False,timeout=20)
stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
stage='/linhhoasu/_ai_workbench/temp/reward_release_'+stamp
backup='/linhhoasu/_ai_workbench/backups/reward_release_'+stamp
evidence={'generatedAt':datetime.now(timezone.utc).isoformat(),'stage':stage,'backup':backup,'files':changed,'deployed':False}
installed=[];stopped=False
def ready(port):
    command=f"for i in $(seq 1 45); do test \"$(curl -s -o /dev/null -w '%{{http_code}}' --max-time 1 http://127.0.0.1:{port}/ready)\" = 200 && exit 0; sleep 1; done; exit 1"
    run(ssh,command,timeout=55)
try:
    evidence['beforePm2']=pm2_state(ssh)
    evidence['beforeHealth']=[health(ssh,9200),health(ssh,9201)]
    for relative,row in changed.items():
        remote=APP+'/'+relative
        actual=run(ssh,f"if test -f {shlex.quote(remote)}; then sha256sum {shlex.quote(remote)}; else echo MISSING; fi").split()[0]
        assert actual==(row['before'] or 'MISSING'),'REMOTE_DRIFT:'+relative
    run(ssh,f'install -d -m 700 {stage}/app {stage}/tools {stage}/temp/reward_release_20260905/client {stage}/logs')
    run(ssh,f'cp -a {APP}/src {stage}/app/ && ln -s {APP}/node_modules {stage}/app/node_modules')
    sftp=ssh.open_sftp()
    for relative,row in changed.items():sftp.put(row['local'],stage+'/app/'+relative)
    for name in ['test_reward_release_20260905.js','test_reward_cash_recovery_20260905.js','qa_reward_release_live_20260905.js']:
        sftp.put(str(WB/'tools'/name),stage+'/tools/'+name)
    sftp.put(str(REL/'client/main.js'),stage+'/temp/reward_release_20260905/client/main.js')
    sftp.put(str(WB/'temp/item_catalog_production_recheck_20260905.json'),stage+'/temp/item_catalog_production_recheck_20260905.json')
    sftp.put(str(WB.parent/'linhhoasu/lhs/newServer/node_modules/acorn/dist/acorn.js'),stage+'/tools/acorn.js')
    sftp.close()
    for relative in changed:run(ssh,'node --check '+shlex.quote(stage+'/app/'+relative))
    env=f'NODE_ENV=test LOG_DIR= REWARD_TEST_ACORN={stage}/tools/acorn.js LHS_APP_ROOT={stage}/app LHS_CONFIG_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'
    evidence['stageContract']=run(ssh,f'cd {stage} && {env} node tools/test_reward_release_20260905.js',timeout=60)
    evidence['stageRecovery']=run(ssh,f'cd {stage} && {env} node tools/test_reward_cash_recovery_20260905.js',timeout=60)
    evidence['stagePassed']=True
    if '--deploy' in sys.argv:
        run(ssh,f'install -d -m 700 {backup}/files')
        for i,(relative,row) in enumerate(changed.items()):
            if row['before']:run(ssh,f'cp -a {shlex.quote(APP+"/"+relative)} {backup}/files/{i:02d}.before')
        # Both processes share this source tree: stop both to avoid mixed lazy modules.
        run(ssh,'pm2 stop lhs-s1001 lhs-s1002',timeout=35);stopped=True
        for relative,row in changed.items():
            run(ssh,f'cp -a {shlex.quote(stage+"/app/"+relative)} {shlex.quote(APP+"/"+relative)}')
            installed.append(relative)
        run(ssh,'pm2 restart lhs-s1001',timeout=35);ready(8080)
        evidence['s1Qa']=run(ssh,f'cd {APP} && NODE_ENV=test LOG_DIR= node {stage}/tools/qa_reward_release_live_20260905.js',timeout=100)
        run(ssh,'pm2 restart lhs-s1002',timeout=35);ready(8083);stopped=False
        evidence['installedHashes']={relative:run(ssh,'sha256sum '+shlex.quote(APP+'/'+relative)).split()[0] for relative in changed}
        assert all(evidence['installedHashes'][relative]==row['after'] for relative,row in changed.items())
        evidence['deployed']=True
        evidence['afterPm2']=pm2_state(ssh)
        evidence['afterHealth']=[health(ssh,9200),health(ssh,9201)]
except Exception as error:
    evidence['error']=str(error)
    if installed or stopped:
        run(ssh,'pm2 stop lhs-s1001 lhs-s1002',timeout=35)
        for i,(relative,row) in enumerate(changed.items()):
            if relative not in installed:continue
            if row['before']:run(ssh,f'cp -a {backup}/files/{i:02d}.before {shlex.quote(APP+"/"+relative)}')
            else:run(ssh,'rm -f -- '+shlex.quote(APP+'/'+relative))
        run(ssh,'pm2 restart lhs-s1001 lhs-s1002',timeout=35);ready(8080);ready(8083)
        evidence['rolledBack']=True
    raise
finally:
    ssh.close()
    target=REL/('deploy_'+stamp+'.json')
    target.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'evidence':str(target),'changed':len(changed),'stagePassed':evidence.get('stagePassed'),'deployed':evidence['deployed'],'rolledBack':evidence.get('rolledBack',False),'error':evidence.get('error','')},ensure_ascii=False))
