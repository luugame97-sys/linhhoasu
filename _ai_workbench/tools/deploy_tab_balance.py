import paramiko
import os
import sys
import time

host = "103.116.104.165"
user = "root"
password = "anhduc11"

files_to_sync = [
    (r"linhhoasu\webgame\gm\index.php", "/linhhoasu/webgame/gm/index.php"),
    (r"linhhoasu\webgame\gm\assets\js\index.js", "/linhhoasu/webgame/gm/assets/js/index.js"),
    (r"linhhoasu\webgame\gm\assets\css\ui-refactor.css", "/linhhoasu/webgame/gm/assets/css/ui-refactor.css"),
    (r"linhhoasu\webgame\gm\assets\css\index.css", "/linhhoasu/webgame/gm/assets/css/index.css"),
    (r"linhhoasu\webgame\gm\assets\css\lucky-wheel.css", "/linhhoasu/webgame/gm/assets/css/lucky-wheel.css"),
]

timestamp = time.strftime("%Y%m%d_%H%M%S")
backup_dir = f"/linhhoasu/_ai_workbench/backups/webgm_tab_balance_{timestamp}"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

print(f"1. Creating remote backup dir: {backup_dir}")
ssh.exec_command(f"mkdir -p {backup_dir}")

for local_path, remote_path in files_to_sync:
    fname = os.path.basename(remote_path)
    cmd = f"cp {remote_path} {backup_dir}/{fname}"
    stdin, stdout, stderr = ssh.exec_command(cmd)
    stdout.channel.recv_exit_status()
    print(f"   Backed up {remote_path} -> {backup_dir}/{fname}")

print("2. Uploading updated files...")
sftp = ssh.open_sftp()
for local_path, remote_path in files_to_sync:
    print(f"   Uploading {local_path} -> {remote_path}...")
    sftp.put(local_path, remote_path)
sftp.close()

print("3. Setting permissions and validating syntax...")
commands = [
    "chown -R www:www /linhhoasu/webgame/gm/",
    "chmod 644 /linhhoasu/webgame/gm/assets/css/*.css",
    "chmod 644 /linhhoasu/webgame/gm/assets/js/*.js",
    "php -l /linhhoasu/webgame/gm/index.php",
    "node -c /linhhoasu/webgame/gm/assets/js/index.js",
]

for cmd in commands:
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    print(f"   [{cmd}] exit={exit_status}")
    if out: print(f"      OUT: {out}")
    if err: print(f"      ERR: {err}")

ssh.close()
print("Deployment completed successfully!")
