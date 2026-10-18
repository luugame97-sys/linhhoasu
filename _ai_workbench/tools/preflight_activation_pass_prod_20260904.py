"""Preflight candidate Activity 7 trên dependency production, không đổi source/live DB."""

from __future__ import annotations

import hashlib
import json
import os
import shlex
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
    credentials = Path(
        os.environ.get("LHS_PROD_CREDENTIAL_FILE", ROOT / "VPS103.116.105.154.txt")
    ).read_text(encoding="utf-8-sig").splitlines()
    baseline = {
        row["remote"]: row
        for row in json.loads(SNAPSHOT.read_text(encoding="utf-8"))["files"]
    }
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    stage = f"/linhhoasu/_ai_workbench/temp/activation_pass_preflight_{stamp}"
    stage_app = f"{stage}/app"
    evidence = ROOT / "temp" / f"activation_pass_preflight_{stamp}.json"

    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(
        credentials[0].strip(),
        username="root",
        password=credentials[2],
        look_for_keys=False,
        allow_agent=False,
        timeout=20,
    )
    try:
        remote_before = {}
        for remote in FILES:
            if baseline[remote]["exists"]:
                remote_before[remote] = run(
                    ssh, f"sha256sum {shlex.quote(remote)}"
                ).split()[0]
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

        run(ssh, (
            f"install -d -m 700 {stage} {stage_app} {stage}/tools "
            f"{stage}/root/linhhoasu/lhs && cp -a {APP}/src {stage_app}/src && "
            f"ln -s {APP}/node_modules {stage_app}/node_modules && "
            f"ln -s {APP}/scripts {stage_app}/scripts && "
            f"ln -s {stage_app} {stage}/root/linhhoasu/lhs/newServer"
        ))
        sftp = ssh.open_sftp()
        try:
            for remote, local in FILES.items():
                relative = remote.removeprefix(APP + "/")
                sftp.put(str(local), f"{stage_app}/{relative}")
            for tool in TOOLS:
                sftp.put(str(ROOT / "tools" / tool), f"{stage}/tools/{tool}")
        finally:
            sftp.close()

        for remote in FILES:
            relative = remote.removeprefix(APP + "/")
            run(ssh, f"node --check {shlex.quote(stage_app + '/' + relative)}")

        env = (
            f"CONFIG_BIN_PATH={CONFIG} "
            f"ACTIVATION_PASS_APP_ROOT={stage_app} "
            f"ACTIVATION_PASS_CONFIG={CONFIG} "
        )
        outputs = {}
        outputs["activation"] = run(
            ssh, f"cd {APP} && {env} node {stage}/tools/test_activation_pass_fix_20260904.js"
        ).strip()
        outputs["cashConcurrency"] = run(
            ssh, f"cd {APP} && {env} node {stage}/tools/test_activation_pass_cash_concurrency_20260904.js"
        ).strip()
        outputs["rechargeResolver"] = run(
            ssh,
            f"cd {APP} && {env} APP_ROOT={stage_app} "
            f"node {stage}/tools/test_recharge_reward_resolver.js",
        ).strip()
        activity9_env = (
            f"TIEN_DUYEN_CANDIDATE_ROOT={stage}/root "
            f"TIEN_DUYEN_CLIENT_CONFIG=/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin "
            f"TIEN_DUYEN_INDEX=/linhhoasu/webgame/game/index.html "
            f"TIEN_DUYEN_CLIENT_MAIN=/linhhoasu/webgame/game/js/main.min_a6195824.js "
        )
        outputs["activity9"] = run(
            ssh,
            f"cd {APP} && {env} {activity9_env} node {stage}/tools/test_activity9_candidate.js",
        ).strip()
        for tool in TOOLS[4:]:
            outputs[tool] = run(
                ssh,
                f"cd {APP} && {env} FORTUNE_APP_ROOT={stage_app} node {stage}/tools/{tool}",
            ).strip()
        outputs["core"] = run(
            ssh,
            f"cd {stage_app} && {env} node scripts/test-core-gameplay-contract.js",
        ).strip()

        candidate_hashes = {remote: digest(local) for remote, local in FILES.items()}
        checks = {
            "activation58": '"assertions": 58' in outputs["activation"],
            "cashConcurrency8": '"checks":8' in outputs["cashConcurrency"],
            "rechargeResolver": '"result":"ok"' in outputs["rechargeResolver"],
            "activity9": '"result":"ok"' in outputs["activity9"],
            "fortune": all(
                'PASS' in outputs[tool]
                for tool in TOOLS[4:]
            ),
            "core714": '"tables":714' in outputs["core"],
        }
        if not all(checks.values()):
            raise RuntimeError("PREFLIGHT_FAILED:" + json.dumps(checks, sort_keys=True))
        payload = {
            "result": "PASS",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "stage": stage,
            "checks": checks,
            "remoteBefore": remote_before,
            "candidateHashes": candidate_hashes,
            "outputs": outputs,
        }
        evidence.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(json.dumps({
            "result": "PASS",
            "evidence": str(evidence),
            "sha256": digest(evidence),
            "checks": checks,
            "candidateHashes": candidate_hashes,
        }, ensure_ascii=False))
    finally:
        try:
            run(ssh, f"rm -rf -- {shlex.quote(stage)}")
        except Exception:
            pass
        ssh.close()


if __name__ == "__main__":
    main()
