#!/usr/bin/env python3
from __future__ import annotations

import getpass
import hashlib
import json
import shlex
import time
from pathlib import Path

import paramiko

HOST = '103.116.105.154'
ROOT = Path(r'I:\Linhhoasu\server\server')
LOCAL_FILES = {
    'AccountService.js': ROOT / 'linhhoasu/lhs/newServer/src/services/AccountService.js',
    'serverList.js': ROOT / 'linhhoasu/lhs/newServer/src/handlers/serverList.js',
    'serverList1.js': ROOT / 'linhhoasu/lhs/newServer/src/handlers/serverList1.js',
    'HTTPServer.js': ROOT / 'linhhoasu/lhs/newServer/src/net/HTTPServer.js',
    'HTTPServer1.js': ROOT / 'linhhoasu/lhs/newServer/src/net/HTTPServer1.js',
}
REMOTE_FILES = {
    'AccountService.js': '/linhhoasu/lhs/newServer/src/services/AccountService.js',
    'serverList.js': '/linhhoasu/lhs/newServer/src/handlers/serverList.js',
    'serverList1.js': '/linhhoasu/lhs/newServer/src/handlers/serverList1.js',
    'HTTPServer.js': '/linhhoasu/lhs/newServer/src/net/HTTPServer.js',
    'HTTPServer1.js': '/linhhoasu/lhs/newServer/src/net/HTTPServer1.js',
}
BASELINE_DIR = ROOT / '_ai_workbench/temp/role_flow_remote_stable_20260902/src'
E2E_LOCAL = ROOT / '_ai_workbench/tools/e2e_role_flow_stage_20260902.js'
E2E_REMOTE = '/linhhoasu/_ai_workbench/temp/e2e_role_flow_live_20260902.js'


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 180) -> tuple[int, str, str]:
    _, out, err = ssh.exec_command(command, timeout=timeout)
    text = out.read().decode('utf-8', 'replace')
    error = err.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    return code, text, error


