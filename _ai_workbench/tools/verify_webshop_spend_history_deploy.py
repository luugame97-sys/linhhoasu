#!/usr/bin/env python3
from __future__ import annotations

import getpass
import json
import paramiko


HOST = '103.116.105.154'
FILES = {
    'index.php': '/linhhoasu/webgame/gm/index.php',
    'api/user_api.php': '/linhhoasu/webgame/gm/api/user_api.php',
    'assets/js/index.js': '/linhhoasu/webgame/gm/assets/js/index.js',
    'assets/css/index.css': '/linhhoasu/webgame/gm/assets/css/index.css',
}
EXPECTED = {
    'index.php': 'd9ba157a77523497d8fbc98c024d63e6cc06b51a05b7147bee37c90f3c0d0e7d',
    'api/user_api.php': 'a556c614f4108320addb2569c824ee2807770a1361cfe7e9785ae2d20e20c882',
    'assets/js/index.js': 'a124f96d44a277ff5ddd8466b427a1004e73241e5bba52cb88ea13d1644fc04d',
    'assets/css/index.css': '5553dfda8f06ab45ebf532cea794f87c00dd16a48a79fe4155f4de1927bb56fb',
}


ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    hashes = {}
    for name, path in FILES.items():
        _, out, err = ssh.exec_command(f"sha256sum '{path}' | awk '{{print $1}}'")
        value = out.read().decode('utf-8', 'replace').strip()
        out.channel.recv_exit_status()
        hashes[name] = value
        if value != EXPECTED[name]: raise RuntimeError(f'hash mismatch {name}: {value}')
    for path in (FILES['index.php'], FILES['api/user_api.php']):
        _, out, err = ssh.exec_command(f'php -l {path}')
        output = out.read().decode('utf-8', 'replace')
        code = out.channel.recv_exit_status()
        if code: raise RuntimeError(output + err.read().decode('utf-8', 'replace'))
    _, out, err = ssh.exec_command(f"node --check {FILES['assets/js/index.js']}")
    code = out.channel.recv_exit_status()
    if code: raise RuntimeError(err.read().decode('utf-8', 'replace'))
    _, out, err = ssh.exec_command("curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:81/ready")
    ready = out.read().decode('utf-8', 'replace').strip()
    out.channel.recv_exit_status()
    if ready != '200': raise RuntimeError(f'game ready={ready}')
    print(json.dumps({'result': 'PASS', 'hashes': hashes, 'php_lint': 'PASS', 'node_check': 'PASS', 'game_ready': ready}, indent=2))
finally:
    ssh.close()
