from pathlib import Path
import paramiko
import sys

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.105.154', username='root', password='anhduc11', timeout=15, allow_agent=False, look_for_keys=False)
sftp = client.open_sftp()
sftp.put(r'F:\WebSite\gm\Linhhoasu\_ai_workbench\tools\verify_recharge_live.php', '/linhhoasu/_ai_workbench/tools/verify_recharge_live.php')
sftp.put(r'F:\WebSite\gm\Linhhoasu\_ai_workbench\tools\seed_recharge_presets.sql', '/linhhoasu/_ai_workbench/tools/seed_recharge_presets.sql')
sftp.put(r'F:\WebSite\gm\Linhhoasu\_ai_workbench\tools\render_recharge_live.php', '/linhhoasu/_ai_workbench/tools/render_recharge_live.php')
sftp.close()
commands = [
    "php /linhhoasu/_ai_workbench/tools/apply_recharge_presets_live.php",
    "su -s /bin/bash www -c 'php /linhhoasu/_ai_workbench/tools/verify_recharge_live.php'",
    "su -s /bin/bash www -c 'php /linhhoasu/_ai_workbench/tools/render_recharge_live.php'",
    "ls -l /linhhoasu/_ai_workbench/backups/account_linhhoasu_before_recharge_20260829_1900/recharge_tables_before.json 2>&1",
    "php -l /linhhoasu/webgame/gm/config.php",
    "curl -sS -o /dev/null -w 'WEB=%{http_code}\\n' http://127.0.0.1:88/index.php",
]
for command in commands:
    stdin, stdout, stderr = client.exec_command(command)
    sys.stdout.buffer.write(stdout.read())
    sys.stderr.buffer.write(stderr.read())
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise SystemExit(code)
client.close()
