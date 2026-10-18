"""Deploy the scoped input-freeze fix to LHS production with exact preconditions."""
from __future__ import annotations

import getpass
import hashlib
import os
import posixpath
from datetime import datetime, timezone

import paramiko


HOST = "103.116.105.154"
LOCAL_ROOT = r"I:\Linhhoasu\server\server"
REMOTE_ROOT = "/linhhoasu"
STAMP = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
BACKUP = f"{REMOTE_ROOT}/_ai_workbench/backups/input_freeze_fix_pre_{STAMP}"

FILES = {
    "webgame/game/js/main.min_a6195824.js": "54bd847d84b7fd3608bab69f7454716efe14afcdb2f1d4806645c3e5b0e5d3d0",
    "webgame/game/index.html": "69dfe7a6d6c0815b69056e2825b9c9f428e6a63c6f4fbda07bd3b52e98607a9f",
    "lhs/newServer/src/net/WSServer.js": "c3e2d4ec0a26b0a1abeaa70c346a7edb29244deae1b05ce5ae751d76d66da8d6",
    # These two files have production-only localization/semantic changes; the
    # merge tool fetched them and applied only the bounded freeze fixes.
    "lhs/newServer/src/handlers/arena.js": "70c177a94cb750bbfd1e2b319b6392421d69e3e9079b04674d78cf24a8792620",
    "lhs/newServer/src/db/models/Account.js": "b8658b23abde1dba035b25d0043675bf8e433591666b51e70397a75e86b62ef4",
    "lhs/newServer/src/handlers/basic.js": "43922298edc0464c87ec3c368052381699e77ef242f8c5cfa1f09f87d01e47c6",
    "lhs/newServer/src/bots/RealBotWorker.js": "864a62dd5076a439a5ba85e7a9d67aa62df25d3e0eae7f2f83187f1b40b6548f",
}


def local_path(rel: str) -> str:
    if rel in ("lhs/newServer/src/handlers/arena.js", "lhs/newServer/src/db/models/Account.js"):
        return os.path.join(LOCAL_ROOT, "_ai_workbench", "temp", "input_freeze_merged", *rel.split("/"))
    return os.path.join(LOCAL_ROOT, "linhhoasu", *rel.split("/"))


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 120) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(f"remote command failed ({code}): {error[-4000:]}")
    return output


password = getpass.getpass("VPS password (not logged): ")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=15)
stages: list[tuple[str, str, str]] = []
remote_helper = f"{REMOTE_ROOT}/_ai_workbench/temp/apply_account_role_indexes_{STAMP}.js"
installed = False
worker_was_online = False
game_was_online = False

