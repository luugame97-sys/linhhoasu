"""Deploy the verified appearance-preview v4 client addon with a narrow CAS rollout.

Only the static preview addon and the index cache marker are changed.  The
remote index is patched from its live bytes so unrelated client releases are
preserved.  No PM2 process, game server, Mongo/Redis data, or player record is
touched.
"""
from __future__ import annotations

import hashlib
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
ROOT = WB.parent
sys.path.insert(0, str(WB / "tools"))
from snapshot_web_multiserver_20260906 import connect, run  # noqa: E402


GAME = ROOT / "linhhoasu" / "webgame" / "game"
REMOTE_ADDON = "/linhhoasu/webgame/game/js/lhs-appearance-preview-v1.js"
REMOTE_INDEX = "/linhhoasu/webgame/game/index.html"
LOCAL_ADDON = GAME / "js" / "lhs-appearance-preview-v1.js"
VERSION_OLD = b"20260927_appearance_preview_v3"
VERSION_NEW = b"20260927_appearance_preview_v4"
EXPECTED_BEFORE = {
    REMOTE_ADDON: "f40f8c627ba7551e7adf7d3e1b0c552d6ff00026534016d6f8f07f2449776cf9",
    REMOTE_INDEX: "04d680ae5477c4c2f9587f845249f5bdd4f865f07309f0a2384eeb932e87cd1f",
}
NODES = [
    ("lhs-s1001", 8080),
    ("lhs-s1002", 8083),
    ("lhs-s1003", 8084),
    ("lhs-s1004", 8085),
    ("lhs-s1005", 8086),
    ("lhs-s1006", 8087),
]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def remote_bytes(sftp, path: str) -> bytes | None:
    try:
        with sftp.open(path, "rb") as handle:
            return handle.read()
    except FileNotFoundError:
        return None


def remote_sha(sftp, path: str) -> str | None:
    data = remote_bytes(sftp, path)
    return sha(data) if data is not None else None


def write_remote(sftp, path: str, data: bytes) -> None:
    with sftp.open(path, "wb") as handle:
        handle.write(data)
    sftp.chmod(path, 0o644)


def pm2_game_state(ssh) -> dict[str, dict]:
    rows = json.loads(run(ssh, "pm2 jlist"))
    return {
        row["name"]: {
            "pid": row.get("pid"),
            "status": row.get("pm2_env", {}).get("status"),
            "restarts": row.get("pm2_env", {}).get("restart_time"),
        }
        for row in rows
        if row.get("name") in {name for name, _port in NODES}
    }


def ready(ssh, port: int) -> str:
    command = (
        "last=000; for i in $(seq 1 3); do "
        "last=$(curl -sS --connect-timeout 3 --max-time 10 -o /dev/null "
        "-w '%{http_code}' "
        + shlex.quote(f"http://127.0.0.1:{port}/ready")
        + " || true); "
        "if [ \"$last\" = 200 ]; then echo 200; exit 0; fi; sleep 1; "
        "done; echo \"$last\""
    )
    return run(ssh, command).strip()


def patch_index(remote: bytes) -> bytes:
    old = b"js/lhs-appearance-preview-v1.js?v=" + VERSION_OLD
    new = b"js/lhs-appearance-preview-v1.js?v=" + VERSION_NEW
    if remote.count(old) != 1 or remote.count(new) != 0:
        raise RuntimeError("INDEX_APPEARANCE_V3_ANCHOR_COUNT")
    candidate = remote.replace(old, new, 1)
    if candidate.count(new) != 1:
        raise RuntimeError("INDEX_APPEARANCE_V4_MARKER_MISSING")
    return candidate


def cleanup_stage(ssh, stage: str, stage_paths: list[str]) -> None:
    for path in stage_paths:
        try:
            run(ssh, "rm -f -- " + shlex.quote(path))
        except Exception:
            pass
    try:
        run(ssh, "rmdir -- " + shlex.quote(stage))
    except Exception:
        pass


