"""Deploy P0 checkpoint 1: reject paid goods on shop RPCs.

Only ``handlers/item.js`` is changed.  The script performs a guarded,
atomic rollout, runs the local/remote contract fixture before replacement,
restarts only ``lhs-s1001``, and rolls back the file if post-restart gates fail.
No database or other PM2 process is touched.
"""
from __future__ import annotations

import getpass
import hashlib
import json
import os
import posixpath
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
LOCAL_ITEM = ROOT / "temp/p0_checkpoint1_item_candidate_fresh_20260901/item.js"
LOCAL_TEST = ROOT / "tools/test_p0_item_commerce_contract.js"
REMOTE_ROOT = "/linhhoasu"
REMOTE_APP = "/linhhoasu/lhs/newServer"
REMOTE_ITEM = REMOTE_APP + "/src/handlers/item.js"
REMOTE_COMMERCE = REMOTE_APP + "/src/handlers/commerce-compat.js"
EXPECTED_ITEM = "7974be6f52e1c70e1acaa37254715880816ccb76f6427560a21e2127e7a34f1f"
EXPECTED_CANDIDATE = ""  # populated after local verification
LOCK_DIR = REMOTE_ROOT + "/_ai_workbench/locks"
LOCK_FILE = LOCK_DIR + "/p0_checkpoint1_paid_route.lock"


def q(value: str) -> str:
    return shlex.quote(value)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90, check: bool = True) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(error[-5000:] or output[-5000:] or f"remote exit {code}")
    return output


def remote_sha(ssh: paramiko.SSHClient, path: str) -> str:
    return run(ssh, f"sha256sum -- {q(path)} | awk '{{print $1}}'").strip().lower()


def metadata(ssh: paramiko.SSHClient, path: str) -> str:
    basic = run(ssh, f"stat -c '%u:%g:%a|%U:%G|%s|%y' -- {q(path)}").strip()
    context = run(
        ssh,
        "if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; "
        f"then stat -c '%C' -- {q(path)}; else printf 'selinux-disabled'; fi",
    ).strip()
    prefix, sep, rest = basic.partition("|")
    if not sep:
        raise RuntimeError(f"metadata format mismatch: {basic}")
    return f"{prefix}:{context}|{rest}"


def health(ssh: paramiko.SSHClient) -> dict[str, object]:
    result: dict[str, object] = {}
    for name, url in {
        "ready": "http://127.0.0.1:8080/ready",
        "health": "http://127.0.0.1:9200/health",
    }.items():
        raw = run(
            ssh,
            f"curl -sS --max-time 15 -w '\\n__META__|%{{http_code}}' {q(url)}",
            timeout=30,
        )
        body, _, meta_line = raw.rpartition("\n__META__|")
        result[name] = {"code": meta_line.strip(), "body": body[:1200]}
    return result


def pm2_target(ssh: paramiko.SSHClient) -> dict[str, object]:
    raw = run(
        ssh,
        "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if(p.name===\"lhs-s1001\"){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,status:e.status,pid:p.pid,restarts:e.restart_time,uptime:e.pm_uptime,cwd:e.pm_cwd,script:e.pm_exec_path}))}}})'",
    ).strip()
    if not raw:
        raise RuntimeError("lhs-s1001 not found in PM2")
    return json.loads(raw.splitlines()[-1])


def assert_health(value: dict[str, object], label: str) -> None:
    for key in ("ready", "health"):
        row = value.get(key) or {}
        if not isinstance(row, dict) or str(row.get("code")) != "200":
            raise RuntimeError(f"{label} {key} failed: {row}")
    ready_body = str((value["ready"] or {}).get("body", ""))
    if '"status":"ok"' not in ready_body or '"mongo":true' not in ready_body or '"redis":true' not in ready_body:
        raise RuntimeError(f"{label} readiness payload unhealthy: {ready_body[:1000]}")


def local_preflight() -> tuple[bytes, str]:
    if not LOCAL_ITEM.is_file() or not LOCAL_TEST.is_file():
        raise FileNotFoundError("checkpoint candidate/test artifact missing")
    item = LOCAL_ITEM.read_bytes()
    item_hash = digest(LOCAL_ITEM)
    if item_hash == EXPECTED_ITEM:
        raise RuntimeError("local item candidate is still the unpatched baseline")
    # Ensure only the intended guard exists and syntax is checked by caller.
    text = item.decode("utf-8")
    if text.count("PAID_USE_RECHARGE_PATH") != 1:
        raise RuntimeError("paid-route guard marker count mismatch")
    return item, item_hash


