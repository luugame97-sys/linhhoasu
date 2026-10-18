from pathlib import Path
import paramiko

ROOT = Path(__file__).resolve().parents[1]
lines = (ROOT / 'VPS103.116.105.154.txt').read_text(encoding='utf-8').splitlines()
host, user, password = lines[0].strip(), lines[1].strip(), lines[2].strip()
out = ROOT / 'temp' / 'box_runtime_sources_20260912'
out.mkdir(parents=True, exist_ok=True)
ssh = paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password, look_for_keys=False, allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
try:
    sftp = ssh.open_sftp()
    try:
        for name in ['src/handlers/compat.js', 'src/handlers/account.js', 'src/handlers/box.js', 'src/router.js']:
            target = out / name.replace('/', '__')
            sftp.get('/linhhoasu/lhs/newServer/' + name, str(target))
            print(target.name, target.stat().st_size)
    finally: sftp.close()
finally: ssh.close()
