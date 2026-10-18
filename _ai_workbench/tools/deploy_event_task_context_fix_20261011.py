from __future__ import annotations

import ast
import hashlib
import json
import posixpath
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
FILES = {
    'RealmTaskProgressService.js': {
        'local': ROOT / 'linhhoasu/lhs/newServer/src/services/RealmTaskProgressService.js',
        'remote': '/linhhoasu/lhs/newServer/src/services/RealmTaskProgressService.js',
    },
    'raid.js': {
        'local': ROOT / 'linhhoasu/lhs/newServer/src/handlers/raid.js',
        'remote': '/linhhoasu/lhs/newServer/src/handlers/raid.js',
    },
    'farm.js': {
        'local': ROOT / 'linhhoasu/lhs/newServer/src/handlers/farm.js',
        'remote': '/linhhoasu/lhs/newServer/src/handlers/farm.js',
    },
    'farm1.js': {
        'local': ROOT / 'linhhoasu/lhs/newServer/src/handlers/farm1.js',
        'remote': '/linhhoasu/lhs/newServer/src/handlers/farm1.js',
    },
}
PORTS = {
    'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085,
    'lhs-s1005': 8086, 'lhs-s1006': 8087, 'lhs-s1007': 8088, 'lhs-s1008': 8089,
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def ssh_config():
    source = (ROOT / '_ai_workbench/tools/vps_exec.py').read_text(encoding='utf-8-sig')
    tree = ast.parse(source)
    call = next(node for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == 'connect')
    args = [ast.literal_eval(node) for node in call.args]
    kwargs = {node.arg: ast.literal_eval(node.value) for node in call.keywords}
    kwargs.update(timeout=20, banner_timeout=20, auth_timeout=20)
    return args, kwargs


def main():
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/event_task_context_fix_{stamp}'
    stage = f'/linhhoasu/_ai_workbench/temp/event_task_context_fix_{stamp}'
    out = ROOT / '_ai_workbench/temp/event_task_context_fix_20261011'
    out.mkdir(parents=True, exist_ok=True)
    report = {'result': 'STARTED', 'backup': backup, 'stage': stage, 'files': {}, 'restarts': [], 'playerWrites': 0}
    args, kwargs = ssh_config()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()

    def run(command: str, timeout: int = 90) -> str:
        _, stdout, stderr = client.exec_command(command, timeout=timeout)
        value = stdout.read().decode('utf-8', 'replace')
        code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError(f'REMOTE_FAILED:{code}:{stderr.read().decode("utf-8", "replace")[-900:]}')
        return value.strip()

    swapped = []
    try:
        # Read the exact live preimage and keep it as the CAS baseline.
        for key, meta in FILES.items():
            with sftp.open(meta['remote'], 'rb') as handle:
                live = handle.read()
            candidate = meta['local'].read_bytes()
            report['files'][key] = {
                'remote': meta['remote'],
                'liveBefore': sha(live),
                'candidate': sha(candidate),
                'bytes': len(candidate),
            }
        run(f'install -d -m 700 {shlex.quote(backup)} {shlex.quote(stage)}')
        for key, meta in FILES.items():
            run(f'cp -p -- {shlex.quote(meta["remote"])} {shlex.quote(backup + "/" + key)}')
            stage_path = posixpath.join(stage, key)
            with sftp.open(stage_path, 'wb') as handle:
                handle.write(meta['local'].read_bytes())
            run(f'chmod 640 {shlex.quote(stage_path)}')
            run(f'node --check {shlex.quote(stage_path)}')
            staged_hash = run(f'sha256sum -- {shlex.quote(stage_path)}').split()[0]
            if staged_hash != report['files'][key]['candidate']:
                raise RuntimeError(f'STAGE_HASH_MISMATCH:{key}')

        # CAS re-read immediately before any swap.
        for key, meta in FILES.items():
            now_hash = run(f'sha256sum -- {shlex.quote(meta["remote"])}').split()[0]
            if now_hash != report['files'][key]['liveBefore']:
                raise RuntimeError(f'CAS_DRIFT:{key}:{now_hash}')

        for key, meta in FILES.items():
            stage_path = posixpath.join(stage, key)
            run(f'mv -f -- {shlex.quote(stage_path)} {shlex.quote(meta["remote"])}')
            swapped.append(key)
        for key, meta in FILES.items():
            live_hash = run(f'sha256sum -- {shlex.quote(meta["remote"])}').split()[0]
            if live_hash != report['files'][key]['candidate']:
                raise RuntimeError(f'LIVE_HASH_MISMATCH:{key}')
            report['files'][key]['liveAfter'] = live_hash

        # Rolling restart, one node at a time, with readiness read-back.
        for name, port in PORTS.items():
            run(f'pm2 restart {shlex.quote(name)} --update-env', timeout=120)
            report['restarts'].append({'name': name, 'status': 'restarted'})
            code = '000'
            for _attempt in range(30):
                code = run(f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{port}/ready || true", timeout=20)
                if code == '200':
                    break
                time.sleep(2)
            if code != '200':
                raise RuntimeError(f'READY_FAILED:{name}:{code}')
            report['restarts'][-1]['ready'] = code
        report['result'] = 'DEPLOYED_ROLLING_NO_PLAYER_WRITES'
    except Exception as exc:
        report['result'] = 'FAILED'
        report['error'] = str(exc)
        if swapped:
            report['rollback'] = 'STARTED'
            for key, meta in FILES.items():
                try:
                    run(f'cp -p -- {shlex.quote(backup + "/" + key)} {shlex.quote(meta["remote"])}')
                except Exception as rollback_exc:
                    report.setdefault('rollbackErrors', []).append(f'{key}:{rollback_exc}')
            report['rollback'] = 'RESTORED' if not report.get('rollbackErrors') else 'PARTIAL'
        raise
    finally:
        try:
            run(f'rm -rf -- {shlex.quote(stage)}')
        except Exception:
            pass
        sftp.close()
        client.close()
        (out / 'deployment.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
