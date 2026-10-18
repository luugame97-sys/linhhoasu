#!/usr/bin/env python3
from __future__ import annotations

import getpass
import json
import shlex
import time
from pathlib import Path

import paramiko

HOST = '103.116.105.154'
ROOT = Path(r'I:\Linhhoasu\server\server')
SOURCE_FILES = {
    'src/services/AccountService.js': ROOT / 'linhhoasu/lhs/newServer/src/services/AccountService.js',
    'src/handlers/serverList.js': ROOT / 'linhhoasu/lhs/newServer/src/handlers/serverList.js',
    'src/handlers/serverList1.js': ROOT / 'linhhoasu/lhs/newServer/src/handlers/serverList1.js',
    'src/net/HTTPServer.js': ROOT / 'linhhoasu/lhs/newServer/src/net/HTTPServer.js',
    'src/net/HTTPServer1.js': ROOT / 'linhhoasu/lhs/newServer/src/net/HTTPServer1.js',
}
E2E_LOCAL = ROOT / '_ai_workbench/tools/e2e_role_flow_stage_20260902.js'


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 180) -> tuple[int, str, str]:
    _, out, err = ssh.exec_command(command, timeout=timeout)
    text = out.read().decode('utf-8', 'replace')
    error = err.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    return code, text, error


def env_value(values: dict[str, str], key: str, fallback: str = '') -> str:
    value = str(values.get(key, '') or '').strip()
    return value if value else fallback


def make_env(values: dict[str, str], stage: str, prefix: str, http_port: int, ws_port: int) -> str:
    entries = {
        'NODE_ENV': 'development',
        'HTTP_PORT': str(http_port),
        'AGENT_HTTP_PORT': '0',
        'WS_PORT': str(ws_port),
        'WS_HOST': '127.0.0.1',
        'WS_BEHIND_PROXY': '1',
        'WS_PUBLIC_PORT': str(ws_port),
        'SERVER_ID': '1001',
        'SERVER_NAME': 'QA_ROLE_FLOW',
        'SERVER_PUBLIC_HOST': '127.0.0.1',
        'CLIENT_DIR': '/linhhoasu/webgame/game',
        'REQUIRE_INVITE_REGISTER': '0',
        'ALLOW_AUTO_REGISTER': '0',
        'SDK_AUTH_PASSWORD_STRICT': '1',
        'REDIS_PREFIX': prefix,
        'MONGO_URI': env_value(values, 'MONGO_URI', 'mongodb://localhost:27017/lhs_s1001'),
        'REDIS_HOST': env_value(values, 'REDIS_HOST', '127.0.0.1'),
        'REDIS_PORT': env_value(values, 'REDIS_PORT', '6379'),
        'REDIS_PASSWORD': env_value(values, 'REDIS_PASSWORD', ''),
        'API_KEY': env_value(values, 'API_KEY', 'qa-api-key'),
        'DIST_API_KEY': env_value(values, 'DIST_API_KEY', 'qa-dist-key'),
        'ADMIN_USERNAME': env_value(values, 'ADMIN_USERNAME', 'qa-admin'),
        'ADMIN_PASSWORD': env_value(values, 'ADMIN_PASSWORD', 'qa-admin-password'),
        'CORS_ALLOWED_ORIGINS': env_value(values, 'CORS_ALLOWED_ORIGINS', '*'),
    }
    return ' '.join(f'{key}={shlex.quote(value)}' for key, value in entries.items())


