from __future__ import annotations
import ast, hashlib, json, shlex
from datetime import datetime, timezone
from pathlib import Path
import paramiko

ROOT=Path(__file__).resolve().parents[2]
REMOTE='/linhhoasu/webgame/game/index.html'
OLD='js/main.min_drop200.js?v=20261008_oldtrek_popup_v1'
NEW='js/main.min_drop200.js?v=20261011_newyear_guard_v1'

def sha(b): return hashlib.sha256(b).hexdigest()
def ssh_config():
    tree=ast.parse((ROOT/'_ai_workbench/tools/vps_exec.py').read_text(encoding='utf-8-sig'))
    n=next(n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='connect')
    a=[ast.literal_eval(x) for x in n.args]; k={x.arg:ast.literal_eval(x.value) for x in n.keywords}; k.update(timeout=20,banner_timeout=20,auth_timeout=20); return a,k

def main():
    a,k=ssh_config(); c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect(*a,**k); s=c.open_sftp()
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S'); backup=f'/linhhoasu/_ai_workbench/backups/newyear_index_cache_{stamp}'; stage=f'{REMOTE}.newyear_{stamp}.tmp'
    report={'result':'STARTED','backup':backup,'remote':REMOTE,'productionWrites':0,'playerWrites':0}
    swapped=False
    try:
        with s.open(REMOTE,'rb') as f: before=f.read()
        count=before.count(OLD.encode())
        if count!=1: raise RuntimeError(f'INDEX_MARKER_COUNT:{count}')
        report['beforeSha256']=sha(before); after=before.replace(OLD.encode(),NEW.encode()); report['candidateSha256']=sha(after)
        def run(cmd):
            _,o,e=c.exec_command(cmd,timeout=60); out=o.read().decode('utf8','replace'); code=o.channel.recv_exit_status()
            if code: raise RuntimeError(f'REMOTE_FAILED:{code}:{e.read().decode("utf8","replace")[-600:]}')
            return out.strip()
        run(f'install -d -m 700 {shlex.quote(backup)}'); run(f'cp -p -- {REMOTE} {backup}/index.html')
        with s.open(stage,'wb') as f: f.write(after)
        run(f'chmod 644 {stage}'); run(f'mv -f -- {stage} {REMOTE}'); swapped=True
        with s.open(REMOTE,'rb') as f: live=f.read()
        report['afterSha256']=sha(live); report['markerPresent']=NEW in live.decode('utf8','replace'); report['http']=run("curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:81/index.html")
        if report['afterSha256']!=report['candidateSha256'] or not report['markerPresent'] or report['http']!='200': raise RuntimeError('INDEX_VERIFY_FAILED')
        report['result']='DEPLOYED_NO_RESTART'
    except Exception as exc:
        report['result']='FAILED'; report['error']=str(exc)
        if swapped:
            try: run(f'cp -p -- {backup}/index.html {REMOTE}'); report['rollback']='RESTORED'
            except Exception as rb: report['rollback']=f'FAILED:{rb}'
        raise
    finally:
        try: run(f'rm -f -- {stage}')
        except Exception: pass
        s.close(); c.close(); out=ROOT/'_ai_workbench/temp/newyear_client_guard_20261011'; out.mkdir(parents=True,exist_ok=True); (out/'index_deployment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8'); print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__': main()
