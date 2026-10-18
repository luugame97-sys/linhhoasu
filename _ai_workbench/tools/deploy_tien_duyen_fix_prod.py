"""Deploy the Tiên duyên Activity 9 fix to the production VPS.

The script is deliberately narrow: it verifies the production hashes captured
before the patch, creates a timestamped remote backup, uploads only the listed
artifacts through same-directory temporary files, and restarts lhs-s1001 only.
The VPS password is requested with getpass and is never written to output or
files.
"""
from __future__ import annotations

import getpass
import hashlib
import json
import posixpath
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
USERNAME = "root"
WORKSPACE = Path(__file__).resolve().parents[2]

# Candidate artifacts were built from the production snapshot, not from the
# unrelated local source tree.  Keep every path explicit to prevent accidental
# deployment of other game changes.
RUNTIME_CANDIDATE = WORKSPACE / "_ai_workbench/temp/tien_duyen_runtime_candidate_20260831_184500/linhhoasu"
OLD_CANDIDATE = WORKSPACE / "_ai_workbench/temp/tien_duyen_prod_20260831_183337/linhhoasu"
CLIENT_CONFIG_CANDIDATE = WORKSPACE / "_ai_workbench/temp/tien_duyen_prod_20260831_183337/candidate/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def q(value: str) -> str:
    return shlex.quote(value)


def stage_path(remote: str, stamp: str) -> str:
    """Return a sibling staging path retaining a syntax-recognized suffix."""
    suffix = posixpath.splitext(remote)[1] or ".tmp"
    return f"{remote}.tien-duyen-{stamp}{suffix}"


# remote path -> (local path, expected pre-deploy SHA-256 or None when the
# file is new, expected post-deploy SHA-256)
ARTIFACTS = {
    "/linhhoasu/lhs/newServer/src/services/Activity9Service.js": (
        RUNTIME_CANDIDATE / "lhs/newServer/src/services/Activity9Service.js",
        None,
        "688a4a59f34fe91facea9d2072ee1da8bd92b13b85668f4d7ed896376824bd71",
    ),
    "/linhhoasu/lhs/newServer/src/services/RechargeBenefitService.js": (
        RUNTIME_CANDIDATE / "lhs/newServer/src/services/RechargeBenefitService.js",
        "71a01dba4b12091510151beaf85cd567399b884bb74fb96120774257d7030c34",
        "e41a225f4366560df7e45b82ae2561b9a8ddb6fd9bc6076ab44afc69040cce6a",
    ),
    "/linhhoasu/lhs/newServer/src/handlers/activity.js": (
        RUNTIME_CANDIDATE / "lhs/newServer/src/handlers/activity.js",
        "4106766f1d83d3887a274994514048947571d1307b801d55917c1b5e7f32ed28",
        "5888443562068f2e3da91cf9a9ef6d1f9b5b4e58c6ba1849035691cef924327a",
    ),
    "/linhhoasu/lhs/newServer/src/handlers/compat.js": (
        RUNTIME_CANDIDATE / "lhs/newServer/src/handlers/compat.js",
        "31311d961972f10fe1c54df61a90e38db5cbe889e6ee94699a4b14510b530ada",
        "fcae1f717d6183b3dbf9358b07fc51b61cf309c270864ab557c42d9c48190030",
    ),
    "/linhhoasu/lhs/newServer/src/handlers/recharge.js": (
        RUNTIME_CANDIDATE / "lhs/newServer/src/handlers/recharge.js",
        "eb436be266bc827f5bf492615d0cbc55456847abf97b559347e1fe951e8c2ed3",
        "89023a647f4dde41028d4d8bec888e63fe1cb897234ee630fac70431bd5f8e3d",
    ),
    "/linhhoasu/lhs/newServer/src/handlers/account.js": (
        RUNTIME_CANDIDATE / "lhs/newServer/src/handlers/account.js",
        "b2e0bbcad6b5a04a606ad96f74a74ff2bccd12b63eeb0f37d6805f02e2a7ddc2",
        "7d3f31b56ac62e6461b45077c05f2a73cd077e9a3539b8de0d615fa599c0907c",
    ),
    "/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin": (
        RUNTIME_CANDIDATE / "lhs/update/resource/assets/excel/config_e5ac72c2.bin",
        "cfb1cf5646afc87f6e83e1d52e76ebc5dcc03101cf54d8e0d973bb28f0997702",
        "97d7a44d6d972d0ad7cbd24aeab8c778acf4d70f4e8820c2902be1eb29c3b302",
    ),
    "/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin": (
        CLIENT_CONFIG_CANDIDATE,
        "62db16a67b90ad0f43887a30798728c49f846637e11836e7d5325edeb4d06182",
        "75563740f8e65fde61508309856dea8f91c5080096c40749fe6a6938d6db7d04",
    ),
    "/linhhoasu/webgame/game/index.html": (
        OLD_CANDIDATE / "webgame/game/index.html",
        "39d70a1d91090500245bb00aea6ef25223230213b01ebc12f8c94500560274ed",
        "970667f4833a439a30d1d42fea61f65c15799ec03ce72d9bd3164b495fd82a18",
    ),
    "/linhhoasu/webgame/game/js/main.min_a6195824.js": (
        RUNTIME_CANDIDATE / "webgame/game/js/main.min_a6195824.js",
        "e30b3663edfdd284c36a4915cbe3f39fcd6236dccf4d503ce2e256ca7d22ab9c",
        "0a83139204f9635db61b166907355e0ecff971569693d0e1a7fe438591b0dfe1",
    ),
}


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 120, check: bool = True) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(error[-4000:] or output[-4000:] or f"remote command failed: {code}")
    return output


