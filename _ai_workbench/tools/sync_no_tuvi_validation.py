from pathlib import Path
import getpass
import paramiko
import sys

root = Path(r"F:\WebSite\gm\Linhhoasu")
backup = "/linhhoasu/_ai_workbench/backups/no_tuvi_validation_20260830_1200"
password = getpass.getpass("VPS password: ")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.105.154', username='root', password=password, timeout=15, allow_agent=False, look_for_keys=False)
sftp = client.open_sftp()
stdin, stdout, stderr = client.exec_command(f"mkdir -p {backup}; cp -a /linhhoasu/webgame/gm/config.php {backup}/config.php; cp -a /linhhoasu/webgame/gm/admin/admin_api.php {backup}/admin_api.php")
if stdout.channel.recv_exit_status() != 0:
    raise RuntimeError('backup failed')
sftp.put(str(root / 'config.php'), '/linhhoasu/webgame/gm/config.php')
sftp.put(str(root / 'admin' / 'admin_api.php'), '/linhhoasu/webgame/gm/admin/admin_api.php')
sftp.close()
for command in (
    "php -l /linhhoasu/webgame/gm/config.php",
    "php -l /linhhoasu/webgame/gm/admin/admin_api.php",
    "su -s /bin/bash www -c 'php /linhhoasu/_ai_workbench/tools/verify_no_tuvi_live.php'",
):
    stdin, stdout, stderr = client.exec_command(command)
    sys.stdout.buffer.write((f"$ {command}\n").encode())
    sys.stdout.buffer.write(stdout.read())
    sys.stderr.buffer.write(stderr.read())
    if stdout.channel.recv_exit_status() != 0:
        raise RuntimeError(f'check failed: {command}')
client.close()
print('BACKUP=' + backup)
