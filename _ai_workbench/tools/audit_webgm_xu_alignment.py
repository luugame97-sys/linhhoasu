"""Read-only audit of admin Xu updates versus recharge ledger rows."""
from __future__ import annotations

import base64
import getpass
import json

import paramiko


HOST = "103.116.105.154"
PHP = r'''<?php
define('LHS_API_REQUEST', true);
require '/linhhoasu/webgame/gm/config.php';

function rows($sql, $params = array()) {
    global $conn_web;
    $stmt = $conn_web->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

$credits = rows("SELECT id,tran_id,account_name,server_id,CAST(amount AS SIGNED) amount,action,content,created_at FROM sepay_logs WHERE tran_id LIKE 'ADMIN-XU-%' ORDER BY id DESC LIMIT 200");
$gm = rows("SELECT id,account_name admin_account,server_id,action,details,created_at FROM gm_logs WHERE action='update_xu' ORDER BY id DESC LIMIT 200");
$summary = rows("SELECT server_id,COUNT(*) rows_count,COUNT(DISTINCT account_name) accounts,CAST(COALESCE(SUM(amount),0) AS SIGNED) amount_sum,MIN(created_at) first_at,MAX(created_at) last_at FROM sepay_logs WHERE tran_id LIKE 'ADMIN-XU-%' GROUP BY server_id ORDER BY server_id");
$dupe = rows("SELECT tran_id,COUNT(*) c FROM sepay_logs WHERE tran_id LIKE 'ADMIN-XU-%' GROUP BY tran_id HAVING COUNT(*)>1");
$server_ids = rows("SELECT server_id,COUNT(*) rows_count,CAST(COALESCE(SUM(amount),0) AS SIGNED) amount_sum FROM sepay_logs WHERE action IN ('topup_xu','vip') GROUP BY server_id ORDER BY server_id");
$account_totals = rows("SELECT account_name,server_id,CAST(COALESCE(SUM(amount),0) AS SIGNED) recharge_total,SUM(tran_id LIKE 'ADMIN-XU-%') admin_rows,CAST(COALESCE(SUM(CASE WHEN tran_id LIKE 'ADMIN-XU-%' THEN amount ELSE 0 END),0) AS SIGNED) admin_amount FROM sepay_logs WHERE action IN ('topup_xu','vip') GROUP BY account_name,server_id HAVING admin_rows>0 ORDER BY MAX(created_at) DESC LIMIT 200");

echo json_encode(array(
    'readOnly'=>true,
    'summary'=>$summary,
    'serverTotals'=>$server_ids,
    'duplicateTranIds'=>$dupe,
    'adminCredits'=>$credits,
    'adminActions'=>$gm,
    'accountTotals'=>$account_totals
), JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT);
?>'''


def main() -> None:
    password = getpass.getpass("VPS password (not logged): ")
    payload = base64.b64encode(PHP.encode("utf-8")).decode("ascii")
    command = f"printf '%s' '{payload}' | base64 -d | php"
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        _, stdout, stderr = ssh.exec_command(command, timeout=90)
        output = stdout.read().decode("utf-8", "replace")
        error = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
    finally:
        ssh.close()
    if code:
        raise SystemExit(error or output or f"remote exit={code}")
    data = json.loads(output)
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
