"""Narrow release: native keep toggle + automatic sale ACK/continuation."""
import hashlib
import json
import shlex
import subprocess
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

WB = Path(__file__).resolve().parents[1]
LOCAL = WB / 'temp/auto_delegate_sell_fix_20260914'
APP = '/linhhoasu/lhs/newServer'
SCOPE = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003']
MANIFEST = json.loads((LOCAL / 'baseline.json').read_text())
FILES = {'main.js': LOCAL / 'main.js', 'index.html': LOCAL / 'index.html',
         'item.js': WB.parent / 'linhhoasu/lhs/newServer/src/handlers/item.js'}
TESTS = ['test_auto_delegate_sell_fix_20260914.js', 'test_auto_delegate_keep_row_20260914.js']

def sha(data): return hashlib.sha256(data).hexdigest()
def rsha(ssh, path): return run(ssh, 'sha256sum -- ' + shlex.quote(path)).split()[0]
def processes(ssh):
    # Only non-secret process fields enter the evidence.
    return json.loads(run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>console.log(JSON.stringify(JSON.parse(s).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))));'"))
def ready(ssh):
    states = {}
    for _ in range(15):
        for port in [8080,8083,8084]:
            try: states[str(port)] = run(ssh, f"curl -fsS --max-time 3 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip()
            except RuntimeError: states[str(port)] = '000'
        if set(states.values()) == {'200'}: return states
        time.sleep(1)
    raise RuntimeError('READY_FAILED:' + json.dumps(states))

def main():
    for name in TESTS:
        subprocess.run(['node',str(WB/'tools'/name)],cwd=WB.parent,check=True,timeout=60)
    payloads = {k:p.read_bytes() for k,p in FILES.items()}
    hashes = {k:sha(v) for k,v in payloads.items()}
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    stage = '/linhhoasu/_ai_workbench/temp/auto_delegate_sell_fix_' + stamp
    backup = '/linhhoasu/_ai_workbench/backups/auto_delegate_sell_fix_' + stamp
    evidence = {'startedAtVN':datetime.now(timezone(timedelta(hours=7))).isoformat(), 'stage':stage,'backup':backup,'hashes':hashes,'realPlayerWrites':0}
    ssh = connect(); applied=[]
    try:
        for k in FILES:
            if rsha(ssh, MANIFEST[k]['remote']) != MANIFEST[k]['sha256']: raise RuntimeError('BASELINE_CHANGED:'+k)
        evidence['before'] = processes(ssh); ready(ssh)
        run(ssh,'mkdir -p -- '+shlex.quote(stage)+' '+shlex.quote(backup))
        with ssh.open_sftp() as sftp:
            for k, data in payloads.items():
                with sftp.open(stage+'/'+k,'wb') as f: f.write(data)
                if rsha(ssh,stage+'/'+k) != hashes[k]: raise RuntimeError('STAGE_HASH:'+k)
            for name in TESTS: sftp.put(str(WB/'tools'/name),stage+'/'+name)
            for name in ['main.js.before','eui.bin.before','functions.json']: sftp.put(str(LOCAL/name),stage+'/'+name)
        for k in ['main.js','item.js']: run(ssh,'node --check '+shlex.quote(stage+'/'+k))
        env = f'AUTO_SELL_APP={APP} AUTO_SELL_FIXTURE={stage} AUTO_SELL_FUNCTIONS={stage}/functions.json CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'
        evidence['stagedTests'] = {}
        for test in TESTS:
            output=run(ssh,f'{env} AUTO_SELL_ITEM_PATH={stage}/item.js node {stage}/{test}')
            result=json.loads(output.strip().splitlines()[-1]); assert result['result']=='PASS'
            evidence['stagedTests'][test]=result
        print('STAGED_TESTS_PASS; applying 3 files',flush=True)
        for k in FILES:
            remote=MANIFEST[k]['remote']
            if rsha(ssh,remote)!=MANIFEST[k]['sha256']: raise RuntimeError('CAS_CHANGED:'+k)
            run(ssh,'cp -p -- '+shlex.quote(remote)+' '+shlex.quote(backup+'/'+k))
        for k in ['item.js','main.js','index.html']:
            remote=MANIFEST[k]['remote']; temp=remote+'.auto-sell-fix'
            run(ssh,'cp -- '+shlex.quote(stage+'/'+k)+' '+shlex.quote(temp)+' && mv -- '+shlex.quote(temp)+' '+shlex.quote(remote))
            applied.append(k)
        for name in SCOPE: run(ssh,'pm2 reload '+name)
        evidence['ready']=ready(ssh)
        for k in FILES:
            if rsha(ssh,MANIFEST[k]['remote'])!=hashes[k]: raise RuntimeError('POST_HASH:'+k)
        for test in TESTS:
            result=json.loads(run(ssh,f'{env} node {stage}/{test}').strip().splitlines()[-1]); assert result['result']=='PASS'
        served=run(ssh,'curl -fsS --max-time 15 http://127.0.0.1:81/js/main.min_a6195824.js?v=20260914_auto_sell_fix_v2 | sha256sum').split()[0]
        assert served==hashes['main.js'],'SERVED_MAIN_MISMATCH'
        assert '20260914_auto_sell_fix_v2' in run(ssh,'curl -fsS --max-time 10 http://127.0.0.1:81/')
        evidence['after']=processes(ssh)
        prior={p['name']:p for p in evidence['before']}
        for p in evidence['after']:
            if p['name'] in SCOPE: assert p['status']=='online'
            elif p['name'] in prior: assert p['pid']==prior[p['name']]['pid'],'UNRELATED_PID_CHANGED:'+p['name']
        evidence.update(result='DEPLOY_VERIFIED',servedMainSha256=served,finishedAtVN=datetime.now(timezone(timedelta(hours=7))).isoformat())
    except Exception as error:
        evidence['result']='FAILED'; evidence['error']=str(error)
        if applied:
            for k in reversed(applied):
                remote=MANIFEST[k]['remote']
                if rsha(ssh,remote)!=hashes[k]: raise RuntimeError('ROLLBACK_CAS_CHANGED:'+k) from error
                run(ssh,'cp -p -- '+shlex.quote(backup+'/'+k)+' '+shlex.quote(remote))
            for name in SCOPE: run(ssh,'pm2 reload '+name)
            evidence['rollbackReady']=ready(ssh)
        raise
    finally:
        ssh.close()
        (LOCAL/'release.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(evidence,ensure_ascii=True))
if __name__=='__main__': main()