def main() -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/appearance_preview_v4_20260927_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/appearance_preview_v4_20260927_{stamp}"
    evidence_path = WB / "temp" / "appearance_preview_v4_20260927" / f"deploy_{stamp}.json"
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    addon = LOCAL_ADDON.read_bytes()
    if VERSION_NEW not in addon:
        raise RuntimeError("LOCAL_V4_MARKER_MISSING")
    if sha(addon) == EXPECTED_BEFORE[REMOTE_ADDON]:
        raise RuntimeError("LOCAL_ADDON_STILL_V3")
    local_addon_hash = sha(addon)
    evidence = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "PREPARING",
        "backup": backup,
        "stage": stage,
        "productionWrites": 0,
        "playerWrites": 0,
        "dbWrites": 0,
        "processRestarts": 0,
        "files": {},
    }
    ssh = connect()
    installed: list[str] = []
    stage_paths: list[str] = []
    backup_paths: dict[str, str] = {}
    before_hashes: dict[str, str] = {}
    candidate_hashes: dict[str, str] = {}
    try:
        before_pm2 = pm2_game_state(ssh)
        if any(before_pm2.get(name, {}).get("status") != "online" for name, _port in NODES):
            raise RuntimeError("GAME_NODE_NOT_ONLINE:" + json.dumps(before_pm2, sort_keys=True))
        before_ready = {str(port): ready(ssh, port) for _name, port in NODES}
        if any(value != "200" for value in before_ready.values()):
            raise RuntimeError("READY_NOT_200_BEFORE:" + json.dumps(before_ready, sort_keys=True))
        evidence["beforePm2"] = before_pm2
        evidence["beforeReady"] = before_ready

        with ssh.open_sftp() as sftp:
            remote_addon = remote_bytes(sftp, REMOTE_ADDON)
            remote_index = remote_bytes(sftp, REMOTE_INDEX)
            if remote_addon is None or remote_index is None:
                raise RuntimeError("REMOTE_REQUIRED_FILE_MISSING")
            before_hashes = {REMOTE_ADDON: sha(remote_addon), REMOTE_INDEX: sha(remote_index)}
            if before_hashes != EXPECTED_BEFORE:
                raise RuntimeError("REMOTE_BASELINE_DRIFT:" + json.dumps(before_hashes, sort_keys=True))
            candidate_index = patch_index(remote_index)
            candidate_data = {REMOTE_ADDON: addon, REMOTE_INDEX: candidate_index}
            candidate_hashes = {path: sha(data) for path, data in candidate_data.items()}
            evidence["files"] = {
                REMOTE_ADDON: {
                    "before": before_hashes[REMOTE_ADDON],
                    "candidate": candidate_hashes[REMOTE_ADDON],
                    "local": local_addon_hash,
                    "bytes": len(addon),
                },
                REMOTE_INDEX: {
                    "before": before_hashes[REMOTE_INDEX],
                    "candidate": candidate_hashes[REMOTE_INDEX],
                    "bytes": len(candidate_index),
                    "patch": "appearance_preview_v3_to_v4_only",
                },
            }

            run(ssh, "install -d -m 700 " + shlex.quote(backup) + " " + shlex.quote(stage))
            for index, path in enumerate((REMOTE_ADDON, REMOTE_INDEX), 1):
                safe = f"{index:02d}_{path.strip('/').replace('/', '__')}"
                backup_path = backup + "/" + safe + ".before"
                stage_path = stage + "/" + safe + ".candidate"
                run(ssh, "cp -p -- " + shlex.quote(path) + " " + shlex.quote(backup_path))
                if remote_sha(sftp, backup_path) != before_hashes[path]:
                    raise RuntimeError("BACKUP_HASH_MISMATCH:" + path)
                write_remote(sftp, stage_path, candidate_data[path])
                if remote_sha(sftp, stage_path) != candidate_hashes[path]:
                    raise RuntimeError("STAGE_HASH_MISMATCH:" + path)
                backup_paths[path] = backup_path
                stage_paths.append(stage_path)

            # The staged filename intentionally ends in .candidate, which
            # Node 20 rejects as a module extension.  Feed it over stdin so
            # syntax validation still runs without renaming or executing it.
            run(ssh, "node --check < " + shlex.quote(stage_paths[0]))
            for path in (REMOTE_ADDON, REMOTE_INDEX):
                if remote_sha(sftp, path) != before_hashes[path]:
                    raise RuntimeError("LIVE_CAS_DRIFT:" + path)

            for path, stage_path in zip((REMOTE_ADDON, REMOTE_INDEX), stage_paths):
                temp_target = path + ".appearance-preview-v4-" + stamp + ".next"
                run(ssh, "cp -p -- " + shlex.quote(stage_path) + " " + shlex.quote(temp_target))
                run(ssh, "mv -f -- " + shlex.quote(temp_target) + " " + shlex.quote(path))
                installed.append(path)
                if remote_sha(sftp, path) != candidate_hashes[path]:
                    raise RuntimeError("INSTALL_HASH_MISMATCH:" + path)

            after_hashes = {path: remote_sha(sftp, path) for path in (REMOTE_ADDON, REMOTE_INDEX)}
            if after_hashes != candidate_hashes:
                raise RuntimeError("REMOTE_READBACK_HASH_MISMATCH")
            evidence["afterHashes"] = after_hashes
            evidence["backupFiles"] = backup_paths

        served = {}
        for path in (REMOTE_ADDON, REMOTE_INDEX):
            url_path = path.removeprefix("/linhhoasu/webgame/game")
            url = "http://127.0.0.1:81" + url_path + "?verify=appearance_preview_v4_" + stamp
            served_hash = run(
                ssh,
                "curl -fsS --max-time 15 " + shlex.quote(url) + " | sha256sum | cut -d' ' -f1",
            ).strip()
            served[path] = {"url": url, "sha256": served_hash, "matches": served_hash == candidate_hashes[path]}
            if served_hash != candidate_hashes[path]:
                raise RuntimeError("HTTP_READBACK_HASH_MISMATCH:" + path)
        evidence["served"] = served
        after_pm2 = pm2_game_state(ssh)
        if after_pm2 != before_pm2:
            raise RuntimeError("PROCESS_STATE_CHANGED_UNEXPECTEDLY")
        evidence["afterPm2"] = after_pm2
        evidence["status"] = "DEPLOYED"
        cleanup_stage(ssh, stage, stage_paths)
    except Exception as error:
        evidence["error"] = str(error)
        evidence["installedBeforeFailure"] = installed[:]
        if installed:
            try:
                with ssh.open_sftp() as sftp:
                    for path in reversed(installed):
                        current = remote_sha(sftp, path)
                        if current not in (candidate_hashes.get(path), before_hashes.get(path)):
                            raise RuntimeError("ROLLBACK_DRIFT:" + path)
                        temp_target = path + ".appearance-preview-v4-rollback-" + stamp + ".next"
                        run(ssh, "cp -p -- " + shlex.quote(backup_paths[path]) + " " + shlex.quote(temp_target))
                        run(ssh, "mv -f -- " + shlex.quote(temp_target) + " " + shlex.quote(path))
                        if remote_sha(sftp, path) != before_hashes[path]:
                            raise RuntimeError("ROLLBACK_HASH_MISMATCH:" + path)
                evidence["status"] = "ROLLED_BACK"
            except Exception as rollback_error:
                evidence["status"] = "ROLLBACK_NEEDS_MANUAL_CHECK"
                evidence["rollbackError"] = str(rollback_error)
        else:
            evidence["status"] = "ABORTED_BEFORE_INSTALL"
        raise
    finally:
        try:
            cleanup_stage(ssh, stage, stage_paths)
        except Exception:
            pass
        evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        ssh.close()
    print(json.dumps(evidence, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
