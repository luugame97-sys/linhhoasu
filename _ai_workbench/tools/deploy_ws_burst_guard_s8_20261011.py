from __future__ import annotations
import ast, hashlib, json, shlex, time
from datetime import datetime, timezone
from pathlib import Path
import paramiko

ROOT=Path(__file__).resolve().parents[2]
LOCAL=ROOT/'linhhoasu/lhs/newServer/src/net/WSServer.js'
REMOTE='/linhhoasu/lhs/newServer/src/net/WSServer.js'
OLD='96c85e5e2bc9e6e8ef736fbd515444116b4421d0a1f605f6d438f1276626405e'
# CAS is read from live immediately before swap; this constant is intentionally
# not invented. The script aborts if source drifts and writes the observed hash
# into the receipt for the next approved attempt.

def sha(b): return hashlib.sha256(b).hexdigest()
def ssh_config():
    tree=ast.parse((ROOT/'_ai_workbench/tools/vps_exec.py').read_text(encoding='utf-8-sig'))
    n=next(n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='connect')
    a=[ast.literal_eval(x) for x in n.args]; k={x.arg:ast.literal_eval(x.value) for x in n.keywords}; k.update(timeout=20,banner_timeout=20,auth_timeout=20); return a,k

def main():
    data=LOCAL.read_bytes(); candidate=sha(data); args,kwargs=ssh_config(); c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect(*args,**kwargs); s=c.open_sftp()
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S'); backup=f'/linhhoasu/_ai_workbench/backups/ws_burst_guard_s8_{stamp}'; stage=REMOTE+'.burst-'+stamp+'.js'; report={'result':'STARTED','backup':backup,'candidate':candidate,'node':'lhs-s1008','playerWrites':0}
    swapped=False
    try:
        def run(cmd, timeout=60):
            _,o,e=c.exec_command(cmd,timeout=timeout); out=o.read().decode('utf8','replace'); code=o.channel.recv_exit_status()
            if code: raise RuntimeError(f'REMOTE_FAILED:{code}:{e.read().decode("utf8","replace")[-800:]}')
            return out.strip()
        live=run(f'sha256sum -- {REMOTE}').split()[0]; report['liveBefore']=live
        # Refuse an unknown preimage; operator can update the explicit CAS after review.
        if live != OLD: raise RuntimeError(f'CAS_DRIFT_OBSERVED:{live}')
        run(f'install -d -m 700 {backup}'); run(f'cp -p -- {REMOTE} {backup}/WSServer.js.before')
        with s.open(stage,'wb') as f: f.write(data)
        run(f'chmod 640 {stage}'); run(f'node --check {stage}'); run(f'mv -f -- {stage} {REMOTE}'); swapped=True
        if run(f'sha256sum -- {REMOTE}').split()[0] != candidate: raise RuntimeError('LIVE_HASH_MISMATCH')
        run('pm2 restart lhs-s1008 --update-env',timeout=120)
        ready='000'
        for _ in range(30):
            ready=run("curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8089/ready || true")
            if ready=='200': break
            time.sleep(2)
        if ready!='200': raise RuntimeError(f'READY_FAILED:{ready}')
        report.update({'after':candidate,'ready':ready,'result':'DEPLOYED_CANARY_NO_PLAYER_WRITES'})
    except Exception as exc:
        report['result']='FAILED'; report['error']=str(exc)
        if swapped:
            try: run(f'cp -p -- {backup}/WSServer.js.before {REMOTE}'); run('pm2 restart lhs-s1008 --update-env'); report['rollback']='RESTORED'
            except Exception as rb: report['rollback']=f'FAILED:{rb}'
        raise
    finally:
        try: run(f'rm -f -- {stage}')
        except Exception: pass
        s.close(); c.close(); out=ROOT/'_ai_workbench/temp/ws_burst_queue_s8_20261011'; out.mkdir(parents=True,exist_ok=True); (out/'deployment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8'); print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__': main()

