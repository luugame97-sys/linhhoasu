"""Run the authorized live QA account contract without logging its password."""
from __future__ import annotations

import getpass
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / "tools" / "qa_fortune_event_live_account_20260902.js"


def run(ssh: paramiko.SSHClient, command: str, stdin_text: str = "", timeout: int = 300) -> tuple[int, str, str]:
    stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    if stdin_text:
        stdin.write(stdin_text)
        stdin.flush()
        stdin.channel.shutdown_write()
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    return stdout.channel.recv_exit_status(), output, error


def main() -> None:
    if not LOCAL.is_file():
        raise FileNotFoundError(LOCAL)
    password = os.environ.get("LHS_QA_PASSWORD") or getpass.getpass("QA game password (not logged): ")
    vps_password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=vps_password, look_for_keys=False, allow_agent=False, timeout=20)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    remote = f"/linhhoasu/_ai_workbench/temp/qa_fortune_event_live_{stamp}.js"
    try:
        sftp = ssh.open_sftp()
        try:
            sftp.put(str(LOCAL), remote)
        finally:
            sftp.close()
        before_code, before, before_error = run(
            ssh,
            "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\",\"lhs-dist\",\"lhs-admin\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time}))}}})'",
        )
        if before_code:
            raise RuntimeError(before_error or before)
        code, output, error = run(
            ssh,
            f"cd /linhhoasu/lhs/newServer && node {remote}",
            stdin_text=password + "\n",
            timeout=360,
        )
        marker = "FORTUNE_QA_JSON="
        if code or marker not in output:
            raise RuntimeError((error + "\n" + output)[-12000:])
        result = json.loads(output.split(marker, 1)[1].splitlines()[0])
        if result.get("result") != "PASS" or result.get("restored") is not True:
            raise RuntimeError("QA did not pass and restore: " + json.dumps(result, ensure_ascii=False))
        after_code, after, after_error = run(
            ssh,
            "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\",\"lhs-dist\",\"lhs-admin\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time}))}}})'",
        )
        if after_code:
            raise RuntimeError(after_error or after)
        health_code, health, health_error = run(
            ssh,
            "curl -sS --max-time 10 -w '\\nHTTP=%{http_code}\\n' http://127.0.0.1:8080/ready; curl -sS --max-time 10 -w '\\nHTTP=%{http_code}\\n' http://127.0.0.1:9200/health",
        )
        if health_code or health.count("HTTP=200") < 2:
            raise RuntimeError(health_error or health)
        payload = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "host": HOST,
            "qa": result,
            "pm2Before": before,
            "pm2After": after,
            "health": health,
        }
        out = ROOT / "temp" / f"fortune_event_live_qa_{stamp}.json"
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"result": "PASS", "restored": True, "checks": result.get("checks"), "evidence": str(out), "sha256": hashlib.sha256(out.read_bytes()).hexdigest()}, ensure_ascii=False, indent=2))
    finally:
        run(ssh, f"rm -f -- {remote}", timeout=30)
        ssh.close()


if __name__ == "__main__":
    main()
