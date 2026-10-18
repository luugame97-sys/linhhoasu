"""Deploy the exact hit-route V6/V8 guard to the current production index.

The rollout is intentionally static and one-variable: it replaces only
``/linhhoasu/webgame/game/index.html`` after exact hash and content checks.
No backend process is restarted.
"""
from __future__ import annotations

import getpass
import hashlib
import json
import os
import re
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / "_ai_workbench/temp/prod_hit_route_v6_candidate_20260901/index.html"
REMOTE = "/linhhoasu/webgame/game/index.html"
REMOTE_MAIN = "/linhhoasu/webgame/game/js/main.min_a6195824.js"
EXPECTED_REMOTE = "970667f4833a439a30d1d42fea61f65c15799ec03ce72d9bd3164b495fd82a18"
EXPECTED_MAIN = "0a83139204f9635db61b166907355e0ecff971569693d0e1a7fe438591b0dfe1"
EXPECTED_CANDIDATE = "9ed4b5bc65088c3cd2f178691ef68a547025b4180c8f8e74c6e492e79c3e3af9"
EXPECTED_GUARD = "1e171081a591069243f9260440b7e8163d2bf56a8c82ac169d77ac1645c87678"
PRESERVED_TOKENS = (
    "20260831_tien_duyen_fix_v1",
    "__lhsCompletionGuard",
    "__lhsNativeSendGuardV2",
    "__lhsTopCombatProtocolGuardV1",
    "js/main.min_a6195824.js",
)
LOCK_DIR = "/linhhoasu/_ai_workbench/locks"
LOCK_FILE = LOCK_DIR + "/prod_hit_route_v6.lock"


def q(value: str) -> str:
    return shlex.quote(value)


def digest_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def run(
    ssh: paramiko.SSHClient,
    command: str,
    *,
    timeout: int = 90,
    check: bool = True,
) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(error[-4000:] or output[-4000:] or f"remote exit {code}")
    return output


def remote_sha(ssh: paramiko.SSHClient, path: str) -> str:
    return run(ssh, f"sha256sum -- {q(path)} | awk '{{print $1}}'").strip().lower()


def served_sha(ssh: paramiko.SSHClient, path: str, token: str) -> str:
    url = f"http://127.0.0.1:81/{path}?deploy_check={token}"
    return run(
        ssh,
        f"curl -fsS --max-time 20 -H 'Cache-Control: no-cache' {q(url)} | sha256sum | awk '{{print $1}}'",
    ).strip().lower()


def metadata_stat(ssh: paramiko.SSHClient, path: str) -> str:
    basic = run(
        ssh,
        f"stat -c '%u:%g:%a|%U:%G|%s|%y' -- {q(path)}",
    ).strip()
    context = run(
        ssh,
        "if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; "
        f"then stat -c '%C' -- {q(path)}; else printf 'selinux-disabled'; fi",
    ).strip()
    prefix, separator, rest = basic.partition("|")
    if not separator:
        raise RuntimeError(f"metadata stat format mismatch: {basic}")
    return f"{prefix}:{context}|{rest}"


def marker_counts(text: str) -> dict[str, int]:
    names = (
        "LHS_MAIN_HIT_ROUTE_V6_START",
        "__lhsMainHitRouteV6Bootstrap",
        "__lhsMainLayerPriorityV8",
        "LHS_MAIN_HIT_ROUTE_V6_END",
    )
    return {name: text.count(name) for name in names}


EXPECTED_MARKER_COUNTS = {
    "LHS_MAIN_HIT_ROUTE_V6_START": 1,
    "__lhsMainHitRouteV6Bootstrap": 2,
    "__lhsMainLayerPriorityV8": 1,
    "LHS_MAIN_HIT_ROUTE_V6_END": 1,
}


def verify_local() -> bytes:
    candidate = LOCAL.read_bytes()
    if digest_bytes(candidate) != EXPECTED_CANDIDATE:
        raise RuntimeError(f"local candidate hash changed: {digest_bytes(candidate)}")
    text = candidate.decode("utf-8")
    match = re.search(
        r"<!-- LHS_MAIN_HIT_ROUTE_V6_START -->\n<script>(.*?)</script>\n<!-- LHS_MAIN_HIT_ROUTE_V6_END -->",
        text,
        re.S,
    )
    if not match:
        raise RuntimeError("local canonical guard block not found")
    guard_hash = digest_bytes(match.group(1).encode("utf-8"))
    if guard_hash != EXPECTED_GUARD:
        raise RuntimeError(f"local guard hash changed: {guard_hash}")
    counts = marker_counts(text)
    if counts != EXPECTED_MARKER_COUNTS:
        raise RuntimeError(f"local marker count mismatch: {counts}")
    missing = [token for token in PRESERVED_TOKENS if token not in text]
    if missing:
        raise RuntimeError(f"local candidate lost production tokens: {missing}")
    return candidate


