"""Hậu kiểm độc lập fix ngoại quan production, chỉ đọc."""

from __future__ import annotations

import hashlib
import json
import os
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[1]
APP = "/linhhoasu/lhs/newServer"
LOCAL_APP = ROOT.parent / "linhhoasu/lhs/newServer"
RELATIVE = [
    "src/services/RoleAppearanceService.js",
    "src/services/RewardGrantService.js",
    "src/services/FormationService.js",
    "src/handlers/spirit.js",
    "src/handlers/item.js",
    "src/handlers/mail.js",
    "src/handlers/activity.js",
    "src/handlers/fashion.js",
    "src/handlers/official-compat.js",
    "src/handlers/playerPayload.js",
    "src/handlers/recharge.js",
    "src/handlers/compat.js",
]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 300) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError((error + output)[-20000:])
    return output


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
    try:
        hashes = []
        for relative in RELATIVE:
            local = LOCAL_APP / relative
            remote = f"{APP}/{relative}"
            remote_hash = run(ssh, f"sha256sum {shlex.quote(remote)}").split()[0]
            local_hash = digest(local)
            hashes.append({"path": remote, "local": local_hash, "remote": remote_hash, "match": local_hash == remote_hash})
        pm2_script = (
            'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify('
            'JSON.parse(s).filter(p=>["lhs-s1001","lhs-s1002","lhs-real-bots","lhs-real-bots-s2","lhs-dist","lhs-admin"].includes(p.name))'
            '.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,uptime:p.pm2_env.pm_uptime})))))'
        )
        pm2 = json.loads(run(ssh, "pm2 jlist | node -e " + shlex.quote(pm2_script)))
        ready = {
            str(port): run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip()
            for port in (8080, 8083)
        }
        health_script = (
            'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s),'
            'r=x.runtime||{},b=r.bots||{},m=r.mapMonsters||{};console.log(JSON.stringify({'
            'status:x.status,real:Number((b.real||{}).count)||0,virtual:Number(b.botCount)||0,'
            'totalSlots:Number(m.totalSlots)||0,multiplier:Number(m.densityMultiplier)||0,'
            'invalid:Number(m.invalid)||0}))})'
        )
        health = {
            str(port): json.loads(run(
                ssh,
                f"curl -fsS http://127.0.0.1:{port}/health | node -e {shlex.quote(health_script)}",
            ))
            for port in (9200, 9201)
        }
        residue = run(
            ssh,
            "mongosh --quiet --eval " + shlex.quote(
                'for (const n of ["lhs_s1001","lhs_s1002"]) {'
                ' const d=db.getSiblingDB(n); print(n+"|players="+d.players.countDocuments({userId:/^qa_appearance_/})'
                '+"|codes="+d.redemptioncodes.countDocuments({code:/^QAAPP/})'
                '+"|mails="+d.mails.countDocuments({$or:[{userId:/^qa_appearance_/},{batchId:/^qa_appearance_/},{eventKey:/^qa_appearance_/}]})); }'
            ),
        ).strip().splitlines()
        repair_script = (ROOT / "tools/audit_appearance_repair_remote_20260905.js").read_text(encoding="utf-8")
        stdin, stdout, stderr = ssh.exec_command(f"cd {APP} && node - verify", timeout=300)
        stdin.write(repair_script)
        stdin.channel.shutdown_write()
        repair_output = stdout.read().decode("utf-8", "replace")
        repair_error = stderr.read().decode("utf-8", "replace")
        if stdout.channel.recv_exit_status():
            raise RuntimeError((repair_error + repair_output)[-20000:])
        marker = "APPEARANCE_REPAIR_AUDIT="
        repair = json.loads(repair_output.split(marker, 1)[1].splitlines()[0])
        errors = run(
            ssh,
            "for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log; do "
            "echo ====\"$f\"; tail -n 120 \"$f\" | grep -E 'TypeError|ReferenceError|Unhandled|FATAL|ERROR' || true; done",
        ).strip()
    finally:
        ssh.close()
    payload = {
        "result": "PASS",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "hashes": hashes,
        "pm2": pm2,
        "ready": ready,
        "health": health,
        "qaResidue": residue,
        "repairVerify": repair,
        "errors": errors,
    }
    if not all(row["match"] for row in hashes):
        raise RuntimeError("SOURCE_HASH_MISMATCH")
    if ready != {"8080": "200", "8083": "200"}:
        raise RuntimeError("READY_FAILED")
    if not all(row["status"] == "online" for row in pm2):
        raise RuntimeError("PM2_FAILED")
    if not all(
        row == {"status": "ok", "real": 580, "virtual": 580, "totalSlots": 2466, "multiplier": 2, "invalid": 0}
        for row in health.values()
    ):
        raise RuntimeError("HEALTH_FAILED")
    if residue != ["lhs_s1001|players=0|codes=0|mails=0", "lhs_s1002|players=0|codes=0|mails=0"]:
        raise RuntimeError("QA_RESIDUE")
    if any(row.get("affected", 0) != 0 for row in repair["summary"].values()):
        raise RuntimeError("REPAIR_VERIFY_FAILED")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    evidence = ROOT / "temp" / f"appearance_fix_postdeploy_{stamp}.json"
    evidence.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "result": "PASS", "evidence": str(evidence), "hashes": len(hashes),
        "ready": ready, "health": health, "repair": repair["summary"],
        "qaResidue": residue, "errors": errors,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
