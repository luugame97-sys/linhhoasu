"""Deploy fix ngoại quan thống nhất, QA live và repair state production có backup."""

from __future__ import annotations

import hashlib
import json
import os
import shlex
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[1]
APP = "/linhhoasu/lhs/newServer"
CONFIG = "/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin"
LOCAL_APP = ROOT.parent / "linhhoasu/lhs/newServer"
REMOTE_RELATIVE = [
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
FILES = {f"{APP}/{relative}": LOCAL_APP / relative for relative in REMOTE_RELATIVE}
TOOLS = [
    "test_appearance_fix_20260905.js",
    "qa_appearance_live_20260905.js",
    "audit_appearance_repair_remote_20260905.js",
    "test_activation_pass_fix_20260904.js",
    "test_activation_pass_cash_concurrency_20260904.js",
    "test_recharge_reward_resolver.js",
    "test_activity9_candidate.js",
    "test_fortune_event_full.js",
    "test_fortune_event_real_config.js",
    "test_fortune_player_consumption_tracking.js",
]
PROCESS_NAMES = [
    "lhs-s1001", "lhs-s1002", "lhs-real-bots", "lhs-real-bots-s2", "lhs-dist", "lhs-admin",
]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 300) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError((error + output)[-30000:])
    return output


def pm2_state(ssh: paramiko.SSHClient) -> list[dict]:
    script = (
        'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify('
        'JSON.parse(s).filter(p=>' + json.dumps(PROCESS_NAMES) + '.includes(p.name))'
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


def wait_ready(ssh: paramiko.SSHClient, port: int) -> None:
    run(ssh, (
        "for i in $(seq 1 90); do "
        f"code=$(curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready || true); "
        '[ "$code" = 200 ] && exit 0; sleep 1; done; exit 1'
    ), timeout=120)


def parse_marker(output: str, marker: str) -> dict:
    if marker not in output:
        raise RuntimeError(f"MISSING_MARKER:{marker}")
    return json.loads(output.split(marker, 1)[1].splitlines()[0])


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass
    credentials = Path(
        os.environ.get("LHS_PROD_CREDENTIAL_FILE", ROOT / "VPS103.116.105.154.txt")
    ).read_text(encoding="utf-8-sig").splitlines()
    snapshot_meta = json.loads((ROOT / "temp/appearance_fix_prod_snapshot_latest.json").read_text(encoding="utf-8"))
    snapshot_manifest = json.loads(Path(snapshot_meta["manifest"]).read_text(encoding="utf-8"))
    baseline = {row["remote"]: row for row in snapshot_manifest["files"] if row.get("exists")}
    expected_hashes = {remote: digest(local) for remote, local in FILES.items()}
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/appearance_fix_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/appearance_fix_{stamp}"
    db_backup = f"{backup}/mongo"
    repair_backup = f"{backup}/appearance_state_before_repair.json"
    evidence = ROOT / "temp" / f"appearance_fix_deploy_{stamp}.json"
    installed = False
    restarted = False
    repair_started = False
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(
        credentials[0].strip(), username="root", password=credentials[2],
        look_for_keys=False, allow_agent=False, timeout=20,
    )
    result = {"generatedAt": datetime.now(timezone.utc).isoformat(), "backup": backup, "stage": stage}
    try:
        before_pm2 = pm2_state(ssh)
        before_health = [health(ssh, 9200), health(ssh, 9201)]
        remote_before = {
            remote: run(ssh, f"sha256sum {shlex.quote(remote)}").split()[0]
            for remote in FILES
        }
        expected_before = {remote: baseline[remote]["sha256"] for remote in FILES}
        if remote_before != expected_before:
            raise RuntimeError("REMOTE_DRIFT:" + json.dumps(remote_before, sort_keys=True))

        run(ssh, f"install -d -m 700 {backup} {backup}/files {stage} {stage}/files {stage}/tools")
        for index, remote in enumerate(FILES, 1):
            run(ssh, f"cp -a {shlex.quote(remote)} {backup}/files/{index:02d}.before")
        run(ssh, (
            f"mongodump --quiet --db lhs_s1001 --collection players --out {db_backup} "
            f"&& mongodump --quiet --db lhs_s1002 --collection players --out {db_backup}"
        ), timeout=600)

        sftp = ssh.open_sftp()
        try:
            for index, local in enumerate(FILES.values(), 1):
                sftp.put(str(local), f"{stage}/files/{index:02d}.js")
            for tool in TOOLS:
                sftp.put(str(ROOT / "tools" / tool), f"{stage}/tools/{tool}")
        finally:
            sftp.close()

        for index in range(1, len(FILES) + 1):
            run(ssh, f"node --check {stage}/files/{index:02d}.js")
        for tool in TOOLS:
            run(ssh, f"node --check {stage}/tools/{tool}")
        for index, remote in enumerate(FILES, 1):
            run(ssh, f"install -m 644 {stage}/files/{index:02d}.js {shlex.quote(remote)}")
        installed = True
        installed_hashes = {
            remote: run(ssh, f"sha256sum {shlex.quote(remote)}").split()[0]
            for remote in FILES
        }
        if installed_hashes != expected_hashes:
            raise RuntimeError("INSTALL_HASH_MISMATCH")

        env = f"LHS_APP_ROOT={APP} CONFIG_BIN_PATH={CONFIG} "
        pre_restart = {
            "appearance": run(ssh, f"cd {APP} && {env} node {stage}/tools/test_appearance_fix_20260905.js", timeout=420).strip(),
            "activation": run(ssh, f"cd {APP} && ACTIVATION_PASS_APP_ROOT={APP} ACTIVATION_PASS_CONFIG={CONFIG} node {stage}/tools/test_activation_pass_fix_20260904.js", timeout=420).strip(),
            "cashConcurrency": run(ssh, f"cd {APP} && ACTIVATION_PASS_APP_ROOT={APP} ACTIVATION_PASS_CONFIG={CONFIG} node {stage}/tools/test_activation_pass_cash_concurrency_20260904.js", timeout=420).strip(),
            "rechargeResolver": run(ssh, f"cd {APP} && APP_ROOT={APP} CONFIG_BIN_PATH={CONFIG} node {stage}/tools/test_recharge_reward_resolver.js", timeout=300).strip(),
            "core": run(ssh, f"cd {APP} && npm run test:core-contract", timeout=300).strip(),
        }

        repair_dry_output = run(ssh, f"cd {APP} && node {stage}/tools/audit_appearance_repair_remote_20260905.js dry-run", timeout=300)
        repair_dry = parse_marker(repair_dry_output, "APPEARANCE_REPAIR_AUDIT=")
        # Stop only the two game nodes while repairing so an online in-memory
        # player snapshot cannot overwrite the repaired database state.
        restarted = True
        run(ssh, "pm2 stop lhs-s1002", timeout=120)
        run(ssh, "pm2 stop lhs-s1001", timeout=120)
        repair_started = True
        repair_apply_output = run(
            ssh,
            f"cd {APP} && APPEARANCE_REPAIR_BACKUP={shlex.quote(repair_backup)} node {stage}/tools/audit_appearance_repair_remote_20260905.js apply",
            timeout=600,
        )
        repair_apply = parse_marker(repair_apply_output, "APPEARANCE_REPAIR_AUDIT=")
        repair_verify_output = run(ssh, f"cd {APP} && node {stage}/tools/audit_appearance_repair_remote_20260905.js verify", timeout=300)
        repair_verify = parse_marker(repair_verify_output, "APPEARANCE_REPAIR_AUDIT=")
        if any(value.get("affected", 0) != 0 for value in repair_verify["summary"].values()):
            raise RuntimeError("REPAIR_VERIFY_FAILED:" + json.dumps(repair_verify["summary"]))

        run(ssh, f"cd {APP} && pm2 restart ecosystem.config.js --only lhs-s1002 --update-env", timeout=180)
        wait_ready(ssh, 8083)
        # S2 remains entry-gated until 17:00 05/09/2026. It shares source and
        # config with S1, so use the exhaustive source contract until opening.
        s2_shared = run(
            ssh,
            f"cd {APP} && {env} node {stage}/tools/test_appearance_fix_20260905.js",
            timeout=420,
        ).strip()
        if '"catalogIds":2192' not in s2_shared or '"failures":0' not in s2_shared:
            raise RuntimeError("S2_SHARED_CONTRACT_FAILED")

        run(ssh, f"cd {APP} && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env", timeout=180)
        wait_ready(ssh, 8080)
        live_s1 = run(
            ssh,
            f"cd {APP} && QA_SERVER_ID=1001 QA_WS_PORT=9200 QA_DB=lhs_s1001 node {stage}/tools/qa_appearance_live_20260905.js",
            timeout=300,
        ).strip()
        if '"checks":45' not in live_s1 or '"players":0' not in live_s1 or '"codes":0' not in live_s1 or '"mails":0' not in live_s1:
            raise RuntimeError("S1_LIVE_QA_FAILED")

        progress = []
        for _index in range(2):
            current = [health(ssh, 9200), health(ssh, 9201)]
            row = {"at": datetime.now(timezone.utc).isoformat(), "s1": current[0], "s2": current[1]}
            progress.append(row)
            print("APPEARANCE_BOT_PROGRESS=" + json.dumps(row), flush=True)
            if not all(
                item["status"] == "ok" and item["virtual"] == 580
                and item["totalSlots"] == 2466 and item["multiplier"] == 2 and item["invalid"] == 0
                for item in current
            ):
                raise RuntimeError("BOT_HEALTH_FAILED")
            if _index == 0:
                time.sleep(30)

        post_contracts = {
            "appearance": run(ssh, f"cd {APP} && {env} node {stage}/tools/test_appearance_fix_20260905.js", timeout=420).strip(),
            "activity9": run(
                ssh,
                f"cd {APP} && TIEN_DUYEN_CANDIDATE_ROOT=/ TIEN_DUYEN_CLIENT_CONFIG=/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin "
                f"TIEN_DUYEN_INDEX=/linhhoasu/webgame/game/index.html TIEN_DUYEN_CLIENT_MAIN=/linhhoasu/webgame/game/js/main.min_a6195824.js "
                f"CONFIG_BIN_PATH={CONFIG} node {stage}/tools/test_activity9_candidate.js",
                timeout=420,
            ).strip(),
            "fortune": run(ssh, f"cd {APP} && FORTUNE_APP_ROOT={APP} CONFIG_BIN_PATH={CONFIG} node {stage}/tools/test_fortune_event_full.js", timeout=420).strip(),
            "fortuneConfig": run(ssh, f"cd {APP} && FORTUNE_APP_ROOT={APP} CONFIG_BIN_PATH={CONFIG} node {stage}/tools/test_fortune_event_real_config.js", timeout=300).strip(),
            "fortuneTracking": run(ssh, f"cd {APP} && FORTUNE_APP_ROOT={APP} CONFIG_BIN_PATH={CONFIG} node {stage}/tools/test_fortune_player_consumption_tracking.js", timeout=300).strip(),
            "core": run(ssh, f"cd {APP} && npm run test:core-contract", timeout=300).strip(),
        }
        after_pm2 = pm2_state(ssh)
        after_health = [health(ssh, 9200), health(ssh, 9201)]
        errors = run(
            ssh,
            "for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log; do "
            "echo ====\"$f\"; tail -n 80 \"$f\" | grep -E 'TypeError|ReferenceError|Unhandled|FATAL|ERROR' || true; done",
        ).strip()
        result.update({
            "result": "PASS", "beforePm2": before_pm2, "afterPm2": after_pm2,
            "beforeHealth": before_health, "afterHealth": after_health,
            "remoteBefore": remote_before, "installedHashes": installed_hashes,
            "preRestart": pre_restart, "s2SharedContract": s2_shared, "liveS1": live_s1,
            "botProgress": progress, "repairDry": repair_dry, "repairApply": repair_apply,
            "repairVerify": repair_verify, "postContracts": post_contracts, "errors": errors,
            "repairBackup": repair_backup, "databaseBackup": db_backup,
        })
        evidence.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({
            "result": "PASS", "evidence": str(evidence), "backup": backup,
            "repair": {"dry": repair_dry["summary"], "verify": repair_verify["summary"]},
            "health": after_health, "errors": errors,
        }, ensure_ascii=False))
    except Exception:
        if repair_started:
            try:
                run(ssh, "pm2 stop lhs-s1002", timeout=120)
                run(ssh, "pm2 stop lhs-s1001", timeout=120)
                run(
                    ssh,
                    f"cd {APP} && APPEARANCE_REPAIR_BACKUP={shlex.quote(repair_backup)} "
                    f"node {stage}/tools/audit_appearance_repair_remote_20260905.js rollback",
                    timeout=600,
                )
            except Exception:
                pass
        if installed:
            for index, remote in enumerate(FILES, 1):
                try:
                    run(ssh, f"install -m 644 {backup}/files/{index:02d}.before {shlex.quote(remote)}")
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
