"""Deploy fix Activity 7/10301, repair entitlement tối thiểu và chạy live QA."""

from __future__ import annotations

import hashlib
import json
import os
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[1]
APP = "/linhhoasu/lhs/newServer"
CONFIG = "/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin"
SNAPSHOT = ROOT / "temp" / "activation_pass_prod_snapshot_20260904_150036" / "manifest.json"
FILES = {
    f"{APP}/src/services/ActivationPassService.js": ROOT.parent / "linhhoasu/lhs/newServer/src/services/ActivationPassService.js",
    f"{APP}/src/services/RechargeRewardResolver.js": ROOT.parent / "linhhoasu/lhs/newServer/src/services/RechargeRewardResolver.js",
    f"{APP}/src/services/RechargeBenefitService.js": ROOT.parent / "linhhoasu/lhs/newServer/src/services/RechargeBenefitService.js",
    f"{APP}/src/handlers/activity.js": ROOT.parent / "linhhoasu/lhs/newServer/src/handlers/activity.js",
    f"{APP}/src/handlers/compat.js": ROOT.parent / "linhhoasu/lhs/newServer/src/handlers/compat.js",
    f"{APP}/src/handlers/recharge.js": ROOT.parent / "linhhoasu/lhs/newServer/src/handlers/recharge.js",
    f"{APP}/src/handlers/account.js": ROOT.parent / "linhhoasu/lhs/newServer/src/handlers/account.js",
    f"{APP}/src/handlers/playerPayload.js": ROOT.parent / "linhhoasu/lhs/newServer/src/handlers/playerPayload.js",
    f"{APP}/src/handlers/task.js": ROOT.parent / "linhhoasu/lhs/newServer/src/handlers/task.js",
}
TOOLS = [
    "test_activation_pass_fix_20260904.js",
    "test_activation_pass_cash_concurrency_20260904.js",
    "test_recharge_reward_resolver.js",
    "test_activity9_candidate.js",
    "test_fortune_event_full.js",
    "test_fortune_event_real_config.js",
    "test_fortune_player_consumption_tracking.js",
    "qa_activation_pass_live_20260904.js",
    "repair_activation_pass_entitlements_20260904.js",
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
        raise RuntimeError((error + output)[-24000:])
    return output


def pm2_state(ssh: paramiko.SSHClient) -> list[dict]:
    script = (
        'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify('
        'JSON.parse(s).filter(p=>' + json.dumps(PROCESS_NAMES) + '.includes(p.name))'
        '.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))));'
    )
    return json.loads(run(ssh, "pm2 jlist | node -e " + shlex.quote(script)))


def health(ssh: paramiko.SSHClient, port: int) -> dict:
    script = (
        'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s),'
        'r=x.runtime||{},b=r.bots||{},m=r.mapMonsters||{};console.log(JSON.stringify({'
        'status:x.status,real:Number((b.real||{}).count)||0,virtual:Number(b.botCount)||0,'
        'totalSlots:Number(m.totalSlots)||0,multiplier:Number(m.densityMultiplier)||0,'
        'invalid:Number(m.invalid)||0}))});'
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


def parse_repair(output: str) -> dict:
    marker = "ACTIVATION_PASS_REPAIR="
    if marker not in output:
        raise RuntimeError("REPAIR_OUTPUT_MISSING")
    return json.loads(output.split(marker, 1)[1].splitlines()[0])


def main() -> None:
    credentials = Path(
        os.environ.get("LHS_PROD_CREDENTIAL_FILE", ROOT / "VPS103.116.105.154.txt")
    ).read_text(encoding="utf-8-sig").splitlines()
    baseline_rows = json.loads(SNAPSHOT.read_text(encoding="utf-8"))["files"]
    baseline = {row["remote"]: row for row in baseline_rows}
    expected_hashes = {remote: digest(local) for remote, local in FILES.items()}
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/activation_pass_fix_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/activation_pass_fix_{stamp}"
    evidence = ROOT / "temp" / f"activation_pass_fix_deploy_{stamp}.json"
    installed = False
    restarted = False
    repair = None

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
        remote_before = {}
        for remote, row in baseline.items():
            if row["exists"]:
                remote_before[remote] = run(ssh, f"sha256sum {shlex.quote(remote)}").split()[0]
            else:
                exists = run(
                    ssh,
                    f"if [ -e {shlex.quote(remote)} ]; then echo yes; else echo no; fi",
                ).strip()
                remote_before[remote] = "EXISTS" if exists == "yes" else ""
        expected_before = {
            remote: (row["sha256"] if row["exists"] else "")
            for remote, row in baseline.items()
        }
        if remote_before != expected_before:
            raise RuntimeError("REMOTE_DRIFT:" + json.dumps(remote_before, sort_keys=True))

        run(ssh, f"install -d -m 700 {backup} {backup}/files {stage} {stage}/files {stage}/tools")
        for index, (remote, row) in enumerate(baseline.items(), 1):
            if row["exists"]:
                run(ssh, f"cp -a {shlex.quote(remote)} {backup}/files/{index:02d}.before")
            else:
                run(ssh, f"touch {backup}/files/{index:02d}.absent")

        sftp = ssh.open_sftp()
        try:
            for index, (_remote, local) in enumerate(FILES.items(), 1):
                sftp.put(str(local), f"{stage}/files/{index:02d}.js")
            for tool in TOOLS:
                sftp.put(str(ROOT / "tools" / tool), f"{stage}/tools/{tool}")
        finally:
            sftp.close()

        for index in range(1, len(FILES) + 1):
            run(ssh, f"node --check {stage}/files/{index:02d}.js")
        for index, remote in enumerate(FILES, 1):
            run(ssh, f"install -m 644 {stage}/files/{index:02d}.js {shlex.quote(remote)}")
        installed = True

        installed_hashes = {
            remote: run(ssh, f"sha256sum {shlex.quote(remote)}").split()[0]
            for remote in FILES
        }
        if installed_hashes != expected_hashes:
            raise RuntimeError("INSTALL_HASH_MISMATCH")

        env = (
            f"CONFIG_BIN_PATH={CONFIG} ACTIVATION_PASS_APP_ROOT={APP} "
            f"ACTIVATION_PASS_CONFIG={CONFIG} "
        )
        pre_restart = {
            "activation": run(
                ssh, f"cd {APP} && {env} node {stage}/tools/test_activation_pass_fix_20260904.js"
            ).strip(),
            "cashConcurrency": run(
                ssh, f"cd {APP} && {env} node {stage}/tools/test_activation_pass_cash_concurrency_20260904.js"
            ).strip(),
            "rechargeResolver": run(
                ssh, f"cd {APP} && {env} APP_ROOT={APP} node {stage}/tools/test_recharge_reward_resolver.js"
            ).strip(),
        }

        run(ssh, f"cd {APP} && pm2 restart ecosystem.config.js --only lhs-s1002 --update-env", timeout=180)
        wait_ready(ssh, 8083)
        run(ssh, f"cd {APP} && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env", timeout=180)
        wait_ready(ssh, 8080)
        restarted = True

        progress = []
        deadline = time.time() + 720
        while time.time() < deadline:
            current = [health(ssh, 9200), health(ssh, 9201)]
            row = {
                "at": datetime.now(timezone.utc).isoformat(),
                "s1": current[0],
                "s2": current[1],
            }
            progress.append(row)
            print("ACTIVATION_PASS_BOT_PROGRESS=" + json.dumps(row), flush=True)
            if all(
                item["status"] == "ok"
                and item["real"] == 580
                and item["virtual"] == 580
                and item["totalSlots"] == 2466
                and item["multiplier"] == 2
                and item["invalid"] == 0
                for item in current
            ):
                break
            time.sleep(30)
        else:
            raise RuntimeError("BOT_RECONNECT_TIMEOUT")

        live_qa = run(
            ssh,
            f"cd {APP} && QA_SERVER_ID=1001 QA_WS_PORT=9200 QA_DB=lhs_s1001 "
            f"node {stage}/tools/qa_activation_pass_live_20260904.js",
            timeout=240,
        ).strip()
        if "ACTIVATION_PASS_LIVE=" not in live_qa or '"checks":28' not in live_qa:
            raise RuntimeError("LIVE_QA_FAILED")
        if "ACTIVATION_PASS_CLEANUP=" not in live_qa or '"remaining":0' not in live_qa:
            raise RuntimeError("LIVE_QA_CLEANUP_FAILED")

        repair_dry = parse_repair(run(
            ssh,
            f"cd {APP} && node {stage}/tools/repair_activation_pass_entitlements_20260904.js dry-run",
        ))
        repair_backup = f"{backup}/activity_info_before_repair.json"
        repair = parse_repair(run(
            ssh,
            f"cd {APP} && node {stage}/tools/repair_activation_pass_entitlements_20260904.js "
            f"apply {shlex.quote(repair_backup)}",
        ))
        repair_verify = parse_repair(run(
            ssh,
            f"cd {APP} && node {stage}/tools/repair_activation_pass_entitlements_20260904.js verify",
        ))

        activity9_env = (
            "TIEN_DUYEN_CANDIDATE_ROOT=/ "
            "TIEN_DUYEN_CLIENT_CONFIG=/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin "
            "TIEN_DUYEN_INDEX=/linhhoasu/webgame/game/index.html "
            "TIEN_DUYEN_CLIENT_MAIN=/linhhoasu/webgame/game/js/main.min_a6195824.js "
        )
        contracts = {
            "activation": run(
                ssh, f"cd {APP} && {env} node {stage}/tools/test_activation_pass_fix_20260904.js"
            ).strip(),
            "cashConcurrency": run(
                ssh, f"cd {APP} && {env} node {stage}/tools/test_activation_pass_cash_concurrency_20260904.js"
            ).strip(),
            "rechargeResolver": run(
                ssh, f"cd {APP} && {env} APP_ROOT={APP} node {stage}/tools/test_recharge_reward_resolver.js"
            ).strip(),
            "activity9": run(
                ssh, f"cd {APP} && {env} {activity9_env} node {stage}/tools/test_activity9_candidate.js"
            ).strip(),
        }
        for tool in TOOLS[4:7]:
            contracts[tool] = run(
                ssh, f"cd {APP} && {env} FORTUNE_APP_ROOT={APP} node {stage}/tools/{tool}"
            ).strip()
        contracts["core"] = run(ssh, f"cd {APP} && npm run test:core-contract").strip()

        final_hashes = {
            remote: run(ssh, f"sha256sum {shlex.quote(remote)}").split()[0]
            for remote in FILES
        }
        after_pm2 = pm2_state(ssh)
        final_health = [health(ssh, 9200), health(ssh, 9201)]
        before_by = {row["name"]: row for row in before_pm2}
        after_by = {row["name"]: row for row in after_pm2}
        unrelated = ["lhs-real-bots", "lhs-real-bots-s2", "lhs-dist", "lhs-admin"]
        recent_errors = run(ssh, (
            "for f in /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log; do "
            "tail -240 \"$f\" | grep -Ei 'uncaught|unhandled|SyntaxError|ReferenceError|ActivationPass|ACTIVATION_PASS' "
            "| tail -20 || true; done"
        )).strip()
        residue = run(
            ssh,
            f"find /linhhoasu/_ai_workbench/temp -maxdepth 1 -type d -name 'activation_pass_fix_{stamp}' -print",
        ).strip()
        checks = {
            "preRestart": all(
                marker in pre_restart[key]
                for key, marker in {
                    "activation": '"assertions": 58',
                    "cashConcurrency": '"checks":8',
                    "rechargeResolver": '"result":"ok"',
                }.items()
            ),
            "hashes": final_hashes == expected_hashes,
            "liveS1": "ACTIVATION_PASS_LIVE=" in live_qa and '"checks":28' in live_qa,
            "qaCleanup": '"remaining":0' in live_qa,
            "repair": repair["remaining"] if "remaining" in repair else all(
                row["remaining"] == 0 for row in repair["databases"].values()
            ),
            "repairVerify": all(row["remaining"] == 0 for row in repair_verify["databases"].values()),
            "activation58": '"assertions": 58' in contracts["activation"],
            "cashConcurrency8": '"checks":8' in contracts["cashConcurrency"],
            "rechargeResolver": '"result":"ok"' in contracts["rechargeResolver"],
            "activity9": '"result":"ok"' in contracts["activity9"],
            "fortune": all("PASS" in contracts[tool] for tool in TOOLS[4:7]),
            "core714": '"tables":714' in contracts["core"],
            "unrelatedUnchanged": all(
                before_by[name]["pid"] == after_by[name]["pid"]
                and before_by[name]["restarts"] == after_by[name]["restarts"]
                for name in unrelated
            ),
            "online": len(after_pm2) == len(PROCESS_NAMES)
            and all(row["status"] == "online" for row in after_pm2),
            "health": all(
                row["status"] == "ok" and row["real"] == 580 and row["virtual"] == 580
                and row["totalSlots"] == 2466 and row["multiplier"] == 2 and row["invalid"] == 0
                for row in final_health
            ),
            "errorsEmpty": recent_errors == "",
            "stagePresentBeforeCleanup": residue == stage,
        }
        # A successful apply/verify must leave no remaining target. The boolean
        # above intentionally compares the aggregate without exposing identities.
        checks["repair"] = all(row["remaining"] == 0 for row in repair["databases"].values())
        if not all(checks.values()):
            raise RuntimeError("POSTCHECK_FAILED:" + json.dumps(checks, sort_keys=True))

        payload = {
            "result": "PASS",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "backup": backup,
            "repairBackup": repair_backup,
            "checks": checks,
            "beforeHashes": remote_before,
            "hashes": final_hashes,
            "beforePm2": before_pm2,
            "afterPm2": after_pm2,
            "beforeHealth": before_health,
            "progress": progress,
            "finalHealth": final_health,
            "preRestart": pre_restart,
            "liveQA": live_qa,
            "repairDryRun": repair_dry,
            "repair": repair,
            "repairVerify": repair_verify,
            "contracts": contracts,
            "recentErrors": recent_errors,
        }
        evidence.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(json.dumps({
            "result": "PASS",
            "backup": backup,
            "repairBackup": repair_backup,
            "evidence": str(evidence),
            "sha256": digest(evidence),
            "checks": checks,
            "repair": {
                "dryRunTargets": repair_dry["totalTargets"],
                "modified": repair["modified"],
                "remaining": sum(row["remaining"] for row in repair_verify["databases"].values()),
            },
        }, ensure_ascii=False))
    except Exception:
        if installed:
            for index, (remote, row) in enumerate(baseline.items(), 1):
                if row["exists"]:
                    run(ssh, f"cp -p {backup}/files/{index:02d}.before {shlex.quote(remote)}")
                else:
                    run(ssh, f"rm -f -- {shlex.quote(remote)}")
            if restarted:
                run(ssh, f"cd {APP} && pm2 restart ecosystem.config.js --only lhs-s1002 --update-env", timeout=180)
                wait_ready(ssh, 8083)
                run(ssh, f"cd {APP} && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env", timeout=180)
                wait_ready(ssh, 8080)
            print("ROLLBACK=source-restored; entitlement-only repair, if applied, preserved", flush=True)
        raise
    finally:
        try:
            run(ssh, f"rm -rf -- {shlex.quote(stage)}")
        except Exception:
            pass
        ssh.close()


if __name__ == "__main__":
    main()