def remote_sha(ssh: paramiko.SSHClient, path: str) -> str | None:
    output = run(ssh, f"if [ -f {q(path)} ]; then sha256sum {q(path)} | awk '{{print $1}}'; else echo MISSING; fi")
    value = output.strip().splitlines()[-1] if output.strip() else "MISSING"
    return None if value == "MISSING" else value.lower()


def remote_mode_owner(ssh: paramiko.SSHClient, path: str) -> tuple[str, str, str]:
    output = run(
        ssh,
        f"if [ -f {q(path)} ]; then stat -c '%a %u %g' {q(path)}; else echo '644 0 0'; fi",
    ).strip()
    mode, uid, gid = output.splitlines()[-1].split()
    return mode, uid, gid


def wait_ready(ssh: paramiko.SSHClient) -> str:
    command = (
        "for i in $(seq 1 45); do "
        "code=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); "
        "if [ \"$code\" = 200 ] && ss -lnt | grep -q ':9200 '; then echo READY; exit 0; fi; "
        "sleep 1; done; exit 1"
    )
    return run(ssh, command, timeout=60).strip()


def verify_local_candidates() -> None:
    for remote, (local, _before, after) in ARTIFACTS.items():
        if not local.is_file():
            raise FileNotFoundError(f"candidate missing: {local}")
        actual = sha256(local)
        if actual != after:
            raise RuntimeError(f"candidate hash mismatch for {remote}: {actual} != {after}")


def restore_backup(ssh: paramiko.SSHClient, backup: str, installed: list[str]) -> None:
    # The manifest keeps a unique backup filename for every remote path.  This
    # matters because both config files share the basename
    # ``config_e5ac72c2.bin``.
    manifest_path = f"{backup}/manifest.json"
    raw = run(ssh, f"cat -- {q(manifest_path)}", check=False).strip()
    saved = {}
    if raw:
        try:
            saved = json.loads(raw)
        except json.JSONDecodeError:
            saved = {}
    entries = {
        item.get("remote"): item
        for item in saved.get("artifacts", [])
        if isinstance(item, dict) and item.get("remote")
    }
    for remote in reversed(installed):
        entry = entries.get(remote, {})
        backup_file = entry.get("backupPath")
        if backup_file and remote_sha(ssh, backup_file) is not None:
            run(ssh, f"cp -a -- {q(backup_file)} {q(remote)}")
        elif entry.get("expectedBefore") is None:
            # The file did not exist before this deployment.
            run(ssh, f"rm -f -- {q(remote)}", check=False)


