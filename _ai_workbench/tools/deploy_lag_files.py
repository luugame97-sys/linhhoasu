#!/usr/bin/env python3
import getpass, hashlib, os, paramiko, shutil, tempfile
from datetime import datetime, timezone

HOST='103.116.105.154'; ROOT='/linhhoasu/lhs/newServer'
FILES=['src/net/WSServer.js','src/services/PlayerService.js','src/handlers/compat.js']
LOCAL_ROOT=r'I:\Linhhoasu\server\server\linhhoasu\lhs\newServer'

def run(ssh, cmd, check=True):
    _,out,err=ssh.exec_command(cmd); data=out.read().decode('utf-8','replace'); error=err.read().decode('utf-8','replace'); code=out.channel.recv_exit_status()
    if check and code: raise RuntimeError(f'{cmd}: {error[-1000:]}')
    return data

password=getpass.getpass('VPS password (not logged): ')
ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy()); ssh.connect(HOST,username='root',password=password,look_for_keys=False,allow_agent=False,timeout=15)
try:
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S'); backup=f'/linhhoasu/_ai_workbench/backups/lag_fix_files_{stamp}'
    run(ssh,f'set -eu; mkdir -p {backup}')
    for rel in FILES:
        run(ssh,f'cp -p {ROOT}/{rel} {backup}/{os.path.basename(rel)}.before')
    for rel in FILES:
        local=os.path.join(LOCAL_ROOT,*rel.split('/')); remote=ROOT+'/'+rel; temp=remote+'.deploy-'+stamp+'.js'
        sftp=ssh.open_sftp()
        try: sftp.put(local,temp)
        finally: sftp.close()
        run(ssh,f'set -eu; node --check {temp}; mv {temp} {remote}; chmod 644 {remote}')
    run(ssh,'pm2 restart lhs-s1001 --update-env')
    run(ssh,'pm2 save')
    ready=run(ssh,"for i in $(seq 1 20); do code=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); [ \"$code\" = 200 ] && echo 200 && exit 0; sleep 1; done; echo unavailable; exit 1").strip()
    listeners=run(ssh,"ss -ltn | grep -E ':(8080|9200)\\b' || true").strip().replace('\n',' | ')
    print('BACKUP='+backup); print('READY_HTTP='+ready); print('LISTENERS='+listeners)
    for rel in FILES: print(os.path.basename(rel)+'_HASH='+run(ssh,f"sha256sum {ROOT}/{rel} | cut -d' ' -f1").strip())
finally: ssh.close()
