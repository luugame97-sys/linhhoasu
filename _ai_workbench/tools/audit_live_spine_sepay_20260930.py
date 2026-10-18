from __future__ import annotations

import ast
import datetime as dt
import hashlib
import json
import posixpath
import re
import base64
import shlex
import sys
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench/temp/live_spine_sepay_audit_20260930.json"
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def load_ssh() -> tuple[list[object], dict[str, object]]:
    source = (ROOT / "_ai_workbench/tools/vps_exec.py").read_text(encoding="utf-8-sig")
    tree = ast.parse(source)
    call = next(
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "connect"
    )
    args = [ast.literal_eval(node) for node in call.args]
    kwargs = {node.arg: ast.literal_eval(node.value) for node in call.keywords}
    kwargs.update(timeout=20, banner_timeout=20, auth_timeout=20)
    return args, kwargs


def sha256_remote(sftp: paramiko.SFTPClient, path: str) -> dict[str, object]:
    try:
        with sftp.open(path, "rb") as stream:
            value = stream.read()
        return {"exists": True, "bytes": len(value), "sha256": hashlib.sha256(value).hexdigest()}
    except Exception as exc:  # noqa: BLE001 - audit records missing files without stopping
        return {"exists": False, "error": type(exc).__name__}


def redact(text: str) -> str:
    # Keep source/diagnostic structure while preventing accidental secret output.
    text = re.sub(r"(?im)^\s*(?:LHS_SEPAY_WEBHOOK_TOKEN|SEPAY_SECRET_KEY|SEPAY_WEBHOOK_SECRET)\s*=.*$", "[SECRET_SETTING_PRESENT]", text)
    text = re.sub(r"(?i)(LHS_SEPAY_WEBHOOK_TOKEN|SEPAY_SECRET_KEY|SEPAY_WEBHOOK_SECRET)\s*[:=]\s*[^\s,;]+", r"\1=[REDACTED]", text)
    return text


