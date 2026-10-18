"""Chờ bot S1/S2 reconnect đủ sau deploy ngoại quan và lưu evidence."""

from __future__ import annotations

import json
import os
import shlex
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[1]


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError((error + output)[-12000:])
    return output


def health(ssh: paramiko.SSHClient, port: int) -> dict:
    script = (
        'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s),'
        'r=x.runtime||{},b=r.bots||{},m=r.mapMonsters||{};console.log(JSON.stringify({'
        'status:x.status,real:Number((b.real||{}).count)||0,virtual:Number(b.botCount)||0,'
        'totalSlots:Number(m.totalSlots)||0,multiplier:Number(m.densityMultiplier)||0,'
        'invalid:Number(m.invalid)||0}))})'
    )
    return json.loads(run(
        ssh,
        f"curl -fsS http://127.0.0.1:{port}/health | node -e {shlex.quote(script)}",
    ))


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass
    credentials = Path(
        os.environ.get("LHS_PROD_CREDENTIAL_FILE", ROOT / "VPS103.116.105.154.txt")
    ).read_text(encoding="utf-8-sig").splitlines()
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(
        credentials[0].strip(), username="root", password=credentials[2],
        look_for_keys=False, allow_agent=False, timeout=20,
    )
    rows = []
    try:
        deadline = time.time() + 900
        while time.time() < deadline:
            s1 = health(ssh, 9200)
            s2 = health(ssh, 9201)
            row = {"at": datetime.now(timezone.utc).isoformat(), "s1": s1, "s2": s2}
            rows.append(row)
            print("APPEARANCE_FINAL_HEALTH=" + json.dumps(row), flush=True)
            structural = all(
                value["status"] == "ok" and value["virtual"] == 580
                and value["totalSlots"] == 2466 and value["multiplier"] == 2
                and value["invalid"] == 0
                for value in (s1, s2)
            )
            if not structural:
                raise RuntimeError("STRUCTURAL_HEALTH_FAILED")
            if s1["real"] == 580 and s2["real"] == 580:
                break
            time.sleep(30)
        else:
            raise RuntimeError("BOT_RECONNECT_TIMEOUT")
        errors = run(
            ssh,
            "for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log; do "
            "echo ====\"$f\"; tail -n 120 \"$f\" | grep -E 'TypeError|ReferenceError|Unhandled|FATAL|ERROR' || true; done",
        ).strip()
    finally:
        ssh.close()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    evidence = ROOT / "temp" / f"appearance_postdeploy_health_{stamp}.json"
    evidence.write_text(json.dumps({
        "result": "PASS", "rows": rows, "final": rows[-1], "errors": errors,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"result": "PASS", "evidence": str(evidence), "final": rows[-1], "errors": errors}, ensure_ascii=False))


if __name__ == "__main__":
    main()
