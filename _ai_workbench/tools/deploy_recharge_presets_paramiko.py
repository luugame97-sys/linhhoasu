from pathlib import Path
import paramiko

host = "103.116.105.154"
username = "root"
password = "anhduc11"
local_root = Path(r"F:\WebSite\gm\Linhhoasu")
remote_tool = "/linhhoasu/_ai_workbench/tools"

def run(client, command):
    stdin, stdout, stderr = client.exec_command(command)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    print(f"$ {command}\n{out}{err}", end="")
    if code != 0:
        raise SystemExit(code)

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=username, password=password, timeout=15, banner_timeout=15, auth_timeout=15, allow_agent=False, look_for_keys=False)
sftp = client.open_sftp()
run(client, "mkdir -p /linhhoasu/_ai_workbench/tools /linhhoasu/_ai_workbench/backups/webgm_before_recharge_deploy_20260829_1900")
for name in ("seed_recharge_presets.sql", "apply_recharge_presets_live.php", "patch_remote_recharge_scope.php"):
    sftp.put(str(local_root / "_ai_workbench" / "tools" / name), f"{remote_tool}/{name}")
sftp.close()
run(client, "test -s /linhhoasu/_ai_workbench/tools/seed_recharge_presets.sql")
run(client, "cp -a /linhhoasu/webgame/gm/config.php /linhhoasu/_ai_workbench/backups/webgm_before_recharge_deploy_20260829_1900/config.php; cp -a /linhhoasu/webgame/gm/account_Linhhoasu.sql /linhhoasu/_ai_workbench/backups/webgm_before_recharge_deploy_20260829_1900/account_Linhhoasu.sql")
run(client, "php -l /linhhoasu/_ai_workbench/tools/apply_recharge_presets_live.php; php -l /linhhoasu/_ai_workbench/tools/patch_remote_recharge_scope.php")
run(client, "php /linhhoasu/_ai_workbench/tools/patch_remote_recharge_scope.php")
run(client, "su -s /bin/bash www -c 'php /linhhoasu/_ai_workbench/tools/apply_recharge_presets_live.php'")
run(client, "php -l /linhhoasu/webgame/gm/config.php; grep -n 'function account_total_recharge' /linhhoasu/webgame/gm/config.php")
run(client, "curl -sS -o /dev/null -w 'gm=%{http_code}\\n' http://127.0.0.1:88/index.php")
run(client, "su -s /bin/bash www -c 'php -r '\''require \"/linhhoasu/webgame/gm/config.php\"; echo $conn_web->query(\"SELECT COUNT(*) FROM recharge_milestones WHERE is_active=1\")->fetchColumn(), PHP_EOL;'\''")
client.close()
