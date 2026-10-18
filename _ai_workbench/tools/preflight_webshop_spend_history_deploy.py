#!/usr/bin/env python3
from __future__ import annotations

import getpass
import hashlib
import json
import paramiko


HOST = '103.116.105.154'
FILES = {
    '/linhhoasu/webgame/gm/index.php': '26ca51146301eacc5890dc4b4ef733d0727bc485fedcbc0be5593251ff47a0a5',
    '/linhhoasu/webgame/gm/api/user_api.php': '36e2b82f5610e91bd6355bbeed78af908120aeb0672f6907c1de1049cdb007bc',
    '/linhhoasu/webgame/gm/assets/js/index.js': 'adec68c63a1632c8b93a8ce62fb9681c2c982ece99aaee91137bfa6dd47ed181',
    '/linhhoasu/webgame/gm/assets/css/index.css': 'f7d40e27cb759a6cf521a8ed3ed3b98be1962a39b78cc1b31441096730f99ea0',
}

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    _, out, err = ssh.exec_command("pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\"].includes(p.name)){console.log(JSON.stringify({name:p.name,pid:p.pid,status:p.pm2_env&&p.pm2_env.status,restart:p.pm2_env&&p.pm2_env.restart_time}))}}})'")
    pm2_raw = out.read().decode('utf-8', 'replace')
    out.channel.recv_exit_status()
    rows = [json.loads(line) for line in pm2_raw.splitlines() if line.strip()]
    if any(row.get('status') != 'online' for row in rows):
        raise RuntimeError(f'process not online: {rows}')
    remote = {}
    for path, expected in FILES.items():
        _, out, err = ssh.exec_command(f"sha256sum '{path}' | awk '{{print $1}}'")
        actual = out.read().decode('utf-8', 'replace').strip()
        out.channel.recv_exit_status()
        remote[path] = actual
        if actual != expected:
            raise RuntimeError(f'changed remote file: {path} {actual}')
    _, out, err = ssh.exec_command("curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:81/ready")
    ready = out.read().decode('utf-8', 'replace').strip()
    out.channel.recv_exit_status()
    if ready != '200':
        raise RuntimeError(f'game ready={ready}')
    print(json.dumps({'result': 'PASS', 'pm2': rows, 'hashes': remote, 'game_ready': ready}, indent=2))
finally:
    ssh.close()
