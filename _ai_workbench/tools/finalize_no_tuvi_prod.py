from pathlib import Path
import getpass
import json
import paramiko
import sys

WEB = Path(r"F:\WebSite\gm\Linhhoasu")
TOOLS = "/linhhoasu/_ai_workbench/tools"

password = getpass.getpass("VPS password: ")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.105.154', username='root', password=password, timeout=20, allow_agent=False, look_for_keys=False)
sftp = client.open_sftp()
sftp.put(str(WEB / "_ai_workbench" / "tools" / "render_recharge_live.php"), f"{TOOLS}/render_recharge_live.php")
sftp.close()

def run(command):
    stdin, stdout, stderr = client.exec_command(command)
    out = stdout.read(); err = stderr.read(); code = stdout.channel.recv_exit_status()
    sys.stdout.buffer.write((f"$ {command}\n").encode()); sys.stdout.buffer.write(out); sys.stderr.buffer.write(err)
    if code != 0: raise RuntimeError(command)
    return out.decode('utf-8', 'replace').strip()

flag = run(f"su -s /bin/bash www -c 'php {TOOLS}/get_recharge_feature.php'")
if flag.splitlines()[-1] != '1': raise RuntimeError('feature is not active')
no_tuvi = json.loads(run(f"su -s /bin/bash www -c 'php {TOOLS}/verify_no_tuvi_live.php'").splitlines()[-1])
render = json.loads(run(f"su -s /bin/bash www -c 'php {TOOLS}/render_recharge_live.php'").splitlines()[-1])
if no_tuvi.get('id3_rows') != 0 or no_tuvi.get('counts') != {'day':10,'week':20,'month':20}: raise RuntimeError(no_tuvi)
if not all((render.get('has_day_tab'),render.get('has_week_tab'),render.get('has_month_tab'),render.get('has_day_preset'),render.get('has_month_preset'),render.get('has_no_tuvi'))) or render.get('shows_empty'): raise RuntimeError(render)
run("curl -sS --max-time 5 http://127.0.0.1:8080/ready")
run("pm2 status")
run("grep -n 'RoleKungFuLvConfig' /linhhoasu/lhs/newServer/src/handlers/upgrade.js; grep -n 'MAIL_CLAIM_LEDGER_LIMIT' /linhhoasu/lhs/newServer/src/handlers/mail.js")
run("tail -n 20 /root/.pm2/logs/lhs-s1001-out.log; stat -c '%y %s' /root/.pm2/logs/lhs-s1001-error.log")
run("sha256sum /linhhoasu/webgame/gm/config.php /linhhoasu/webgame/gm/index.php /linhhoasu/webgame/gm/api/user_api.php /linhhoasu/webgame/gm/admin/admin_api.php /linhhoasu/webgame/gm/account_Linhhoasu.sql")
client.close()
print(json.dumps({'feature':flag.splitlines()[-1],'no_tuvi':no_tuvi,'render':render},ensure_ascii=False))