def main() -> None:
    verify_local_candidates()
    password = getpass.getpass("VPS password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/tien_duyen_fix_pre_{stamp}"
    manifest = {
        "host": HOST,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "backup": backup,
        "artifacts": [],
    }

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        HOST,
        username=USERNAME,
        password=password,
        look_for_keys=False,
        allow_agent=False,
        timeout=20,
        banner_timeout=20,
        auth_timeout=20,
    )
    installed: list[str] = []
    stages: list[str] = []
    try:
        # Hash precondition: do not overwrite a file changed by another actor.
        for remote, (_local, expected_before, expected_after) in ARTIFACTS.items():
            actual = remote_sha(ssh, remote)
            if expected_before is None:
                if actual not in (None, expected_after):
                    raise RuntimeError(f"new target already exists with unexpected hash: {remote}={actual}")
            elif actual not in (expected_before, expected_after):
                raise RuntimeError(f"production hash precondition failed: {remote}={actual}")
            mode, uid, gid = remote_mode_owner(ssh, remote)
            manifest["artifacts"].append({
                "remote": remote,
                "before": actual,
                "expectedBefore": expected_before,
                "expectedAfter": expected_after,
                "mode": mode,
                "uid": uid,
                "gid": gid,
            })

        run(ssh, f"set -eu; umask 077; mkdir -p {q(backup)}")
        for index, entry in enumerate(manifest["artifacts"], start=1):
            remote = entry["remote"]
            if entry["before"] is not None:
                # Use a unique, deterministic backup name; basename-only
                # backups would collide for the server/client config files.
                backup_file = f"{backup}/artifact_{index:02d}"
                run(ssh, f"cp -a -- {q(remote)} {q(backup_file)}")
                entry["backupPath"] = backup_file
        run(ssh, f"printf '%s\\n' {q(json.dumps(manifest, ensure_ascii=False))} > {q(backup + '/manifest.json')}")

        # Upload to a sibling path, validate syntax there, then rename in the
        # same filesystem.  This prevents a partially-written source/config
        # file from being observed by the running process or Nginx.
        sftp = ssh.open_sftp()
        try:
            for remote, (local, _before, _after) in ARTIFACTS.items():
                stage = stage_path(remote, stamp)
                stages.append(stage)
                sftp.put(str(local), stage)
                entry = next(item for item in manifest["artifacts"] if item["remote"] == remote)
                run(ssh, f"chmod {q(entry['mode'])} {q(stage)}; chown {q(entry['uid'])}:{q(entry['gid'])} {q(stage)}")
        finally:
            sftp.close()

        js_targets = [remote for remote in ARTIFACTS if remote.endswith(".js")]
        for remote in js_targets:
            stage = stage_path(remote, stamp)
            run(ssh, f"node --check {q(stage)}")

        # Ensure the new source can load the 714-table config and exposes the
        # expected price before changing the live path.
        config_probe = (
            "const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');"
            "const t=c.loadAllTables();"
            "const p=t.PayConfig||{};"
            "if(Object.keys(t).length!==714||Number(p[10501].priceR)!==68||Number(p[10502].priceR)!==68)process.exit(2);"
            "console.log(JSON.stringify({tables:Object.keys(t).length,priceR10501:p[10501].priceR,priceR10502:p[10502].priceR}));"
        )
        staged_server_config = stage_path(
            "/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin",
            stamp,
        )
        run(ssh, f"CONFIG_BIN_PATH={q(staged_server_config)} node -e {q(config_probe)}", timeout=120)

        for remote in ARTIFACTS:
            stage = stage_path(remote, stamp)
            run(ssh, f"mv -f -- {q(stage)} {q(remote)}")
            installed.append(remote)

        # Confirm every installed hash before restart.
        for remote, (_local, _before, expected_after) in ARTIFACTS.items():
            actual = remote_sha(ssh, remote)
            if actual != expected_after:
                raise RuntimeError(
                    f"post-upload hash mismatch: {remote}={actual}; expected {expected_after}"
                )

        run(ssh, "pm2 restart lhs-s1001 --update-env", timeout=120)
        ready = wait_ready(ssh)
        run(ssh, "pm2 save", timeout=60)

        served = run(
            ssh,
            "set -eu; "
            "for u in / /js/main.min_a6195824.js /update/resource/assets/excel/config_e5ac72c2.bin; do "
            "f=/tmp/tien_duyen_served.$$; "
            "code=$(curl -sS -o \"$f\" -w '%{http_code}' --max-time 20 \"http://127.0.0.1:81$u\"); "
            "printf '%s|%s|' \"$u\" \"$code\"; sha256sum \"$f\" | awk '{print $1}'; rm -f -- \"$f\"; "
            "done",
            timeout=90,
        )
        process = run(
            ssh,
            "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if(p.name===\"lhs-s1001\")console.log(JSON.stringify({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,uptime:p.pm2_env.pm_uptime}))}})'",
        ).strip()
        listeners = run(ssh, "ss -lnt | grep -E ':(81|8080|9200)\\b' || true").strip()
        print(json.dumps({
            "result": "ok",
            "backup": backup,
            "ready": ready,
            "served": served,
            "process": process,
            "listeners": listeners,
            "postHashes": {remote: remote_sha(ssh, remote) for remote in ARTIFACTS},
        }, ensure_ascii=False, indent=2))
    except Exception:
        if installed:
            try:
                restore_backup(ssh, backup, installed)
                run(ssh, "pm2 restart lhs-s1001 --update-env", timeout=120)
                wait_ready(ssh)
                run(ssh, "pm2 save", timeout=60)
            except Exception as rollback_error:
                print(f"ROLLBACK_ERROR={rollback_error}")
        raise
    finally:
        for stage in stages:
            try:
                run(ssh, f"rm -f -- {q(stage)}", timeout=30, check=False)
            except Exception:
                pass
        ssh.close()


if __name__ == "__main__":
    main()