def atomic_rollback(
    ssh: paramiko.SSHClient,
    backup_index: str,
    rollback_stage: str,
    token: str,
) -> dict[str, str]:
    current = remote_sha(ssh, REMOTE)
    if current != EXPECTED_CANDIDATE:
        raise RuntimeError(
            f"rollback refused because live index drifted: {current}"
        )
    if remote_sha(ssh, backup_index) != EXPECTED_REMOTE:
        raise RuntimeError("rollback refused because backup hash changed")
    live_stat = metadata_stat(ssh, REMOTE)
    run(
        ssh,
        "set -eu; "
        f"mkdir -p -- {q(LOCK_DIR)}; "
        f"flock -x {q(LOCK_FILE)} sh -c "
        + q(
            "set -eu; "
            f"test \"$(sha256sum -- {q(REMOTE)} | awk '{{print $1}}')\" = {q(EXPECTED_CANDIDATE)}; "
            f"cp -p -- {q(backup_index)} {q(rollback_stage)}; "
            f"chown --reference={q(REMOTE)} {q(rollback_stage)}; "
            f"chmod --reference={q(REMOTE)} {q(rollback_stage)}; "
            f"if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then chcon --reference={q(REMOTE)} {q(rollback_stage)}; fi; "
            f"mv -f -- {q(rollback_stage)} {q(REMOTE)}"
        ),
    )
    disk = remote_sha(ssh, REMOTE)
    served = served_sha(ssh, "index.html", token + "_rollback")
    if disk != EXPECTED_REMOTE or served != EXPECTED_REMOTE:
        raise RuntimeError(f"rollback verification failed: disk={disk}, served={served}")
    restored_stat = metadata_stat(ssh, REMOTE)
    if restored_stat.split("|", 1)[0] != live_stat.split("|", 1)[0]:
        raise RuntimeError(
            f"rollback metadata mismatch: live={live_stat}, restored={restored_stat}"
        )
    return {
        "diskSha256": disk,
        "servedSha256": served,
        "restoredStat": restored_stat,
    }


