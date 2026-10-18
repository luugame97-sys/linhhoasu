#!/usr/bin/env python3
from __future__ import annotations
import getpass, hashlib, json, posixpath, shlex
from pathlib import Path
import paramiko

HOST = '103.116.105.154'
ROOT = Path(r'I:\Linhhoasu\server\server')
FILES = [
    ('linhhoasu/lhs/newServer/src/net/HTTPServer.js', '/linhhoasu/lhs/newServer/src/net/HTTPServer.js'),
    ('linhhoasu/lhs/newServer/src/net/HTTPServer1.js', '/linhhoasu/lhs/newServer/src/net/HTTPServer1.js'),
    ('linhhoasu/lhs/newServer/src/handlers/serverList.js', '/linhhoasu/lhs/newServer/src/handlers/serverList.js'),
    ('linhhoasu/lhs/newServer/src/handlers/serverList1.js', '/linhhoasu/lhs/newServer/src/handlers/serverList1.js'),
]
STAMP = 'role_creation_flow_pre_20260902_'

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)
try:
    def run(cmd: str) -> str:
        _, out, err = ssh.exec_command(cmd)
        text = out.read().decode('utf-8', 'replace')
        code = out.channel.recv_exit_status()
        if code:
            raise RuntimeError((err.read().decode('utf-8', 'replace') or text)[-4000:])
        return text

    run('mkdir -p /linhhoasu/_ai_workbench/backups')
    stamp = run("date +%Y%m%d_%H%M%S").strip()
    backup = f'/linhhoasu/_ai_workbench/backups/{STAMP}{stamp}'
    run('mkdir -p ' + shlex.quote(backup))
    sftp = ssh.open_sftp()
    try:
        result = {'backup': backup, 'files': []}
        for rel, remote in FILES:
            local = ROOT / rel
            remote_backup = posixpath.join(backup, posixpath.basename(remote))
            run('cp -a ' + shlex.quote(remote) + ' ' + shlex.quote(remote_backup))
            sftp.put(str(local), remote)
            result['files'].append({'remote': remote, 'localSha256': sha256(local)})
    finally:
        sftp.close()
    remote_hashes = run("sha256sum " + ' '.join(shlex.quote(r) for _, r in FILES))
    result['remoteHashes'] = remote_hashes
    print(json.dumps(result, ensure_ascii=False, indent=2))
finally:
    ssh.close()