def upload(sftp: paramiko.SFTPClient, local: Path, remote: str) -> None:
    sftp.put(str(local), remote)


def main() -> None:
    item_bytes, candidate_hash = local_preflight()
    # Keep this value in the emitted manifest rather than hard-coding a stale
    # candidate hash; the baseline remains the strict remote precondition.
    password = os.environ.get("LHS_PROD_PASSWORD") or getpass.getpass(
        "Production password (not logged): "
    )
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"{REMOTE_ROOT}/_ai_workbench/backups/p0_checkpoint1_paid_route_pre_{stamp}"
    backup_item = backup + "/item.js"
    backup_meta = backup + "/metadata.json"
    handler_dir = posixpath.dirname(REMOTE_ITEM)
    stage_item = handler_dir + f"/item.p0-stage-{stamp}.js"
    rollback_stage = handler_dir + f"/item.p0-rollback-{stamp}.js"
    remote_test = f"{REMOTE_ROOT}/_ai_workbench/temp/p0_contract_{stamp}.js"
    installed = False
    restarted = False
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
    pre: dict[str, object] = {}
    try:
        pre["itemSha256"] = remote_sha(ssh, REMOTE_ITEM)
        if pre["itemSha256"] != EXPECTED_ITEM:
            raise RuntimeError(f"item baseline drifted: {pre['itemSha256']}")
        pre["itemMetadata"] = metadata(ssh, REMOTE_ITEM)
        pre["mainHealth"] = health(ssh)
        assert_health(pre["mainHealth"], "pre")
        pre["pm2"] = pm2_target(ssh)
        if pre["pm2"].get("status") != "online":
            raise RuntimeError(f"lhs-s1001 not online: {pre['pm2']}")
        # Probe each required binary by path; this also avoids relying on
        # stdout from a compound command whose exit code is intentionally
        # hidden by the bounded runner.
        for binary in ("flock", "node", "pm2"):
            if not run(ssh, f"type -P {q(binary)}", check=False).strip():
                raise RuntimeError(f"required remote binary missing: {binary}")

        run(ssh, f"set -eu; mkdir -p -- {q(backup)} {q(LOCK_DIR)}")
        run(
            ssh,
            "set -eu; "
            f"cp -p -- {q(REMOTE_ITEM)} {q(backup_item)}; "
            f"if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then chcon --reference={q(REMOTE_ITEM)} {q(backup_item)}; fi; "
            f"printf '%s' {q(json.dumps({'source': REMOTE_ITEM, 'baselineSha256': EXPECTED_ITEM, 'metadata': pre['itemMetadata']}, ensure_ascii=False))} > {q(backup_meta)}",
        )
        if remote_sha(ssh, backup_item) != EXPECTED_ITEM:
            raise RuntimeError("backup hash mismatch")

        # Upload the item stage and test fixture. Checkpoint 1 deliberately
        # leaves commerce-compat untouched; the fixture runs only its paid-route
        # suite against the staged item.
        sftp = ssh.open_sftp()
        try:
            upload(sftp, LOCAL_ITEM, stage_item)
            upload(sftp, LOCAL_TEST, remote_test)
        finally:
            sftp.close()
        run(
            ssh,
            "set -eu; "
            f"chown --reference={q(REMOTE_ITEM)} {q(stage_item)} {q(remote_test)}; "
            f"chmod --reference={q(REMOTE_ITEM)} {q(stage_item)} {q(remote_test)}; "
            f"if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then chcon --reference={q(REMOTE_ITEM)} {q(stage_item)} {q(remote_test)}; fi",
        )
        if remote_sha(ssh, stage_item) != candidate_hash:
            raise RuntimeError("stage item hash mismatch")
        run(ssh, f"cd {q(REMOTE_APP)} && node --check {q(stage_item)}")
        # Run the paid-route subset against the stage item. It has
        # network=false and persistence=false by construction.
        test_output = run(
            ssh,
            f"cd {q(REMOTE_ROOT)} && APP_ROOT={q(REMOTE_APP)} "
            f"P0_ITEM_HANDLER_PATH={q(stage_item)} "
            f"P0_ONLY_PAID=1 node {q(remote_test)}",
            timeout=120,
        )
        if '"result":"ok"' not in test_output or '"checks":8' not in test_output:
            raise RuntimeError(f"remote P0 contract failed: {test_output[-4000:]}")

        # Delete the test-only fixture before the critical production swap.
        run(ssh, f"rm -f -- {q(remote_test)}")
        run(
            ssh,
            f"flock -x {q(LOCK_FILE)} sh -c "
            + q(
                "set -eu; "
                f"test \"$(sha256sum -- {q(REMOTE_ITEM)} | awk '{{print $1}}')\" = {q(EXPECTED_ITEM)}; "
                f"mv -f -- {q(stage_item)} {q(REMOTE_ITEM)}"
            ),
        )
        installed = True
        post_item = remote_sha(ssh, REMOTE_ITEM)
        if post_item != candidate_hash:
            raise RuntimeError(f"post-swap item hash mismatch: {post_item}")

        # Restart only the game server process that loads this handler.
        restart_output = run(ssh, "pm2 restart lhs-s1001 --update-env", timeout=120)
        restarted = True
        deadline = time.time() + 75
        post_health: dict[str, object] = {}
        post_pm2: dict[str, object] = {}
        while time.time() < deadline:
            try:
                post_health = health(ssh)
                post_pm2 = pm2_target(ssh)
                if post_pm2.get("status") == "online":
                    assert_health(post_health, "post")
                    break
            except Exception:
                pass
            time.sleep(3)
        assert_health(post_health, "post")
        if post_pm2.get("status") != "online":
            raise RuntimeError(f"lhs-s1001 did not return online: {post_pm2}")
        post_meta = metadata(ssh, REMOTE_ITEM)
        if post_meta.split("|", 1)[0] != str(pre["itemMetadata"]).split("|", 1)[0]:
            raise RuntimeError(f"item owner/mode/context changed: {pre['itemMetadata']} -> {post_meta}")

        result = {
            "result": "DEPLOYED",
            "checkpoint": "p0-paid-route",
            "host": HOST,
            "remote": REMOTE_ITEM,
            "backup": backup,
            "baselineSha256": EXPECTED_ITEM,
            "candidateSha256": candidate_hash,
            "pre": pre,
            "post": {
                "itemSha256": post_item,
                "itemMetadata": post_meta,
                "health": post_health,
                "pm2": post_pm2,
                "restartCommand": "pm2 restart lhs-s1001 --update-env",
                "otherProcessesRestarted": False,
            },
            "contract": "remote 8-case paid-route fixture PASS; network=false; persistence=false",
            "deployedAt": datetime.now(timezone.utc).isoformat(),
            "restartOutputTail": restart_output[-1200:],
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception:
        if installed:
            try:
                current = remote_sha(ssh, REMOTE_ITEM)
                if current == candidate_hash:
                    run(
                        ssh,
                        f"flock -x {q(LOCK_FILE)} sh -c "
                        + q(
                            "set -eu; "
                            f"test \"$(sha256sum -- {q(REMOTE_ITEM)} | awk '{{print $1}}')\" = {q(candidate_hash)}; "
                            f"cp -p -- {q(backup_item)} {q(rollback_stage)}; "
                            f"chown --reference={q(REMOTE_ITEM)} {q(rollback_stage)}; "
                            f"chmod --reference={q(REMOTE_ITEM)} {q(rollback_stage)}; "
                            f"if command -v selinuxenabled >/dev/null 2>&1 && selinuxenabled; then chcon --reference={q(REMOTE_ITEM)} {q(rollback_stage)}; fi; "
                            f"mv -f -- {q(rollback_stage)} {q(REMOTE_ITEM)}"
                        ),
                    )
                    if restarted:
                        run(ssh, "pm2 restart lhs-s1001 --update-env", timeout=120, check=False)
                    print("AUTO_ROLLBACK=completed")
                else:
                    print(f"AUTO_ROLLBACK=refused_drift current={current}")
            except Exception as rollback_error:
                print(f"AUTO_ROLLBACK_ERROR={rollback_error}")
        raise
    finally:
        if ssh.get_transport() and ssh.get_transport().is_active():
            run(
                ssh,
                f"rm -f -- {q(stage_item)} {q(rollback_stage)} {q(remote_test)}",
                timeout=30,
                check=False,
            )
        ssh.close()


if __name__ == "__main__":
    main()
