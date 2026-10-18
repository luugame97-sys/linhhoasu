from pathlib import Path
import getpass
import json
import paramiko
import sys
import time

ROOT = Path(r"I:\Linhhoasu\server\server")
WEB = Path(r"F:\WebSite\gm\Linhhoasu")
TOOLS = "/linhhoasu/_ai_workbench/tools"
BACKUP = "/linhhoasu/_ai_workbench/backups/donate_no_tuvi_20260830_1130"

password = getpass.getpass("VPS password: ")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.105.154', username='root', password=password, timeout=20, allow_agent=False, look_for_keys=False)

def run(command, check=True):
    stdin, stdout, stderr = client.exec_command(command)
    out = stdout.read(); err = stderr.read(); code = stdout.channel.recv_exit_status()
    sys.stdout.buffer.write((f"$ {command}\n").encode()); sys.stdout.buffer.write(out); sys.stderr.buffer.write(err)
    sys.stdout.flush(); sys.stderr.flush()
    if check and code != 0: raise RuntimeError(f"command failed ({code}): {command}")
    return out.decode('utf-8', 'replace').strip()

sftp = client.open_sftp()
feature_disabled = False
try:
    run(f"test -d {BACKUP}; test ! -e {BACKUP}/server/test-core-gameplay-contract.js; cp -a /linhhoasu/lhs/newServer/scripts/test-core-gameplay-contract.js {BACKUP}/server/test-core-gameplay-contract.js")
    sftp.put(str(ROOT / "linhhoasu" / "lhs" / "newServer" / "scripts" / "test-core-gameplay-contract.js"), "/linhhoasu/lhs/newServer/scripts/test-core-gameplay-contract.js")
    # Refresh all web files/tools in case the stopped deployment was interrupted mid-upload.
    for name in ("seed_recharge_presets.sql", "recharge_schedule.json", "apply_recharge_presets_live.php", "verify_recharge_live.php", "verify_no_tuvi_live.php", "render_recharge_live.php", "set_recharge_feature.php", "get_recharge_feature.php"):
        sftp.put(str(WEB / "_ai_workbench" / "tools" / name), f"{TOOLS}/{name}")
    for rel in ("config.php", "index.php", "api/user_api.php", "admin/admin_api.php", "account_Linhhoasu.sql"):
        sftp.put(str(WEB / rel), "/linhhoasu/webgame/gm/" + rel)

    run(f"php {TOOLS}/set_recharge_feature.php 0")
    feature_disabled = True
    run("cd /linhhoasu/lhs/newServer && node --check src/handlers/upgrade.js && node --check src/handlers/mail.js && npm run test:core-contract")
    run("php -l /linhhoasu/webgame/gm/config.php && php -l /linhhoasu/webgame/gm/index.php && php -l /linhhoasu/webgame/gm/api/user_api.php && php -l /linhhoasu/webgame/gm/admin/admin_api.php")

    run("pm2 restart lhs-s1001 --update-env && pm2 save")
    time.sleep(12)
    ready = run("curl -sS --max-time 5 http://127.0.0.1:8080/ready")
    if '"status":"ok"' not in ready or '"mongo":true' not in ready or '"redis":true' not in ready: raise RuntimeError("readiness failed")
    run("ss -lntp | grep -E ':8080|:9200'")

    migration = json.loads(run(f"php {TOOLS}/apply_recharge_presets_live.php").splitlines()[-1])
    if migration.get('preset_count') != 50: raise RuntimeError("migration count mismatch")
    no_tuvi = json.loads(run(f"su -s /bin/bash www -c 'php {TOOLS}/verify_no_tuvi_live.php'").splitlines()[-1])
    if no_tuvi.get('id3_rows') != 0 or no_tuvi.get('counts') != {'day':10,'week':20,'month':20}: raise RuntimeError(f"no-tuvi mismatch: {no_tuvi}")
    render = json.loads(run(f"su -s /bin/bash www -c 'php {TOOLS}/render_recharge_live.php'").splitlines()[-1])
    if not render.get('has_no_tuvi') or render.get('shows_empty'): raise RuntimeError(f"render mismatch: {render}")
    run(f"php {TOOLS}/set_recharge_feature.php 1")
    feature_disabled = False
    run("pm2 status")
    run("tail -n 25 /root/.pm2/logs/lhs-s1001-out.log; stat -c '%y %s' /root/.pm2/logs/lhs-s1001-error.log")
    run("sha256sum /linhhoasu/webgame/gm/config.php /linhhoasu/webgame/gm/index.php /linhhoasu/webgame/gm/api/user_api.php /linhhoasu/webgame/gm/admin/admin_api.php /linhhoasu/webgame/gm/account_Linhhoasu.sql")
    print("BACKUP=" + BACKUP)
finally:
    sftp.close()
    if feature_disabled:
        try: run(f"php {TOOLS}/set_recharge_feature.php 1", check=False)
        except Exception: pass
    client.close()
