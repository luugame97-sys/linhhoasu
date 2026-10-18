from __future__ import annotations
import ast, hashlib, json, posixpath, shlex, shutil
from datetime import datetime, timezone
from pathlib import Path
import paramiko

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / 'linhhoasu/webgame/game/js/main.min_drop200.js'
REMOTE = '/linhhoasu/webgame/game/js/main.min_drop200.js'
EXPECTED_BEFORE = 'af75e33c0bc3607ca82b01f432a74fc5c7fd94c2072826d3422ad6bad4e5e578'
EXPECTED_MARKER = '(Y.TaskModel.getActivityTaskDataById(t.id,i.taskId)||{}).status'

def sha(data: bytes) -> str: return hashlib.sha256(data).hexdigest()

def ssh_config():
    source = (ROOT / '_ai_workbench/tools/vps_exec.py').read_text(encoding='utf-8-sig')
    tree = ast.parse(source)
    call = next(n for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == 'connect')
    args = [ast.literal_eval(n) for n in call.args]
    kwargs = {n.arg: ast.literal_eval(n.value) for n in call.keywords}
    kwargs.update(timeout=20, banner_timeout=20, auth_timeout=20)
    return args, kwargs

def main():
    data = LOCAL.read_bytes()
    if EXPECTED_MARKER.encode() not in data:
        raise RuntimeError('LOCAL_MARKER_MISSING')
    args, kwargs = ssh_config()
    c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect(*args, **kwargs)
    sftp = c.open_sftp()
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/newyear_client_guard_{stamp}'
    stage = f'{REMOTE}.newyear_{stamp}.tmp'
    receipt = ROOT / '_ai_workbench/temp/newyear_client_guard_20261011/deployment.json'
    report = {'result': 'STARTED', 'backup': backup, 'stage': stage, 'remote': REMOTE, 'candidateSha256': sha(data), 'productionWrites': 0, 'playerWrites': 0}
    swapped = False
    try:
        def run(cmd):
            _, out, err = c.exec_command(cmd, timeout=60); text = out.read().decode('utf8','replace'); code = out.channel.recv_exit_status()
            if code: raise RuntimeError(f'REMOTE_FAILED:{code}:{err.read().decode("utf8","replace")[-600:]}')
            return text.strip()
        live_sha = run(f'sha256sum -- {shlex.quote(REMOTE)}').split()[0]
        report['beforeSha256'] = live_sha
        if live_sha != EXPECTED_BEFORE: raise RuntimeError(f'CAS_DRIFT:{live_sha}')
        run(f'install -d -m 700 {shlex.quote(backup)}')
        run(f'cp -p -- {shlex.quote(REMOTE)} {shlex.quote(backup + "/main.min_drop200.js")}')
        with sftp.open(stage, 'wb') as f: f.write(data)
        run(f'chmod 644 {shlex.quote(stage)}')
        staged = run(f'sha256sum -- {shlex.quote(stage)}').split()[0]
        if staged != report['candidateSha256']: raise RuntimeError('STAGE_HASH_MISMATCH')
        run(f'mv -f -- {shlex.quote(stage)} {shlex.quote(REMOTE)}'); swapped = True
        after = run(f'sha256sum -- {shlex.quote(REMOTE)}').split()[0]
        if after != report['candidateSha256']: raise RuntimeError('LIVE_HASH_MISMATCH')
        report['afterSha256'] = after
        report['http'] = run("curl -sS -o /dev/null -w '%{http_code}' --max-time 5 'http://127.0.0.1:81/js/main.min_drop200.js?v=20261011_newyear_guard'")
        if report['http'] != '200': raise RuntimeError('HTTP_PROBE_FAILED')
        report['result'] = 'DEPLOYED_NO_RESTART'
    except Exception as exc:
        report['result'] = 'FAILED'; report['error'] = str(exc)
        if swapped:
            try: run(f'cp -p -- {shlex.quote(backup + "/main.min_drop200.js")} {shlex.quote(REMOTE)}'); report['rollback'] = 'RESTORED'
            except Exception as rollback_exc: report['rollback'] = f'FAILED:{rollback_exc}'
        raise
    finally:
        try: run(f'rm -f -- {shlex.quote(stage)}')
        except Exception: pass
        sftp.close(); c.close(); receipt.parent.mkdir(parents=True, exist_ok=True); receipt.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8'); print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == '__main__': main()