try:
    worker_was_online = run(
        ssh,
        'pid=$(pm2 pid lhs-real-bots 2>/dev/null | tail -1); [ "${pid:-0}" -gt 0 ] && echo online || echo stopped',
    ).strip() == "online"
    game_was_online = run(
        ssh,
        'pid=$(pm2 pid lhs-s1001 2>/dev/null | tail -1); [ "${pid:-0}" -gt 0 ] && echo online || echo stopped',
    ).strip() == "online"
    sftp = ssh.open_sftp()
    try:
        remote_payloads: dict[str, bytes] = {}
        for rel, expected_hash in FILES.items():
            remote = f"{REMOTE_ROOT}/{rel}"
            with sftp.open(remote, "rb") as stream:
                payload = stream.read()
            actual = digest(payload)
            if actual != expected_hash:
                raise RuntimeError(f"precondition failed {rel}: remote={actual} expected={expected_hash}")
            remote_payloads[rel] = payload

        run(ssh, f"mkdir -p -- {BACKUP} {REMOTE_ROOT}/_ai_workbench/temp")
        for rel, payload in remote_payloads.items():
            backup_name = rel.replace("/", "__")
            with sftp.open(posixpath.join(BACKUP, backup_name), "wb") as stream:
                stream.write(payload)

        for rel in FILES:
            remote = f"{REMOTE_ROOT}/{rel}"
            suffix = ".html" if rel.endswith(".html") else ".js"
            stage = f"{remote}.deploy-{STAMP}{suffix}"
            sftp.put(local_path(rel), stage)
            stages.append((rel, remote, stage))

        helper_local = os.path.join(LOCAL_ROOT, "_ai_workbench", "tools", "apply_account_role_indexes.js")
        sftp.put(helper_local, remote_helper)
    finally:
        sftp.close()

    for rel, _remote, stage in stages:
        if rel.endswith(".js"):
            run(ssh, f"node --check {stage}")
    index_stage = next(stage for rel, _remote, stage in stages if rel.endswith("index.html"))
    main_stage = next(stage for rel, _remote, stage in stages if rel.endswith("main.min_a6195824.js"))
    run(ssh, f"grep -q '20260831_input_freeze_guard1' {index_stage}")
    run(ssh, f"grep -q '_lhsActiveTracks' {main_stage}")
    run(ssh, f"grep -q 'lhsLandDone' {main_stage}; grep -q 'lhsMineDone' {main_stage}")

    for _rel, remote, stage in stages:
        run(ssh, f"mv -- {stage} {remote}; chmod 644 {remote}")
    installed = True

    core = run(ssh, f"cd {REMOTE_ROOT}/lhs/newServer && npm run test:core-contract", timeout=180)
    print("CORE_CONTRACT=" + (core.strip().splitlines()[-1] if core.strip() else "empty"))

    index_result = run(
        ssh,
        "pid=$(pm2 pid lhs-s1001 2>/dev/null | tail -1); "
        "[ -n \"$pid\" ] && export MONGO_URI=$(tr '\\0' '\\n' < /proc/$pid/environ | sed -n 's/^MONGO_URI=//p'); "
        f"cd {REMOTE_ROOT}/lhs/newServer && node {remote_helper}",
        timeout=180,
    )
    print("ACCOUNT_INDEXES=" + index_result.strip().splitlines()[-1])

    if worker_was_online:
        run(ssh, "pm2 stop lhs-real-bots")
    try:
        run(ssh, "pm2 restart lhs-s1001 --update-env")
        ready = run(
            ssh,
            "for i in $(seq 1 45); do code=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); "
            "[ \"$code\" = 200 ] && echo 200 && exit 0; sleep 1; done; exit 1",
            timeout=70,
        ).strip()
        health = run(ssh, "curl -fsS --max-time 5 http://127.0.0.1:9200/health", timeout=15).strip()
        if '"revision":"b15797d9e617"' not in health:
            raise RuntimeError("WS health revision mismatch after restart")
        print("READY=" + ready)
        print("WS_REVISION=b15797d9e617")
    finally:
        if worker_was_online:
            run(ssh, "pm2 start lhs-real-bots --update-env")

    run(ssh, "pm2 save")
    served_index = run(ssh, "curl -fsS http://127.0.0.1:81/index.html")
    if "20260831_input_freeze_guard1" not in served_index:
        raise RuntimeError("served index lacks new cache token")

    remote_hashes = run(
        ssh,
        "sha256sum " + " ".join(f"{REMOTE_ROOT}/{rel}" for rel in FILES),
    )
    print("BACKUP=" + BACKUP)
    print("SERVED_TOKEN=20260831_input_freeze_guard1")
    print("REMOTE_HASHES_BEGIN")
    print(remote_hashes.strip())
    print("REMOTE_HASHES_END")
except Exception as exc:
    rollback_errors: list[str] = []
    if installed:
        try:
            restore_parts = []
            for rel in FILES:
                remote = f"{REMOTE_ROOT}/{rel}"
                backup_name = rel.replace("/", "__")
                restore_parts.append(f"cp -p -- {BACKUP}/{backup_name} {remote}")
            run(ssh, "set -eu; " + "; ".join(restore_parts), timeout=180)
        except Exception as rollback_exc:
            rollback_errors.append(f"file restore: {rollback_exc}")
        if game_was_online:
            try:
                run(ssh, "pm2 restart lhs-s1001 --update-env", timeout=120)
            except Exception as rollback_exc:
                rollback_errors.append(f"game restart: {rollback_exc}")
        try:
            if worker_was_online:
                run(ssh, "pm2 start lhs-real-bots --update-env", timeout=120)
            else:
                run(ssh, "pm2 stop lhs-real-bots", timeout=120)
        except Exception as rollback_exc:
            rollback_errors.append(f"worker state: {rollback_exc}")
        try:
            run(ssh, "pm2 save")
        except Exception as rollback_exc:
            rollback_errors.append(f"pm2 save: {rollback_exc}")
        print("ROLLBACK_ATTEMPTED=1")
        print("ROLLBACK_ERRORS=" + (" | ".join(rollback_errors) if rollback_errors else "none"))
    raise RuntimeError(f"deployment failed: {exc}") from exc
finally:
    try:
        cleanup = " ".join(stage for _rel, _remote, stage in stages)
        run(ssh, f"rm -f -- {cleanup} {remote_helper}" if cleanup else f"rm -f -- {remote_helper}")
    except Exception:
        pass
    ssh.close()
