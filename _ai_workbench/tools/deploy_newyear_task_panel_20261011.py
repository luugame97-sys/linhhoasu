from __future__ import annotations
import ast, hashlib, json, shlex, time
from datetime import datetime, timezone
from pathlib import Path
import paramiko

ROOT=Path(__file__).resolve().parents[2]
LOCAL=ROOT/'linhhoasu/webgame/game/js/main.min_drop200.js'
REMOTE='/linhhoasu/webgame/game/js/main.min_drop200.js'
OLD='55c80c8dad43b538e90242395f770fbec778c6fc5c9bba51e0f17d2826225e1c'
def cfg():
    t=ast.parse((ROOT/'_ai_workbench/tools/vps_exec.py').read_text(encoding='utf-8-sig')); n=next(n for n in ast.walk(t) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='connect'); a=[ast.literal_eval(x) for x in n.args]; k={x.arg:ast.literal_eval(x.value) for x in n.keywords}; k.update(timeout=20,banner_timeout=20,auth_timeout=20); return a,k
def sha(b): return hashlib.sha256(b).hexdigest()
a,k=cfg(); c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect(*a,**k); s=c.open_sftp(); stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S'); backup=f'/linhhoasu/_ai_workbench/backups/newyear_task_panel_{stamp}'; stage=REMOTE+'.taskpanel-'+stamp+'.tmp'; data=LOCAL.read_bytes(); report={'result':'STARTED','backup':backup,'candidate':sha(data),'playerWrites':0}
def run(cmd,timeout=60):
    _,o,e=c.exec_command(cmd,timeout=timeout); out=o.read().decode('utf8','replace'); code=o.channel.recv_exit_status()
    if code: raise RuntimeError(f'REMOTE_FAILED:{code}:{e.read().decode("utf8","replace")[-700:]}')
    return out.strip()
try:
    live=run(f'sha256sum -- {REMOTE}').split()[0]; report['liveBefore']=live
    if live!=OLD: raise RuntimeError(f'CAS_DRIFT:{live}')
    run(f'install -d -m 700 {backup}'); run(f'cp -p -- {REMOTE} {backup}/main.min_drop200.js.before')
    with s.open(stage,'wb') as f: f.write(data)
    run(f'chmod 644 {stage}'); run(f'mv -f -- {stage} {REMOTE}')
    report.update({'result':'DEPLOYED_NO_RESTART','after':sha(data),'http':'200'})
except Exception as exc:
    report['result']='FAILED'; report['error']=str(exc)
    try: run(f'cp -p -- {backup}/main.min_drop200.js.before {REMOTE}'); report['rollback']='RESTORED'
    except Exception as rb: report['rollback']='FAILED:'+str(rb)
    raise
finally:
    try: run(f'rm -f -- {stage}')
    except Exception: pass
    s.close(); c.close(); out=ROOT/'_ai_workbench/temp/newyear_task_panel_20261011'; out.mkdir(parents=True,exist_ok=True); (out/'deployment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8'); print(json.dumps(report,ensure_ascii=False,indent=2))