def main() -> None:
    password = getpass.getpass('VPS password (not logged): ')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=20)
    stage = ''
    pid = ''
    result: dict[str, object] = {'host': HOST, 'productionUntouchedDuringStage': True}
    try:
        code, stamp, error = run(ssh, 'date +%Y%m%d_%H%M%S')
        if code:
            raise RuntimeError(error or stamp)
        stamp = stamp.strip()
        stage = f'/linhhoasu/_ai_workbench/temp/role_flow_stage_{stamp}'
        prefix = f'qa_role_flow_{stamp}:'
        http_port = 18082
        ws_port = 19200
        result.update({'stage': stage, 'redisPrefix': prefix})

        code, out, error = run(ssh, f"set -eu; cp -a /linhhoasu/lhs/newServer {shlex.quote(stage)}")
        if code:
            raise RuntimeError(error or out)

        # Capture only environment values needed by the isolated process. They
        # stay in memory and are never printed.
        code, env_raw, error = run(
            ssh,
            "pid=$(pm2 pid lhs-s1001|tail -1); tr '\\0' '\\n' </proc/$pid/environ",
            timeout=30,
        )
        if code:
            raise RuntimeError(error or env_raw)
        live_env: dict[str, str] = {}
        wanted = {'MONGO_URI', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD', 'API_KEY', 'DIST_API_KEY', 'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'CORS_ALLOWED_ORIGINS'}
        for line in env_raw.splitlines():
            if '=' not in line:
                continue
            key, value = line.split('=', 1)
            if key in wanted:
                live_env[key] = value

        sftp = ssh.open_sftp()
        try:
            for rel, local in SOURCE_FILES.items():
                sftp.put(str(local), f'{stage}/{rel}')
            sftp.put(str(E2E_LOCAL), f'{stage}/qa_role_flow_e2e.js')
        finally:
            sftp.close()

        staged_files = ' '.join(shlex.quote(f'{stage}/{rel}') for rel in SOURCE_FILES)
        syntax_cmd = f"set -eu; for f in {staged_files}; do node --check \"$f\"; done; node --check {shlex.quote(stage + '/qa_role_flow_e2e.js')}; echo SYNTAX_PASS"
        code, out, error = run(ssh, syntax_cmd, timeout=60)
        if code:
            raise RuntimeError(error or out)
        result['syntax'] = 'PASS'

        env_cmd = make_env(live_env, stage, prefix, http_port, ws_port)
        start_cmd = f"set -eu; nohup env {env_cmd} node {shlex.quote(stage + '/src/app.js')} > {shlex.quote(stage + '/qa.log')} 2>&1 < /dev/null & echo $!"
        code, out, error = run(ssh, start_cmd, timeout=30)
        if code:
            raise RuntimeError(error or out)
        pid = out.strip().splitlines()[-1].strip()
        if not pid.isdigit():
            raise RuntimeError(f'Invalid staging PID: {out[-1000:]}')
        result['stagingPid'] = int(pid)

        ready_code = '000'
        ready_body = ''
        for _ in range(45):
            code, out, error = run(ssh, "curl -sS -o /tmp/role_flow_stage_ready.json -w '%{http_code}' --max-time 3 http://127.0.0.1:18082/ready || true", timeout=10)
            ready_code = out.strip()[-3:] if out.strip() else '000'
            if ready_code == '200':
                _, ready_body, _ = run(ssh, 'cat /tmp/role_flow_stage_ready.json', timeout=10)
                break
            time.sleep(1)
        result.update({'stagingReadyHttp': ready_code, 'stagingReadyBody': ready_body.strip()})
        if ready_code != '200':
            _, log_tail, _ = run(ssh, f'tail -n 160 {shlex.quote(stage + "/qa.log")} 2>/dev/null || true', timeout=20)
            result['stagingLogTail'] = log_tail[-8000:]
            raise RuntimeError('staging_ready_failed')

        e2e_env = make_env(live_env, stage, prefix, http_port, ws_port)
        e2e_cmd = (
            f"set -o pipefail; env {e2e_env} ROLE_FLOW_STAGE_ROOT={shlex.quote(stage)} "
            f"ROLE_FLOW_HTTP_BASE=http://127.0.0.1:{http_port} "
            f"ROLE_FLOW_WS_URL=ws://127.0.0.1:{ws_port} "
            f"node {shlex.quote(stage + '/qa_role_flow_e2e.js')}"
        )
        code, out, error = run(ssh, e2e_cmd, timeout=240)
        result['e2eExit'] = code
        result['e2eOutput'] = out[-12000:]
        if error.strip():
            result['e2eError'] = error[-5000:]
        if code:
            raise RuntimeError('role_flow_e2e_failed')
    finally:
        if pid.isdigit():
            run(ssh, f"kill {shlex.quote(pid)} 2>/dev/null || true; for i in $(seq 1 15); do kill -0 {shlex.quote(pid)} 2>/dev/null || exit 0; sleep 1; done; kill -9 {shlex.quote(pid)} 2>/dev/null || true", timeout=30)
        if stage:
            # Exact generated path under the workbench temp directory only.
            run(ssh, f"case {shlex.quote(stage)} in /linhhoasu/_ai_workbench/temp/role_flow_stage_*) rm -rf -- {shlex.quote(stage)};; esac", timeout=60)
        ssh.close()
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