def main() -> None:
    candidate = verify_local()
    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass(
        "Production password (not logged): "
    )
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/prod_hit_route_v6_pre_{stamp}"
    backup_index = backup + "/index.html"
    backup_meta = backup + "/metadata.txt"
    stage = REMOTE + f".hit-route-stage-{stamp}"
    rollback_stage = REMOTE + f".hit-route-rollback-{stamp}"
    installed = False
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(
        HOST,
        username="root",
        password=password,
        look_for_keys=False,
        allow_agent=False,
        timeout=20,
        banner_timeout=20,
        auth_timeout=20,
    )
    try:
        current = remote_sha(ssh, REMOTE)
        current_served = served_sha(ssh, "index.html", stamp + "_pre")
        main_disk = remote_sha(ssh, REMOTE_MAIN)
        main_served = served_sha(ssh, "js/main.min_a6195824.js", stamp + "_main_pre")
        if current != EXPECTED_REMOTE or current_served != EXPECTED_REMOTE:
            raise RuntimeError(
                f"index precondition changed: disk={current}, served={current_served}"
            )
        if main_disk != EXPECTED_MAIN or main_served != EXPECTED_MAIN:
            raise RuntimeError(
                f"main precondition changed: disk={main_disk}, served={main_served}"
            )
        stat_before = metadata_stat(ssh, REMOTE)
        health_before = run(
            ssh,
            "curl -fsS --max-time 15 http://127.0.0.1:8080/ready",
        ).strip()
        if '"status":"ok"' not in health_before or '"mongo":true' not in health_before or '"redis":true' not in health_before:
            raise RuntimeError(f"backend pre-health failed: {health_before[:1000]}")

        run(
            ssh,
            "set -eu; "
            f"mkdir -p -- {q(backup)}; "
            f"mkdir -p -- {q(LOCK_DIR)}; "
            f"cp -p -- {q(REMOTE)} {q(backup_index)}; "
            f"if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then chcon --reference={q(REMOTE)} {q(backup_index)}; fi; "
            f"stat -c '%n|sha256={EXPECTED_REMOTE}|size=%s|mtime=%y|owner=%U:%G|mode=%a' -- {q(REMOTE)} > {q(backup_meta)}",
        )
        if remote_sha(ssh, backup_index) != EXPECTED_REMOTE:
            raise RuntimeError("backup hash mismatch")
        backup_stat = metadata_stat(ssh, backup_index)
        if backup_stat.split("|", 1)[0] != stat_before.split("|", 1)[0]:
            raise RuntimeError(
                f"backup metadata mismatch: source={stat_before}, backup={backup_stat}"
            )

        sftp = ssh.open_sftp()
        try:
            with sftp.file(stage, "wb") as handle:
                handle.write(candidate)
        finally:
            sftp.close()
        run(
            ssh,
            "set -eu; "
            f"chown --reference={q(REMOTE)} {q(stage)}; "
            f"chmod --reference={q(REMOTE)} {q(stage)}; "
            f"if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then chcon --reference={q(REMOTE)} {q(stage)}; fi",
        )
        if remote_sha(ssh, stage) != EXPECTED_CANDIDATE:
            raise RuntimeError("staged candidate hash mismatch")
        staged_text = run(ssh, f"cat -- {q(stage)}", timeout=120)
        counts = marker_counts(staged_text)
        if counts != EXPECTED_MARKER_COUNTS:
            raise RuntimeError(f"staged marker count mismatch: {counts}")
        missing = [token for token in PRESERVED_TOKENS if token not in staged_text]
        if missing:
            raise RuntimeError(f"staged candidate lost production tokens: {missing}")

        run(
            ssh,
            f"flock -x {q(LOCK_FILE)} sh -c "
            + q(
                "set -eu; "
                f"test \"$(sha256sum -- {q(REMOTE)} | awk '{{print $1}}')\" = {q(EXPECTED_REMOTE)}; "
                f"mv -f -- {q(stage)} {q(REMOTE)}"
            ),
        )
        installed = True

        disk_after = remote_sha(ssh, REMOTE)
        served_after = served_sha(ssh, "index.html", stamp + "_post")
        main_after = remote_sha(ssh, REMOTE_MAIN)
        stat_after = metadata_stat(ssh, REMOTE)
        if disk_after != EXPECTED_CANDIDATE or served_after != EXPECTED_CANDIDATE:
            raise RuntimeError(
                f"installed index verification failed: disk={disk_after}, served={served_after}"
            )
        if main_after != EXPECTED_MAIN:
            raise RuntimeError(f"main changed during rollout: {main_after}")
        if stat_after.split("|", 1)[0] != stat_before.split("|", 1)[0]:
            raise RuntimeError(f"ownership/mode changed: before={stat_before}, after={stat_after}")
        health_after = run(
            ssh,
            "curl -fsS --max-time 15 http://127.0.0.1:8080/ready",
        ).strip()
        if '"status":"ok"' not in health_after or '"mongo":true' not in health_after or '"redis":true' not in health_after:
            raise RuntimeError(f"backend post-health failed: {health_after[:1000]}")

        print(
            json.dumps(
                {
                    "result": "DEPLOYED",
                    "host": HOST,
                    "remote": REMOTE,
                    "backup": backup,
                    "baselineSha256": EXPECTED_REMOTE,
                    "candidateSha256": EXPECTED_CANDIDATE,
                    "guardSha256": EXPECTED_GUARD,
                    "mainSha256": EXPECTED_MAIN,
                    "markerCounts": counts,
                    "statBefore": stat_before,
                    "statAfter": stat_after,
                    "healthBefore": json.loads(health_before),
                    "healthAfter": json.loads(health_after),
                    "backendRestarted": False,
                    "deployedAt": datetime.now(timezone.utc).isoformat(),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    except Exception:
        should_rollback = installed
        if not should_rollback and ssh.get_transport() and ssh.get_transport().is_active():
            try:
                should_rollback = remote_sha(ssh, REMOTE) == EXPECTED_CANDIDATE
            except Exception:
                should_rollback = False
        if should_rollback:
            try:
                result = atomic_rollback(
                    ssh, backup_index, rollback_stage, stamp
                )
                print("AUTO_ROLLBACK=" + json.dumps(result, ensure_ascii=False))
            except Exception as rollback_error:
                print(f"AUTO_ROLLBACK_ERROR={rollback_error}")
        raise
    finally:
        if ssh.get_transport() and ssh.get_transport().is_active():
            run(
                ssh,
                f"rm -f -- {q(stage)} {q(rollback_stage)}",
                timeout=30,
                check=False,
            )
        ssh.close()


if __name__ == "__main__":
    main()
