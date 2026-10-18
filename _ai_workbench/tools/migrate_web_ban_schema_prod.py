"""Create the WebGM timed-ban tables, with a schema-only backup.

This changes only empty/schema state; it does not insert, update, or delete any
account row. Existing tables are never overwritten.
"""

from __future__ import annotations

import base64
import getpass
import json
import os
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]

PHP = r'''
require '/linhhoasu/webgame/gm/config.php';
global $conn_web;
$tables = array('web_account_bans', 'web_account_ban_history');
$before = array();
foreach ($tables as $table) {
    try {
        $stmt = $conn_web->query('SHOW CREATE TABLE `' . $table . '`');
        $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : false;
        $before[$table] = $row ? array_values($row)[1] : null;
    } catch (Exception $e) { $before[$table] = null; }
}
$sql = array(
"CREATE TABLE IF NOT EXISTS `web_account_bans` (`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `account_name` VARCHAR(64) NOT NULL, `active` TINYINT(1) NOT NULL DEFAULT 1, `ban_until` BIGINT UNSIGNED NOT NULL DEFAULT 0, `reason` VARCHAR(240) NOT NULL DEFAULT '', `ban_code` VARCHAR(64) NOT NULL DEFAULT '', `banned_at` DATETIME NULL, `banned_by` VARCHAR(64) NOT NULL DEFAULT '', `metadata_json` TEXT NOT NULL, `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (`id`), UNIQUE KEY `uniq_web_account_bans_account` (`account_name`), KEY `idx_web_account_bans_active_until` (`active`,`ban_until`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
"CREATE TABLE IF NOT EXISTS `web_account_ban_history` (`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `account_name` VARCHAR(64) NOT NULL, `action` VARCHAR(32) NOT NULL, `ban_until` BIGINT UNSIGNED NOT NULL DEFAULT 0, `reason` VARCHAR(240) NOT NULL DEFAULT '', `ban_code` VARCHAR(64) NOT NULL DEFAULT '', `operator_name` VARCHAR(64) NOT NULL DEFAULT '', `metadata_json` TEXT NOT NULL, `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`), KEY `idx_web_ban_history_account` (`account_name`,`created_at`), KEY `idx_web_ban_history_action` (`action`,`created_at`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
);
foreach ($sql as $statement) $conn_web->exec($statement);
$after = array();
foreach ($tables as $table) {
    $stmt = $conn_web->query('SHOW CREATE TABLE `' . $table . '`');
    $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : false;
    $after[$table] = $row ? array_values($row)[1] : null;
}
echo 'SCHEMA_JSON=' . json_encode(array('before'=>$before,'after'=>$after), JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
'''


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 120) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-5000:] or output[-5000:] or f"remote exit={code}")
    return output


def main() -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out = ROOT / "temp" / "timed_ban_qa"
    out.mkdir(parents=True, exist_ok=True)
    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient(); ssh.load_system_host_keys(); ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        remote_backup = f"/linhhoasu/_ai_workbench/backups/timed_ban_schema_pre_{stamp}"
        run(ssh, f"mkdir -p -- {shlex.quote(remote_backup)}")
        source = base64.b64encode(PHP.encode()).decode()
        output = run(ssh, f"php -r \"eval(base64_decode('{source}'));\"", timeout=120)
        marker = "SCHEMA_JSON="
        if marker not in output: raise RuntimeError("schema migration marker missing")
        schema = json.loads(output.split(marker, 1)[1].splitlines()[0])
        if not schema.get("after", {}).get("web_account_bans") or not schema.get("after", {}).get("web_account_ban_history"):
            raise RuntimeError("schema creation readback missing")
        local_target = out / f"web_ban_schema_{stamp}.json"
        local_target.write_text(json.dumps({"generatedAt":datetime.now(timezone.utc).isoformat(),"host":HOST,"readOnlyAccountData":True,"remoteBackup":remote_backup,"schema":schema},ensure_ascii=False,indent=2),encoding="utf-8")
        print(json.dumps({"result":"PASS","output":str(local_target),"remoteBackup":remote_backup,"before":{k:bool(v) for k,v in schema.get("before",{}).items()},"after":{k:bool(v) for k,v in schema.get("after",{}).items()}},ensure_ascii=False,indent=2))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
