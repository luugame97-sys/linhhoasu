"""Read-only sample of the game/WebGM ban payload used by the player modal."""
from __future__ import annotations

import getpass
import json
import shlex

import paramiko

ACCOUNT = "zerovip28n"
PHP = r'''require '/linhhoasu/webgame/gm/config.php';
$account='zerovip28n';
$game=lhs_internal_account_ban('/api/internal/account/ban-status',array('accountId'=>$account));
$s=$conn_web->prepare('SELECT account_name,active,ban_until,reason,ban_code,banned_at,banned_by,metadata_json,updated_at FROM web_account_bans WHERE account_name=? LIMIT 1');
$s->execute(array($account));
echo json_encode(array('readOnly'=>true,'game'=>$game,'web'=>$s->fetch(PDO::FETCH_ASSOC)),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT);'''

password = getpass.getpass("Production password (not logged): ")
ssh = paramiko.SSHClient()
ssh.load_system_host_keys()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("103.116.105.154", username="root", password=password, look_for_keys=False,
            allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
try:
    _, stdout, stderr = ssh.exec_command("php -r " + shlex.quote(PHP), timeout=90)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
finally:
    ssh.close()
if code:
    raise SystemExit(error or output or f"remote exit={code}")
data = json.loads(output)
print(json.dumps(data, ensure_ascii=False, indent=2))
