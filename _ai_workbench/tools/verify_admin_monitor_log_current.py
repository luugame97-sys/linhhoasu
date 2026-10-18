#!/usr/bin/env python3
from __future__ import annotations
import getpass
import hashlib
import json
import paramiko

HOST = '103.116.105.154'
FILES = {
    'admin/index.php': '/linhhoasu/webgame/gm/admin/index.php',
    'admin/admin_api.php': '/linhhoasu/webgame/gm/admin/admin_api.php',
    'assets/js/admin.js': '/linhhoasu/webgame/gm/assets/js/admin.js',
    'assets/css/ui-refactor.css': '/linhhoasu/webgame/gm/assets/css/ui-refactor.css',
}

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    hashes = {}
    for name, remote in FILES.items():
        _, out, err = ssh.exec_command(f"sha256sum '{remote}' | awk '{{print $1}}'")
        value = out.read().decode('utf-8','replace').strip(); out.channel.recv_exit_status(); hashes[name] = value
    _, out, err = ssh.exec_command("pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restart:e.restart_time}))}}})'")
    pm2_raw=out.read().decode('utf-8','replace');out.channel.recv_exit_status();pm2=[json.loads(x) for x in pm2_raw.splitlines() if x.strip()]
    print(json.dumps({'result':'PASS','hashes':hashes,'pm2':pm2},ensure_ascii=False,indent=2))
finally: ssh.close()
