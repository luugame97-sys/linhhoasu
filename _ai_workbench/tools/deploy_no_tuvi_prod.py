from pathlib import Path
import getpass
import json
import paramiko
import sys
import time

ROOT = Path(r"I:\Linhhoasu\server\server")
WEB = Path(r"F:\WebSite\gm\Linhhoasu")
REMOTE_TOOLS = "/linhhoasu/_ai_workbench/tools"
BACKUP = "/linhhoasu/_ai_workbench/backups/donate_no_tuvi_20260830_1130"

password = getpass.getpass("VPS password: ")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.105.154', username='root', password=password, timeout=20, banner_timeout=20, auth_timeout=20, allow_agent=False, look_for_keys=False)

def run(command, check=True):
    stdin, stdout, stderr = client.exec_command(command)
    out = stdout.read()
    err = stderr.read()
    code = stdout.channel.recv_exit_status()
    sys.stdout.buffer.write((f"$ {command}\n").encode())
    sys.stdout.buffer.write(out)
    sys.stderr.buffer.write(err)
    sys.stdout.flush(); sys.stderr.flush()
    if check and code != 0:
        raise RuntimeError(f"command failed ({code}): {command}")
    return out.decode('utf-8', 'replace').strip()

sftp = client.open_sftp()
feature_disabled = False
try:
    run(f"test ! -e {BACKUP}; mkdir -p {BACKUP}/server {BACKUP}/web/api {BACKUP}/web/admin {REMOTE_TOOLS}")
    run(f"cp -a /linhhoasu/lhs/newServer/src/handlers/upgrade.js {BACKUP}/server/upgrade.js; "
        f"cp -a /linhhoasu/lhs/newServer/src/handlers/mail.js {BACKUP}/server/mail.js; "
        f"cp -a /linhhoasu/webgame/gm/config.php {BACKUP}/web/config.php; "
        f"cp -a /linhhoasu/webgame/gm/index.php {BACKUP}/web/index.php; "
        f"cp -a /linhhoasu/webgame/gm/api/user_api.php {BACKUP}/web/api/user_api.php; "
        f"cp -a /linhhoasu/webgame/gm/admin/admin_api.php {BACKUP}/web/admin/admin_api.php; "
        f"cp -a /linhhoasu/webgame/gm/account_Linhhoasu.sql {BACKUP}/web/account_Linhhoasu.sql")

    tool_names = [
        "seed_recharge_presets.sql", "recharge_schedule.json", "apply_recharge_presets_live.php",
        "verify_recharge_live.php", "verify_no_tuvi_live.php", "render_recharge_live.php",
        "set_recharge_feature.php", "get_recharge_feature.php",
    ]
    for name in tool_names:
        sftp.put(str(WEB / "_ai_workbench" / "tools" / name), f"{REMOTE_TOOLS}/{name}")

    run(f"php {REMOTE_TOOLS}/set_recharge_feature.php 0")
    feature_disabled = True

    sftp.put(str(ROOT / "_ai_workbench" / "temp" / "donate_remote_current" / "upgrade.no_tuvi.js"), "/linhhoasu/lhs/newServer/src/handlers/upgrade.js")
    sftp.put(str(ROOT / "_ai_workbench" / "temp" / "donate_remote_current" / "handlers_mail.no_tuvi.js"), "/linhhoasu/lhs/newServer/src/handlers/mail.js")
    for rel in ("config.php", "index.php", "api/user_api.php", "admin/admin_api.php", "account_Linhhoasu.sql"):
        sftp.put(str(WEB / rel), "/linhhoasu/webgame/gm/" + rel)

    run("cd /linhhoasu/lhs/newServer && node --check src/handlers/upgrade.js && node --check src/handlers/mail.js && npm run test:core-contract")
    run("php -l /linhhoasu/webgame/gm/config.php && php -l /linhhoasu/webgame/gm/index.php && php -l /linhhoasu/webgame/gm/api/user_api.php && php -l /linhhoasu/webgame/gm/admin/admin_api.php")

    run("pm2 restart lhs-s1001 --update-env && pm2 save")
    time.sleep(12)
    ready = run("curl -sS --max-time 5 http://127.0.0.1:8080/ready")
    if '"status":"ok"' not in ready or '"mongo":true' not in ready or '"redis":true' not in ready:
        raise RuntimeError("game readiness failed")
    run("ss -lntp | grep -E ':8080|:9200'")

    migration_text = run(f"php {REMOTE_TOOLS}/apply_recharge_presets_live.php")
    migration = json.loads(migration_text.splitlines()[-1])
    if migration.get('preset_count') != 50:
        raise RuntimeError("schedule migration did not return 50 rows")
    no_tuvi_text = run(f"su -s /bin/bash www -c 'php {REMOTE_TOOLS}/verify_no_tuvi_live.php'")
    no_tuvi = json.loads(no_tuvi_text.splitlines()[-1])
    if no_tuvi.get('id3_rows') != 0 or no_tuvi.get('counts') != {'day': 10, 'week': 20, 'month': 20}:
        raise RuntimeError(f"no-tuvi verification failed: {no_tuvi}")
    render_text = run(f"su -s /bin/bash www -c 'php {REMOTE_TOOLS}/render_recharge_live.php'")
    render = json.loads(render_text.splitlines()[-1])
    if not render.get('has_no_tuvi') or render.get('shows_empty'):
        raise RuntimeError(f"render verification failed: {render}")

    run(f"php {REMOTE_TOOLS}/set_recharge_feature.php 1")
    feature_disabled = False
    run("pm2 status")
    run("sha256sum /linhhoasu/webgame/gm/config.php /linhhoasu/webgame/gm/index.php /linhhoasu/webgame/gm/api/user_api.php /linhhoasu/webgame/gm/admin/admin_api.php /linhhoasu/webgame/gm/account_Linhhoasu.sql")
    print("BACKUP=" + BACKUP)
finally:
    sftp.close()
    if feature_disabled:
        try:
            run(f"php {REMOTE_TOOLS}/set_recharge_feature.php 1", check=False)
        except Exception:
            pass
    client.close()
