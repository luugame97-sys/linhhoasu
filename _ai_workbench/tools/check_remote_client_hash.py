import getpass
import hashlib

import paramiko

paths = [
    '/linhhoasu/webgame/game/js/main.min_a6195824.js',
    '/linhhoasu/webgame/game/index.html',
]
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.105.154', username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    sftp = ssh.open_sftp()
    try:
        for path in paths:
            with sftp.open(path, 'rb') as stream:
                data = stream.read()
            print(path, len(data), hashlib.sha256(data).hexdigest())
    finally:
        sftp.close()
finally:
    ssh.close()
