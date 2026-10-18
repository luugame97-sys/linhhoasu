"""Deploy push Fashion 1800 sau nhuộm màu và chạy E2E production."""

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
CONFIG = "/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin"
REMOTE = f"{APP}/src/handlers/fashion.js"
LOCAL = ROOT.parent / "linhhoasu/lhs/newServer/src/handlers/fashion.js"
BASELINE_SHA256 = "c7665133433c4102cc1d9179ab66830704163c55a544214e656160799b0fe1c3"
TOOLS = [
    "test_suit_dye_ui_sync_gap_20260905.js",
    "test_appearance_fix_20260905.js",
    "qa_suit_dye_ui_sync_live_20260905.js",
    "test_activation_pass_fix_20260904.js",
]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 300) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError((error + output)[-24000:])
    return output


def wait_ready(ssh: paramiko.SSHClient, port: int) -> None:
    run(ssh, (
        "for i in $(seq 1 90); do "
        f"code=$(curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready || true); "
        '[ "$code" = 200 ] && exit 0; sleep 1; done; exit 1'
    ), timeout=120)


def pm2_state(ssh: paramiko.SSHClient) -> list[dict]:
    names = ["lhs-s1001", "lhs-s1002", "lhs-real-bots", "lhs-real-bots-s2", "lhs-dist", "lhs-admin"]
    script = (
        'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify('
        'JSON.parse(s).filter(p=>' + json.dumps(names) + '.includes(p.name))'
        '.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,uptime:p.pm2_env.pm_uptime})))))'
    )
    return json.loads(run(ssh, "pm2 jlist | node -e " + shlex.quote(script)))


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
    expected = digest(LOCAL)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/suit_dye_ui_sync_fix_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/suit_dye_ui_sync_fix_{stamp}"
    evidence = ROOT / "temp" / f"suit_dye_ui_sync_fix_deploy_{stamp}.json"
    installed = False
    restarted = False
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(
        credentials[0].strip(), username="root", password=credentials[2],
        look_for_keys=False, allow_agent=False, timeout=20,
    )
    try:
        before_pm2 = pm2_state(ssh)
        before_health = [health(ssh, 9200), health(ssh, 9201)]
        before_hash = run(ssh, f"sha256sum {shlex.quote(REMOTE)}").split()[0]
        if before_hash != BASELINE_SHA256:
            raise RuntimeError(f"REMOTE_DRIFT:{before_hash}")
        run(ssh, f"install -d -m 700 {backup} {stage}/tools && cp -a {shlex.quote(REMOTE)} {backup}/fashion.js.before")
        sftp = ssh.open_sftp()
        try:
            sftp.put(str(LOCAL), f"{stage}/fashion.js")
            for tool in TOOLS:
                sftp.put(str(ROOT / "tools" / tool), f"{stage}/tools/{tool}")
        finally:
            sftp.close()
        run(ssh, f"node --check {stage}/fashion.js")
        for tool in TOOLS:
            run(ssh, f"node --check {stage}/tools/{tool}")
        run(ssh, f"install -m 644 {stage}/fashion.js {shlex.quote(REMOTE)}")
        installed = True
        installed_hash = run(ssh, f"sha256sum {shlex.quote(REMOTE)}").split()[0]
        if installed_hash != expected:
            raise RuntimeError("INSTALL_HASH_MISMATCH")
        env = f"LHS_APP_ROOT={APP} CONFIG_BIN_PATH={CONFIG} "
        pre_restart = {
            "dyeSync": run(ssh, f"cd {APP} && {env} node {stage}/tools/test_suit_dye_ui_sync_gap_20260905.js").strip(),
            "appearance": run(ssh, f"cd {APP} && {env} node {stage}/tools/test_appearance_fix_20260905.js", timeout=420).strip(),
            "core": run(ssh, f"cd {APP} && npm run test:core-contract").strip(),
        }
        run(ssh, f"cd {APP} && pm2 restart ecosystem.config.js --only lhs-s1002 --update-env", timeout=180)
        wait_ready(ssh, 8083)
        s2_shared = run(ssh, f"cd {APP} && {env} node {stage}/tools/test_suit_dye_ui_sync_gap_20260905.js").strip()
        run(ssh, f"cd {APP} && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env", timeout=180)
        wait_ready(ssh, 8080)
        restarted = True
        live_s1 = run(
            ssh,
            f"cd {APP} && QA_SERVER_ID=1001 QA_WS_PORT=9200 QA_DB=lhs_s1001 node {stage}/tools/qa_suit_dye_ui_sync_live_20260905.js",
            timeout=300,
        ).strip()
        if 'SUIT_DYE_UI_LIVE=' not in live_s1 or '"checks":16' not in live_s1 or '"remaining":0' not in live_s1:
            raise RuntimeError("LIVE_QA_FAILED")
        post_contracts = {
            "dyeSync": run(ssh, f"cd {APP} && {env} node {stage}/tools/test_suit_dye_ui_sync_gap_20260905.js").strip(),
            "appearance": run(ssh, f"cd {APP} && {env} node {stage}/tools/test_appearance_fix_20260905.js", timeout=420).strip(),
            "activation": run(ssh, f"cd {APP} && ACTIVATION_PASS_APP_ROOT={APP} ACTIVATION_PASS_CONFIG={CONFIG} node {stage}/tools/test_activation_pass_fix_20260904.js", timeout=420).strip(),
            "core": run(ssh, f"cd {APP} && npm run test:core-contract").strip(),
        }
        after_pm2 = pm2_state(ssh)
        after_health = [health(ssh, 9200), health(ssh, 9201)]
        if not all(
            value["status"] == "ok" and value["virtual"] == 580
            and value["totalSlots"] == 2466 and value["multiplier"] == 2 and value["invalid"] == 0
            for value in after_health
        ):
            raise RuntimeError("HEALTH_FAILED")
        residue = run(
            ssh,
            "mongosh --quiet --eval " + shlex.quote(
                'for (const n of ["lhs_s1001","lhs_s1002"]) {'
                ' const d=db.getSiblingDB(n); print(n+"|players="+d.players.countDocuments({userId:/^qa_suit_dye_/})); }'
            ),
        ).strip().splitlines()
        if residue != ["lhs_s1001|players=0", "lhs_s1002|players=0"]:
            raise RuntimeError("QA_RESIDUE")
        errors = run(
            ssh,
            "for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log; do "
            "echo ====\"$f\"; tail -n 100 \"$f\" | grep -E 'TypeError|ReferenceError|Unhandled|FATAL|ERROR' || true; done",
        ).strip()
        payload = {
            "result": "PASS", "generatedAt": datetime.now(timezone.utc).isoformat(),
            "backup": backup, "beforeHash": before_hash, "installedHash": installed_hash,
            "beforePm2": before_pm2, "afterPm2": after_pm2,
            "beforeHealth": before_health, "afterHealth": after_health,
            "preRestart": pre_restart, "s2Shared": s2_shared, "liveS1": live_s1,
            "postContracts": post_contracts, "qaResidue": residue, "errors": errors,
        }
        evidence.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({
            "result": "PASS", "evidence": str(evidence), "backup": backup,
            "beforeHash": before_hash, "installedHash": installed_hash,
            "liveS1": live_s1, "health": after_health, "qaResidue": residue,
            "errors": errors,
        }, ensure_ascii=False))
    except Exception:
        if installed:
            try:
                run(ssh, f"install -m 644 {backup}/fashion.js.before {shlex.quote(REMOTE)}")
            except Exception:
                pass
        if restarted:
            try:
                run(ssh, f"cd {APP} && pm2 restart ecosystem.config.js --only lhs-s1002,lhs-s1001 --update-env", timeout=240)
            except Exception:
                pass
        raise
    finally:
        try:
            run(ssh, f"rm -rf -- {shlex.quote(stage)}")
        except Exception:
            pass
        ssh.close()


if __name__ == "__main__":
    main()