def main() -> None:
    args, kwargs = load_ssh()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()

    def run(command: str) -> dict[str, object]:
        _, stdout, stderr = client.exec_command(command, timeout=45)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        return {"code": code, "stdout": redact(out), "stderr": redact(err)}

    files = [
        "/linhhoasu/webgame/game/index.html",
        "/linhhoasu/webgame/game/update/resource/default.res_main_c669f2c0_pet_vusa_20260929.bin",
        "/linhhoasu/webgame/game/update/resource/default.res_cn_main_f70d4753_pet_vusa_20260929.bin",
        "/linhhoasu/webgame/gm/api/sepay_webhook.php",
        "/linhhoasu/webgame/gm/.env",
    ]
    result: dict[str, object] = {
        "at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "host": str(args[0]) if args else "unknown",
        "files": {path: sha256_remote(sftp, path) for path in files},
        "commands": {},
    }

    commands = {
        "nginx_routes": "grep -RniE 'server_name[[:space:]]+lhs\\.mg365\\.fun|web-panel|sepay|listen[[:space:]]+81' /www/server/panel/vhost/nginx /www/server/nginx/conf 2>/dev/null | head -240",
        "sepay_source_shape": "sed -n '1,320p' /linhhoasu/webgame/gm/api/sepay_webhook.php | grep -nE '^(<\\?php|require|include|function|class|[[:space:]]*if|[[:space:]]*try|[[:space:]]*catch|[[:space:]]*header|[[:space:]]*http_response_code)|Sepay|HMAC|signature|timestamp|sepay_logs|recharge_orders|error_log|status' | head -260",
        "env_presence": "grep -E '^[[:space:]]*(LHS_SEPAY_WEBHOOK_TOKEN|SEPAY_SECRET_KEY|SEPAY_WEBHOOK_SECRET)=' /linhhoasu/webgame/gm/.env 2>/dev/null | sed -E 's/=.*$/=[PRESENT]/'",
        "config_shape": "grep -nE 'PDO|mysqli|DB_|MYSQL|dbname|host|web_settings|sepay' /linhhoasu/webgame/gm/config.php /linhhoasu/webgame/gm/api/user_api.php 2>/dev/null | head -180",
        "log_files": "find /www/wwwlogs /linhhoasu/webgame/gm /linhhoasu/lhs/newServer -maxdepth 4 -type f \\( -iname '*sepay*' -o -iname '*error*.log' -o -iname '*access*.log' \\) -printf '%p\\n' 2>/dev/null | sort | head -180",
        "recent_sepay_logs": "for f in /www/wwwlogs/* /linhhoasu/webgame/gm/logs/* /linhhoasu/lhs/newServer/logs/*; do [ -f \"$f\" ] || continue; if grep -qi sepay \"$f\" 2>/dev/null; then echo ===$f; grep -i sepay \"$f\" 2>/dev/null | tail -40; fi; done",
        "recent_php_errors": "for f in /www/wwwlogs/*error*.log /linhhoasu/webgame/gm/logs/*; do [ -f \"$f\" ] || continue; echo ===$f; tail -20 \"$f\" 2>/dev/null; done | head -320",
        "loopback_probe": "for u in http://127.0.0.1:81/api/sepay_webhook.php http://127.0.0.1:81/web-panel/api/sepay_webhook.php http://127.0.0.1:88/api/sepay_webhook.php; do echo ===$u; curl --max-time 10 -sS -D - -o /tmp/sepay_probe_body -H 'Host: lhs.mg365.fun' \"$u\" | sed -n '1,14p'; printf 'BODY='; head -c 300 /tmp/sepay_probe_body; echo; done",
        "public_local_probe": "curl --max-time 15 -k -sS -D - -o /tmp/sepay_public_probe --resolve lhs.mg365.fun:443:127.0.0.1 https://lhs.mg365.fun/api/sepay_webhook.php | sed -n '1,16p'; printf 'BODY='; head -c 400 /tmp/sepay_public_probe; echo",
        "dns_vps": "(command -v dig >/dev/null && dig +short A lhs.mg365.fun; command -v getent >/dev/null && getent ahosts lhs.mg365.fun) 2>/dev/null",
        "readiness": "for p in 8080 8083 8084 8085 8086 8087; do echo -n \"$p \"; curl --max-time 5 -fsS http://127.0.0.1:$p/ready 2>/dev/null | head -c 500; echo; done",
        "pm2_snapshot": "pm2 jlist 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps([{\"name\":x.get(\"name\"),\"status\":x.get(\"pm2_env\",{}).get(\"status\"),\"pid\":x.get(\"pid\"),\"restart\":x.get(\"pm2_env\",{}).get(\"restart_time\")} for x in d if x.get(\"name\",\"\").startswith(\"lhs-s100\")],ensure_ascii=False))'",
    }
    php = r'''<?php
require '/linhhoasu/webgame/gm/config.php';
$out = array();
$safe = function($sql, $params = array()) use (&$conn_web) {
    try { $s = $conn_web->prepare($sql); $s->execute($params); return $s->fetchAll(PDO::FETCH_ASSOC); }
    catch (Throwable $e) { return array('_error' => get_class($e) . ':' . $e->getMessage()); }
};
$out['settings'] = $safe("SELECT setting_key, setting_value FROM web_settings WHERE setting_key IN ('sepay_topup_tag','sepay_vip_tag','sepay_webhook_token') ORDER BY setting_key");
foreach ($out['settings'] as &$row) { if (($row['setting_key'] ?? '') === 'sepay_webhook_token') $row['setting_value'] = '[REDACTED_SET]'; }
$out['sepay_aggregate'] = $safe("SELECT COUNT(*) AS total, SUM(created_at >= NOW() - INTERVAL 24 HOUR) AS last24h, SUM(created_at >= NOW() - INTERVAL 7 DAY) AS last7d, MAX(created_at) AS latest, COALESCE(SUM(CASE WHEN action='topup_xu' THEN amount ELSE 0 END),0) AS xu_sum, COALESCE(SUM(CASE WHEN action='vip' THEN amount ELSE 0 END),0) AS vip_sum FROM sepay_logs");
$out['webhook_only_aggregate'] = $safe("SELECT COUNT(*) AS total, SUM(created_at >= NOW() - INTERVAL 24 HOUR) AS last24h, MAX(created_at) AS latest FROM sepay_logs WHERE tran_id LIKE 'SEPAY-%'");
$out['sepay_recent'] = $safe("SELECT id,created_at,account_name,server_id,amount,action,tran_id,external_id FROM sepay_logs ORDER BY id DESC LIMIT 30");
$out['events_aggregate'] = $safe("SELECT status,level,COUNT(*) AS total,MAX(created_at) AS latest FROM system_event_logs WHERE source='sepay_webhook' GROUP BY status,level ORDER BY latest DESC");
$out['events_recent'] = $safe("SELECT id,created_at,level,status,action,account_name,server_id,message FROM system_event_logs WHERE source='sepay_webhook' ORDER BY id DESC LIMIT 50");
$out['ignored_recent_details'] = $safe("SELECT id,created_at,action,details FROM system_event_logs WHERE source='sepay_webhook' AND status <> 'success' ORDER BY id DESC LIMIT 12");
$out['successful_recent_content'] = $safe("SELECT id,created_at,content,tran_id,account_name,server_id,amount FROM sepay_logs WHERE tran_id LIKE 'SEPAY-%' ORDER BY id DESC LIMIT 3");
$out['recent_failures'] = $safe("SELECT id,created_at,status,action,message FROM system_event_logs WHERE source='sepay_webhook' AND status IN ('failed','manual_review','partial') AND created_at >= NOW()-INTERVAL 7 DAY ORDER BY id DESC LIMIT 15");
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
'''
    encoded = base64.b64encode(php.encode()).decode("ascii")
    commands["db_sepay_summary"] = f"echo {shlex.quote(encoded)} | base64 -d | php -d display_errors=0"
    if '--details-only' in sys.argv:
        result = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'commands': {'db_sepay_summary': run(commands['db_sepay_summary'])}}
        detail_path = ROOT / '_ai_workbench/temp/sepay_details_20260930.json'
        detail_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sftp.close()
        client.close()
        return
    for name, command in commands.items():
        result["commands"][name] = run(command)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sftp.close()
    client.close()


if __name__ == "__main__":
    main()
