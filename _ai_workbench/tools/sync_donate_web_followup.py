from pathlib import Path
import paramiko
import sys

WEB = Path(r"F:\WebSite\gm\Linhhoasu")
BACKUP = "/linhhoasu/_ai_workbench/backups/donate50_web_followup_20260830_0945"
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.105.154', username='root', password='anhduc11', timeout=15, allow_agent=False, look_for_keys=False)
sftp = client.open_sftp()
stdin, stdout, stderr = client.exec_command(f"mkdir -p {BACKUP}/api {BACKUP}/admin; cp -a /linhhoasu/webgame/gm/config.php {BACKUP}/config.php; cp -a /linhhoasu/webgame/gm/index.php {BACKUP}/index.php; cp -a /linhhoasu/webgame/gm/api/user_api.php {BACKUP}/api/user_api.php; cp -a /linhhoasu/webgame/gm/admin/admin_api.php {BACKUP}/admin/admin_api.php; cp -a /linhhoasu/webgame/gm/account_Linhhoasu.sql {BACKUP}/account_Linhhoasu.sql")
if stdout.channel.recv_exit_status() != 0:
    raise SystemExit(1)
for rel in ("config.php", "index.php", "api/user_api.php", "admin/admin_api.php", "account_Linhhoasu.sql"):
    sftp.put(str(WEB / rel), "/linhhoasu/webgame/gm/" + rel)
for rel in ("render_recharge_live.php", "verify_recharge_live.php", "inspect_recharge_server_ids.php"):
    sftp.put(str(WEB / "_ai_workbench" / "tools" / rel), "/linhhoasu/_ai_workbench/tools/" + rel)
sftp.close()
commands = [
    "php -l /linhhoasu/webgame/gm/config.php && php -l /linhhoasu/webgame/gm/index.php && php -l /linhhoasu/webgame/gm/api/user_api.php && php -l /linhhoasu/webgame/gm/admin/admin_api.php",
    "su -s /bin/bash www -c 'php /linhhoasu/_ai_workbench/tools/inspect_recharge_server_ids.php'",
    "su -s /bin/bash www -c 'php /linhhoasu/_ai_workbench/tools/render_recharge_live.php'",
    "su -s /bin/bash www -c 'php /linhhoasu/_ai_workbench/tools/verify_recharge_live.php'",
    "curl -sS --max-time 5 http://127.0.0.1:8080/ready",
    "sha256sum /linhhoasu/webgame/gm/config.php /linhhoasu/webgame/gm/index.php /linhhoasu/webgame/gm/api/user_api.php /linhhoasu/webgame/gm/account_Linhhoasu.sql",
]
for command in commands:
    stdin, stdout, stderr = client.exec_command(command)
    sys.stdout.buffer.write((f"$ {command}\n").encode())
    sys.stdout.buffer.write(stdout.read())
    sys.stderr.buffer.write(stderr.read())
    if stdout.channel.recv_exit_status() != 0:
        raise SystemExit(1)
client.close()
print("BACKUP=" + BACKUP)