def main() -> None:
    password = getpass.getpass('VPS password (not logged): ')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=20)
    backup = ''
    deployed = False
    result: dict[str, object] = {'host': HOST, 'files': list(REMOTE_FILES)}
    try:
        code, stamp, error = run(ssh, 'date +%Y%m%d_%H%M%S')
        if code:
            raise RuntimeError(error or stamp)
        stamp = stamp.strip()
        backup = f'/linhhoasu/_ai_workbench/backups/role_flow_correct_pre_{stamp}'
        temp_files = {name: f'{remote}.deploy-{stamp}.js' for name, remote in REMOTE_FILES.items()}

        # Fail closed if another change landed after the baseline was captured.
        # Build baseline paths explicitly because handlers/net live in subfolders.
        baseline_paths = {
            'AccountService.js': BASELINE_DIR / 'services/AccountService.js',
            'serverList.js': BASELINE_DIR / 'handlers/serverList.js',
            'serverList1.js': BASELINE_DIR / 'handlers/serverList1.js',
            'HTTPServer.js': BASELINE_DIR / 'net/HTTPServer.js',
            'HTTPServer1.js': BASELINE_DIR / 'net/HTTPServer1.js',
        }
        expected_live = {name: sha256(path) for name, path in baseline_paths.items()}
        code, live_hash_text, error = run(ssh, 'sha256sum ' + ' '.join(shlex.quote(path) for path in REMOTE_FILES.values()))
        if code:
            raise RuntimeError(error or live_hash_text)
        actual_live = {}
        for line in live_hash_text.splitlines():
            parts = line.split()
            if len(parts) >= 2:
                actual_live[Path(parts[-1]).name] = parts[0]
        result['baselineGuard'] = {'expected': expected_live, 'actual': actual_live}
        if any(actual_live.get(name) != expected_live[name] for name in REMOTE_FILES):
            raise RuntimeError('remote_source_changed_since_baseline')

        code, out, error = run(ssh, f"set -eu; mkdir -p {shlex.quote(backup)}; " + '; '.join(
            f"cp -a {shlex.quote(remote)} {shlex.quote(backup + '/' + name)}"
            for name, remote in REMOTE_FILES.items()
        ))
        if code:
            raise RuntimeError(error or out)
        result['backup'] = backup

        sftp = ssh.open_sftp()
        try:
            for name, local in LOCAL_FILES.items():
                sftp.put(str(local), temp_files[name])
        finally:
            sftp.close()

        code, out, error = run(ssh, 'set -eu; ' + '; '.join(
            f"node --check {shlex.quote(path)}" for path in temp_files.values()
        ) + '; echo SYNTAX_PASS', timeout=60)
        if code:
            raise RuntimeError(error or out)

        code, out, error = run(ssh, 'set -eu; ' + '; '.join(
            f"mv -f {shlex.quote(temp_files[name])} {shlex.quote(remote)}"
            for name, remote in REMOTE_FILES.items()
        ))
        if code:
            raise RuntimeError(error or out)
        deployed = True

        code, deployed_hashes, error = run(ssh, 'sha256sum ' + ' '.join(shlex.quote(path) for path in REMOTE_FILES.values()))
        if code:
            raise RuntimeError(error or deployed_hashes)
        result['deployedHashes'] = deployed_hashes

        code, before, error = run(ssh, "pm2 list | grep -E 'lhs-s1001|lhs-dist|lhs-admin|lhs-real-bots' || true")
        result['pm2Before'] = before
        code, restart_out, error = run(ssh, 'pm2 restart lhs-s1001 --update-env', timeout=60)
        if code:
            raise RuntimeError(error or restart_out)
        result['restart'] = restart_out[-3000:]

        ready_code = '000'
        ready_body = ''
        for _ in range(45):
            code, out, error = run(ssh, "curl -sS -o /tmp/role_flow_live_ready.json -w '%{http_code}' --max-time 3 http://127.0.0.1:8080/ready || true", timeout=10)
            ready_code = out.strip()[-3:] if out.strip() else '000'
            if ready_code == '200':
                _, ready_body, _ = run(ssh, 'cat /tmp/role_flow_live_ready.json', timeout=10)
                break
            time.sleep(1)
        result['ready'] = {'http': ready_code, 'body': ready_body.strip()}
        if ready_code != '200':
            raise RuntimeError('production_ready_failed')

        # Run the complete disposable E2E against the live process. The test
        # removes its own account/player/mail/token in a finally block.
        sftp = ssh.open_sftp()
        try:
            sftp.put(str(E2E_LOCAL), E2E_REMOTE)
        finally:
            sftp.close()
        live_env = """livepid=$(pm2 pid lhs-s1001|tail -1)
getenv(){ tr '\\0' '\\n' </proc/$livepid/environ | sed -n "s/^$1=//p"; }
export MONGO_URI=$(getenv MONGO_URI)
export REDIS_HOST=$(getenv REDIS_HOST)
export REDIS_PORT=$(getenv REDIS_PORT)
export REDIS_PASSWORD=$(getenv REDIS_PASSWORD)
export REDIS_PREFIX=$(getenv REDIS_PREFIX)
"""
        e2e_cmd = (
            'set -o pipefail; ' + live_env
            + f"ROLE_FLOW_STAGE_ROOT=/linhhoasu/lhs/newServer ROLE_FLOW_HTTP_BASE=http://127.0.0.1:8080 ROLE_FLOW_WS_URL=ws://127.0.0.1:9200 "
            + f"node {shlex.quote(E2E_REMOTE)}"
        )
        code, e2e_out, error = run(ssh, e2e_cmd, timeout=240)
        result['e2eExit'] = code
        result['e2eOutput'] = e2e_out[-12000:]
        if error.strip():
            result['e2eError'] = error[-5000:]
        if code:
            raise RuntimeError('production_role_flow_e2e_failed')

        code, after, error = run(ssh, "pm2 list | grep -E 'lhs-s1001|lhs-dist|lhs-admin|lhs-real-bots' || true")
        result['pm2After'] = after
        code, log_check, error = run(ssh, "tail -n 5000 /root/.pm2/logs/lhs-s1001-out.log /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null | grep -E 'AUTH_SESSION_REVOKED|AUTH_SESSION_MISMATCH|ROLE_NOT_FOUND|CREATE_ROLE_FAILED' | tail -n 80 || true")
        result['authErrorTail'] = log_check
        result['status'] = 'PASS'
    except Exception as exc:
        result['status'] = 'FAILED'
        result['error'] = str(exc)
        if deployed and backup:
            # Restore only the five files changed by this deployment, then
            # restart the designated process so the service remains usable.
            restore_cmd = 'set -eu; ' + '; '.join(
                f"cp -a {shlex.quote(backup + '/' + name)} {shlex.quote(remote)}"
                for name, remote in REMOTE_FILES.items()
            ) + '; node --check /linhhoasu/lhs/newServer/src/net/HTTPServer.js; pm2 restart lhs-s1001 --update-env'
            rcode, rout, rerr = run(ssh, restore_cmd, timeout=90)
            result['rollback'] = {'exit': rcode, 'output': rout[-3000:], 'error': rerr[-3000:]}
    finally:
        run(ssh, f"rm -f {shlex.quote(E2E_REMOTE)} 2>/dev/null || true", timeout=20)
        ssh.close()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result.get('status') != 'PASS':
        raise SystemExit(1)


if __name__ == '__main__':
    main()
