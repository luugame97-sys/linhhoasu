import paramiko
import sys

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.105.154', username='root', password='anhduc11', timeout=15, allow_agent=False, look_for_keys=False)
sftp = client.open_sftp()
sftp.put(r'F:\WebSite\gm\Linhhoasu\_ai_workbench\tools\get_recharge_feature.php', '/linhhoasu/_ai_workbench/tools/get_recharge_feature.php')
sftp.close()
commands = [
    "su -s /bin/bash www -c 'php /linhhoasu/_ai_workbench/tools/verify_recharge_live.php'",
    "su -s /bin/bash www -c 'php /linhhoasu/_ai_workbench/tools/render_recharge_live.php'",
    "su -s /bin/bash www -c 'php /linhhoasu/_ai_workbench/tools/get_recharge_feature.php'",
    "curl -sS --max-time 5 http://127.0.0.1:8080/ready",
    "grep -n 'eventKey = normalizeText' /linhhoasu/lhs/newServer/src/net/HTTPServer.js; grep -n 'uniq_mail_user_event_key' /linhhoasu/lhs/newServer/src/db/models/Mail.js",
    "mongosh --quiet --host 127.0.0.1 --port 27017 lhs_s1001 --eval 'db.mails.countDocuments({eventKey:/^webgm_probe_/})'",
    "ls -l /linhhoasu/_ai_workbench/backups/donate50_prod_20260830_0930/server /linhhoasu/_ai_workbench/backups/donate50_prod_20260830_0930/web /linhhoasu/_ai_workbench/backups/account_linhhoasu_before_recharge_20260830_0930/recharge_tables_before.json",
    "tail -n 35 /root/.pm2/logs/lhs-s1001-out.log",
    "stat -c '%y %s' /root/.pm2/logs/lhs-s1001-error.log",
    "grep -n 'mail idempotent replay' /root/.pm2/logs/lhs-s1001-out.log | tail -n 5",
    "grep -n 'Internal] mail sent batch' /root/.pm2/logs/lhs-s1001-out.log | tail -n 5",
    "sha256sum /linhhoasu/webgame/gm/account_Linhhoasu.sql /linhhoasu/webgame/gm/config.php /linhhoasu/webgame/gm/api/user_api.php",
]
for command in commands:
    stdin, stdout, stderr = client.exec_command(command)
    sys.stdout.buffer.write((f"$ {command}\n").encode())
    sys.stdout.buffer.write(stdout.read())
    sys.stderr.buffer.write(stderr.read())
    if stdout.channel.recv_exit_status() != 0:
        raise SystemExit(1)
client.close()
