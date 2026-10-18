"""Deploy the two-file native client patch without restarting backend services."""
from __future__ import annotations
import hashlib, json, os, shlex
from datetime import datetime, timezone
from pathlib import Path
import paramiko

HOST='103.116.105.154'
ROOT=Path(__file__).resolve().parents[1]
SNAP=ROOT/'temp/silent_mode_snapshot_20260904_044003'
FILES={
    'main.min_a6195824.js':('/linhhoasu/webgame/game/js/main.min_a6195824.js',SNAP/'main.min_a6195824.candidate.js'),
    'index.html':('/linhhoasu/webgame/game/index.html',SNAP/'index.candidate.html'),
}
manifest=json.loads((SNAP/'manifest.json').read_text(encoding='utf-8'))
expected={x['remote']:x['sha256'] for x in manifest['files']}
credentials=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines()
if credentials[0].strip()!=HOST or credentials[1].strip()!='root':raise RuntimeError('TARGET_MISMATCH')
stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
backup='/linhhoasu/_ai_workbench/backups/silent_reward_always_open_'+stamp
stage='/linhhoasu/_ai_workbench/temp/silent_reward_always_open_'+stamp
evidence=ROOT/'temp'/('silent_reward_always_open_deploy_'+stamp+'.json')
ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh.connect(HOST,username='root',password=credentials[2],look_for_keys=False,allow_agent=False,timeout=20)
installed=[]
def run(cmd,timeout=60):
    _,o,e=ssh.exec_command(cmd,timeout=timeout);out=o.read().decode('utf-8','replace');err=e.read().decode('utf-8','replace')
    if o.channel.recv_exit_status():raise RuntimeError((err+out)[-3000:])
    return out
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def pm2():
    script='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s).map(p=>({name:p.name,pid:p.pid,restarts:p.pm2_env.restart_time,status:p.pm2_env.status})))))'
    return json.loads(run('pm2 jlist | node -e '+shlex.quote(script)))
try:
    before_pm2=pm2()
    for _,(remote,_) in FILES.items():
        if run('sha256sum '+shlex.quote(remote)).split()[0]!=expected[remote]:raise RuntimeError('REMOTE_DRIFT:'+remote)
    run('install -d -m 700 '+backup+' '+stage)
    sftp=ssh.open_sftp()
    try:
        for name,(remote,local) in FILES.items():
            run('cp -a '+shlex.quote(remote)+' '+shlex.quote(backup+'/'+name))
            sftp.put(str(local),stage+'/'+name)
    finally:sftp.close()
    run('node --check '+stage+'/main.min_a6195824.js')
    run("grep -q '20260904_silent_reward_always_open1' "+stage+'/index.html')
    for name,(remote,local) in FILES.items():
        run('install -m 644 '+shlex.quote(stage+'/'+name)+' '+shlex.quote(remote));installed.append(name)
        if run('sha256sum '+shlex.quote(remote)).split()[0]!=digest(local):raise RuntimeError('HASH_MISMATCH:'+name)
    served_main=run('curl -sS --max-time 30 http://127.0.0.1:81/js/main.min_a6195824.js')
    served_index=run('curl -sS --max-time 10 http://127.0.0.1:81/')
    checks={
        'oldClickGateAbsent':'silenceDealOpenDay>=T.serverOpenDay?(this.silentModeBox.selected=!1' not in served_main,
        'alwaysTogglePresent':'_.onSilentMode=function(){U9.autoConfig.isSilentMode=!U9.autoConfig.isSilentMode}' in served_main,
        'unlockLabelHidden':'silentModeOpenLab.visible=!1,this.silentModeLab.textColor=5067090' in served_main,
        'rewardFlowPresent':'if(U9.autoConfig.isSilentMode)' in served_main,
        'persistWrite':'t.writeBoolean(e.isSilentMode)' in served_main,
        'persistRead':'i.isSilentMode=e.readBoolean()' in served_main,
        'cacheMarker':'main.min_a6195824.js?v=20260904_silent_reward_always_open1' in served_index,
    }
    if not all(checks.values()):raise RuntimeError('SERVED_CONTRACT_FAILED:'+json.dumps(checks))
    codes=run("curl -sS -o /dev/null -w 'root=%{http_code} main=%{http_code}' http://127.0.0.1:81/; curl -sS -o /dev/null -w ' main=%{http_code}' http://127.0.0.1:81/js/main.min_a6195824.js")
    after_pm2=pm2()
    if before_pm2!=after_pm2:raise RuntimeError('PROCESS_STATE_CHANGED')
    payload={'result':'PASS','generatedAt':datetime.now(timezone.utc).isoformat(),'backup':backup,'checks':checks,'http':codes,'beforePm2':before_pm2,'afterPm2':after_pm2,'hashes':{n:digest(l) for n,(_,l) in FILES.items()}}
    evidence.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'result':'PASS','backup':backup,'evidence':str(evidence),'sha256':digest(evidence),'hashes':payload['hashes']},ensure_ascii=False))
except Exception:
    for name in reversed(installed):run('cp -a '+shlex.quote(backup+'/'+name)+' '+shlex.quote(FILES[name][0]))
    raise
finally:ssh.close()
