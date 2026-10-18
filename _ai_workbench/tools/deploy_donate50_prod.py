from pathlib import Path
import json
import paramiko
import sys
import time

ROOT = Path(r"I:\Linhhoasu\server\server")
WEB = Path(r"F:\WebSite\gm\Linhhoasu")
REMOTE_TOOLS = "/linhhoasu/_ai_workbench/tools"
STAMP = "20260830_0930"
BACKUP = f"/linhhoasu/_ai_workbench/backups/donate50_prod_{STAMP}"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.105.154', username='root', password='anhduc11', timeout=20, banner_timeout=20, auth_timeout=20, allow_agent=False, look_for_keys=False)

def run(command, check=True):
    stdin, stdout, stderr = client.exec_command(command)
    out_b = stdout.read()
    err_b = stderr.read()
    code = stdout.channel.recv_exit_status()
    sys.stdout.buffer.write((f"$ {command}\n").encode())
    sys.stdout.buffer.write(out_b)
    sys.stderr.buffer.write(err_b)
    if check and code != 0:
        raise RuntimeError(f"command failed ({code}): {command}")
    return out_b.decode('utf-8', 'replace').strip(), code

sftp = client.open_sftp()
feature_disabled = False
try:
    run(f"mkdir -p {BACKUP}/server {BACKUP}/web {REMOTE_TOOLS}")
    tool_files = [
        "seed_recharge_presets.sql", "recharge_schedule.json",
        "apply_recharge_presets_live.php", "verify_recharge_live.php",
        "render_recharge_live.php", "set_recharge_feature.php",
        "test_mail_idempotency_live.php",
    ]
    for name in tool_files:
        sftp.put(str(WEB / "_ai_workbench" / "tools" / name), f"{REMOTE_TOOLS}/{name}")

    run(f"cp -a /linhhoasu/lhs/newServer/src/net/HTTPServer.js {BACKUP}/server/HTTPServer.js; "
        f"cp -a /linhhoasu/lhs/newServer/src/db/models/Mail.js {BACKUP}/server/Mail.js; "
        f"cp -a /linhhoasu/webgame/gm/config.php {BACKUP}/web/config.php; "
        f"cp -a /linhhoasu/webgame/gm/api/user_api.php {BACKUP}/web/user_api.php; "
        f"cp -a /linhhoasu/webgame/gm/account_Linhhoasu.sql {BACKUP}/web/account_Linhhoasu.sql")

    run(f"php {REMOTE_TOOLS}/set_recharge_feature.php 0")
    feature_disabled = True

    # Create the atomic uniqueness guard before enabling eventKey writes.
    run("mongosh --quiet --host 127.0.0.1 --port 27017 lhs_s1001 --eval "
        "'db.mails.createIndex({userId:1,eventKey:1},{unique:true,partialFilterExpression:{eventKey:{$gt:\"\"}},name:\"uniq_mail_user_event_key\"})'")

    sftp.put(str(ROOT / "_ai_workbench" / "temp" / "donate_remote" / "HTTPServer.idempotency.js"), "/linhhoasu/lhs/newServer/src/net/HTTPServer.js")
    sftp.put(str(ROOT / "_ai_workbench" / "temp" / "donate_remote" / "Mail.idempotency.js"), "/linhhoasu/lhs/newServer/src/db/models/Mail.js")
    sftp.put(str(ROOT / "_ai_workbench" / "temp" / "donate_remote" / "config.php"), "/linhhoasu/webgame/gm/config.php")
    sftp.put(str(WEB / "api" / "user_api.php"), "/linhhoasu/webgame/gm/api/user_api.php")
    sftp.put(str(WEB / "account_Linhhoasu.sql"), "/linhhoasu/webgame/gm/account_Linhhoasu.sql")

    run("cd /linhhoasu/lhs/newServer && node --check src/net/HTTPServer.js && node --check src/db/models/Mail.js && npm run test:core-contract")
    run("php -l /linhhoasu/webgame/gm/config.php && php -l /linhhoasu/webgame/gm/api/user_api.php")

    run("pm2 restart lhs-s1001 --update-env && pm2 save")
    time.sleep(12)
    run("curl -sS --max-time 5 http://127.0.0.1:8080/ready")
    run("ss -lntp | grep -E ':8080|:9200'")
    run("pm2 status")

    # E2E idempotency: two identical API calls must persist exactly one mail.
    probe_json, _ = run(f"php {REMOTE_TOOLS}/test_mail_idempotency_live.php")
    probe = json.loads(probe_json.splitlines()[-1])
    event_key = probe['eventKey']
    count, _ = run("mongosh --quiet --host 127.0.0.1 --port 27017 lhs_s1001 --eval "
                   f"'db.mails.countDocuments({{eventKey:\"{event_key}\"}})'")
    if int(count.splitlines()[-1]) != 1:
        raise RuntimeError("idempotency probe did not persist exactly one mail")
    run("mongosh --quiet --host 127.0.0.1 --port 27017 lhs_s1001 --eval "
        f"'db.mails.deleteMany({{eventKey:\"{event_key}\"}}).deletedCount'")

    # Atomic schedule migration with backup + preflight + exact 10/20/20 check.
    migration_json, _ = run(f"php {REMOTE_TOOLS}/apply_recharge_presets_live.php")
    migration = json.loads(migration_json.splitlines()[-1])
    if migration.get('preset_count') != 50:
        raise RuntimeError("migration did not return 50 presets")
    verify_json, _ = run(f"su -s /bin/bash www -c 'php {REMOTE_TOOLS}/verify_recharge_live.php'")
    verify = json.loads(verify_json.splitlines()[-1])
    groups = {row['period_type']: int(row['total']) for row in verify['groups']}
    if verify.get('preset_count') != 50 or groups != {'day': 10, 'month': 20, 'week': 20}:
        raise RuntimeError(f"active schedule mismatch: {verify}")
    render_json, _ = run(f"su -s /bin/bash www -c 'php {REMOTE_TOOLS}/render_recharge_live.php'")
    render = json.loads(render_json.splitlines()[-1])
    if not all((render.get('has_day_tab'), render.get('has_week_tab'), render.get('has_month_tab'), render.get('has_day_preset'), render.get('has_month_preset'))) or render.get('shows_empty'):
        raise RuntimeError(f"render check failed: {render}")

    run(f"php {REMOTE_TOOLS}/set_recharge_feature.php 1")
    feature_disabled = False
    run("sha256sum /linhhoasu/webgame/gm/account_Linhhoasu.sql /linhhoasu/webgame/gm/config.php /linhhoasu/webgame/gm/api/user_api.php")
    print(f"BACKUP={BACKUP}")
finally:
    sftp.close()
    if feature_disabled:
        try:
            run(f"php {REMOTE_TOOLS}/set_recharge_feature.php 1", check=False)
        except Exception:
            pass
    client.close()
