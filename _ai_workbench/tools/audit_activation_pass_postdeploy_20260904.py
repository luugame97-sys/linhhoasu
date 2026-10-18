"""Hậu kiểm read-only fix Activity 7 và ghi evidence local."""

from __future__ import annotations

import hashlib
import json
import os
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[1]
DEPLOY = ROOT / "temp" / "activation_pass_fix_deploy_20260904_151219.json"
AUDIT = ROOT / "temp" / "activation_pass_68_audit_20260904_151952.json"
BACKUP = "/linhhoasu/_ai_workbench/backups/activation_pass_fix_20260904_151219"


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 180) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError((error + output)[-16000:])
    return output


def main() -> None:
    deploy = json.loads(DEPLOY.read_text(encoding="utf-8"))
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
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
    try:
        hashes = {
            path: run(ssh, f"sha256sum {shlex.quote(path)}").split()[0]
            for path in deploy["hashes"]
        }
        ready = {
            str(port): run(
                ssh,
                f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready",
            ).strip()
            for port in (8080, 8083)
        }
        health = {
            str(port): json.loads(run(ssh, f"curl -fsS http://127.0.0.1:{port}/health"))
            for port in (9200, 9201)
        }
        pm2_script = (
            'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify('
            'JSON.parse(s).filter(p=>p.name.startsWith("lhs-")).map(p=>({'
            'name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))));'
        )
        pm2 = json.loads(run(ssh, "pm2 jlist | node -e " + shlex.quote(pm2_script)))
        residue = run(ssh, (
            "find /linhhoasu/_ai_workbench/temp -maxdepth 1 "
            "-type d -name 'activation_pass_fix_*' -print"
        )).strip().splitlines()
        backup_info = json.loads(run(ssh, "node -e " + shlex.quote(
            "const fs=require('fs'),p='" + BACKUP + "/activity_info_before_repair.json';"
            "const x=JSON.parse(fs.readFileSync(p));console.log(JSON.stringify({"
            "exists:true,mode:(fs.statSync(p).mode&511).toString(8),records:x.records.length}))"
        )))
        qa_residue = {}
        for db_name in ("lhs_s1001", "lhs_s1002"):
            qa_residue[db_name] = json.loads(run(
                ssh,
                f"mongosh --quiet 'mongodb://127.0.0.1:27017/{db_name}' --eval " + shlex.quote(
                    "print(JSON.stringify({players:db.players.countDocuments({userId:/^qa_activation_/}),"
                    "transactions:db.transactions.countDocuments({$or:[{userId:/^qa_activation_/},"
                    "{orderId:/^qa-activation-/}]})}))"
                ),
            ))
        errors = run(ssh, (
            "for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log; do "
            "tail -240 \"$f\" | grep -Ei 'uncaught|unhandled|SyntaxError|ReferenceError|ActivationPass|ACTIVATION_PASS' "
            "| tail -20 || true; done"
        )).strip()
    finally:
        ssh.close()

    health_compact = {}
    for port, value in health.items():
        runtime = value.get("runtime", {})
        bots = runtime.get("bots", {})
        monsters = runtime.get("mapMonsters", {})
        health_compact[port] = {
            "status": value.get("status"),
            "realBots": bots.get("real", {}).get("count", 0),
            "virtualBots": bots.get("botCount", 0),
            "monsterSlots": monsters.get("totalSlots", 0),
            "densityMultiplier": monsters.get("densityMultiplier", 0),
            "invalid": monsters.get("invalid", 0),
        }
    checks = {
        "hashes": hashes == deploy["hashes"],
        "ready": all(code == "200" for code in ready.values()),
        "health": all(
            row["status"] == "ok" and row["realBots"] == 580 and row["virtualBots"] == 580
            and row["monsterSlots"] == 2466 and row["densityMultiplier"] == 2 and row["invalid"] == 0
            for row in health_compact.values()
        ),
        "pm2": all(row["status"] == "online" for row in pm2),
        "repair": audit["summary"]["withPurchaseRecord"] == 7
        and audit["summary"]["withEntitlement"] == 7
        and audit["summary"]["purchaseWithoutEntitlement"] == 0,
        "backup": backup_info["exists"] and backup_info["mode"] == "600" and backup_info["records"] == 6,
        "qaCleanup": all(
            row == {"players": 0, "transactions": 0}
            for row in qa_residue.values()
        ),
        "residue": residue == [],
        "errors": errors == "",
    }
    if not all(checks.values()):
        raise RuntimeError("POSTDEPLOY_FAILED:" + json.dumps(checks, sort_keys=True))
    payload = {
        "result": "PASS",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "checks": checks,
        "hashes": hashes,
        "ready": ready,
        "health": health_compact,
        "pm2": pm2,
        "repairSummary": audit["summary"],
        "backup": {"path": BACKUP, **backup_info},
        "qaResidue": qa_residue,
        "stageResidue": residue,
        "recentErrors": errors,
    }
    output = ROOT / "temp" / "activation_pass_postdeploy_20260904.json"
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "result": "PASS",
        "evidence": str(output),
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "checks": checks,
        "ready": ready,
        "health": health_compact,
        "repairSummary": audit["summary"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
