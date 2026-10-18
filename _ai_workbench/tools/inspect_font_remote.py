#!/usr/bin/env python3
import getpass
import json
import paramiko

HOST = '103.116.105.154'
REMOTE_ROOT = '/linhhoasu/webgame/game'

def run(ssh, command):
    stdin, stdout, stderr = ssh.exec_command(command)
    out = stdout.read().decode('utf-8', 'replace')
    err = stderr.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    return code, out, err

password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)
try:
    cmd = (
        f"set -eu; printf 'ROOT='; readlink -f {REMOTE_ROOT}; "
        f"for f in {REMOTE_ROOT}/utm.ttf {REMOTE_ROOT}/gothich.ttf {REMOTE_ROOT}/index.html; do "
        "if test -f \"$f\"; then sha256sum \"$f\"; file \"$f\"; else echo MISSING:$f; fi; done; "
        "curl -sS -I http://127.0.0.1:81/utm.ttf | sed -n '1,12p'; "
        "printf 'INDEX_REFS\\n'; grep -nE \"@font-face|gothich|utm\\.ttf|preload\" " + f"{REMOTE_ROOT}/index.html"
    )
    code, out, err = run(ssh, cmd)
    print(out)
    if err:
        print(err)
    raise SystemExit(code)
finally:
    ssh.close()
