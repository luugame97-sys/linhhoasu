"""Rollback only the deployed appearance-preview addon from v4 to v3.

The rollback is static and CAS-protected: it changes the preview addon and its
index cache marker only. It does not restart PM2 or touch player/server data.
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
LOCAL_V3 = WB / "backups" / "fashion_dye_renderer_20260927" / "lhs-appearance-preview-v1.js"
REMOTE_ADDON = "/linhhoasu/webgame/game/js/lhs-appearance-preview-v1.js"
REMOTE_INDEX = "/linhhoasu/webgame/game/index.html"
CURRENT_ADDON_SHA = "982bf258e833f274b15ddcbf9821871eca744ac74b5e34a251c15feb21a94b4e"
V3_ADDON_SHA = "f40f8c627ba7551e7adf7d3e1b0c552d6ff00026534016d6f8f07f2449776cf9"
OLD_MARKER = b"js/lhs-appearance-preview-v1.js?v=20260927_appearance_preview_v4"
NEW_MARKER = b"js/lhs-appearance-preview-v1.js?v=20260927_appearance_preview_v3"
NODES = [("lhs-s1001", 8080), ("lhs-s1002", 8083), ("lhs-s1003", 8084),
         ("lhs-s1004", 8085), ("lhs-s1005", 8086), ("lhs-s1006", 8087)]


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


def ready(ssh, port: int) -> str:
    command = (
        "last=000; for i in $(seq 1 3); do "
        "last=$(curl -sS --connect-timeout 3 --max-time 10 -o /dev/null "
        "-w '%{http_code}' " + shlex.quote(f"http://127.0.0.1:{port}/ready") +
        " || true); if [ \"$last\" = 200 ]; then echo 200; exit 0; fi; sleep 1; "
        "done; echo \"$last\""
    )
    return run(ssh, command).strip()


def main() -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/appearance_preview_rollback_20260929_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/appearance_preview_rollback_20260929_{stamp}"
    evidence_path = WB / "temp" / "appearance_preview_rollback_20260929" / f"rollback_{stamp}.json"
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    addon = LOCAL_V3.read_bytes()
    if sha(addon) != V3_ADDON_SHA:
        raise RuntimeError("LOCAL_V3_HASH_MISMATCH")
    evidence = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "PREPARING",
        "scope": [REMOTE_ADDON, REMOTE_INDEX],
        "from": "20260927_appearance_preview_v4",
        "to": "20260927_appearance_preview_v3",
        "backup": backup,
        "stage": stage,
        "productionWrites": 0,
        "playerWrites": 0,
        "dbWrites": 0,
        "processRestarts": 0,
    }
    ssh = connect()
    try:
        before_ready = {str(port): ready(ssh, port) for _name, port in NODES}
        if any(value != "200" for value in before_ready.values()):
            raise RuntimeError("READY_NOT_200_BEFORE_ROLLBACK:" + json.dumps(before_ready))
        evidence["beforeReady"] = before_ready
        with ssh.open_sftp() as sftp:
            current_addon = remote_bytes(sftp, REMOTE_ADDON)
            current_index = remote_bytes(sftp, REMOTE_INDEX)
            if current_addon is None or current_index is None:
                raise RuntimeError("REMOTE_REQUIRED_FILE_MISSING")
            before = {REMOTE_ADDON: sha(current_addon), REMOTE_INDEX: sha(current_index)}
            if before[REMOTE_ADDON] != CURRENT_ADDON_SHA:
                raise RuntimeError("LIVE_ADDON_BASELINE_DRIFT:" + json.dumps(before, sort_keys=True))
            if current_index.count(OLD_MARKER) != 1 or current_index.count(NEW_MARKER) != 0:
                raise RuntimeError("INDEX_V4_MARKER_ANCHOR_MISMATCH")
            candidate_index = current_index.replace(OLD_MARKER, NEW_MARKER, 1)
            candidate = {REMOTE_ADDON: addon, REMOTE_INDEX: candidate_index}
            candidate_hashes = {path: sha(data) for path, data in candidate.items()}
            evidence["files"] = {
                REMOTE_ADDON: {"before": before[REMOTE_ADDON], "rollback": candidate_hashes[REMOTE_ADDON], "bytes": len(addon)},
                REMOTE_INDEX: {"before": before[REMOTE_INDEX], "rollback": candidate_hashes[REMOTE_INDEX], "bytes": len(candidate_index), "patch": "v4_to_v3_marker_only"},
            }
            run(ssh, "install -d -m 700 " + shlex.quote(backup) + " " + shlex.quote(stage))
            stage_paths = []
            backup_paths = {}
            for index, path in enumerate((REMOTE_ADDON, REMOTE_INDEX), 1):
                safe = f"{index:02d}_{path.strip('/').replace('/', '__')}"
                backup_path = backup + "/" + safe + ".before"
                stage_path = stage + "/" + safe + ".candidate"
                run(ssh, "cp -p -- " + shlex.quote(path) + " " + shlex.quote(backup_path))
                if remote_sha(sftp, backup_path) != before[path]:
                    raise RuntimeError("BACKUP_HASH_MISMATCH:" + path)
                write_remote(sftp, stage_path, candidate[path])
                if remote_sha(sftp, stage_path) != candidate_hashes[path]:
                    raise RuntimeError("STAGE_HASH_MISMATCH:" + path)
                backup_paths[path] = backup_path
                stage_paths.append(stage_path)
            run(ssh, "node --check < " + shlex.quote(stage_paths[0]))
            for path in (REMOTE_ADDON, REMOTE_INDEX):
                if remote_sha(sftp, path) != before[path]:
                    raise RuntimeError("LIVE_CAS_DRIFT:" + path)
            for path, stage_path in zip((REMOTE_ADDON, REMOTE_INDEX), stage_paths):
                temp_target = path + ".appearance-preview-rollback-" + stamp + ".next"
                run(ssh, "cp -p -- " + shlex.quote(stage_path) + " " + shlex.quote(temp_target))
                run(ssh, "mv -f -- " + shlex.quote(temp_target) + " " + shlex.quote(path))
                if remote_sha(sftp, path) != candidate_hashes[path]:
                    raise RuntimeError("INSTALL_HASH_MISMATCH:" + path)
            after = {path: remote_sha(sftp, path) for path in (REMOTE_ADDON, REMOTE_INDEX)}
            if after != candidate_hashes:
                raise RuntimeError("REMOTE_READBACK_HASH_MISMATCH")
            evidence["afterHashes"] = after
            evidence["backupFiles"] = backup_paths
        served = {}
        for path in (REMOTE_ADDON, REMOTE_INDEX):
            url_path = path.removeprefix("/linhhoasu/webgame/game")
            url = "http://127.0.0.1:81" + url_path + "?verify=appearance_preview_rollback_" + stamp
            served_hash = run(ssh, "curl -fsS --max-time 15 " + shlex.quote(url) + " | sha256sum | cut -d' ' -f1").strip()
            served[path] = {"url": url, "sha256": served_hash, "matches": served_hash == candidate_hashes[path]}
            if served_hash != candidate_hashes[path]:
                raise RuntimeError("HTTP_READBACK_HASH_MISMATCH:" + path)
        evidence["served"] = served
        evidence["status"] = "ROLLED_BACK"
        run(ssh, "rm -f -- " + " ".join(shlex.quote(p) for p in stage_paths))
        run(ssh, "rmdir -- " + shlex.quote(stage))
    except Exception:
        evidence["status"] = "FAILED"
        raise
    finally:
        evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        ssh.close()
    print(json.dumps(evidence, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
