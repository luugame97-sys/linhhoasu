"""Deploy the verified fashion preview client release to the VPS.

Static client-only rollout.  The script never touches Mongo/Redis/player data
and does not restart game processes; it backs up the exact live bytes, stages
the four files, performs a last hash/CAS check, then swaps each file with an
atomic same-filesystem rename.
"""
from __future__ import annotations

import hashlib
import json
import posixpath
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
LOCAL_FILES = {
    "/linhhoasu/webgame/game/js/lhs-appearance-preview-v1.js": GAME / "js" / "lhs-appearance-preview-v1.js",
    "/linhhoasu/webgame/game/js/lhs-fashion-box-v1.js": GAME / "js" / "lhs-fashion-box-v1.js",
    "/linhhoasu/webgame/game/js/lhs-fashion-content-v1.js": GAME / "js" / "lhs-fashion-content-v1.js",
    "/linhhoasu/webgame/game/index.html": GAME / "index.html",
}
VERSIONS = {
    "20260927_appearance_preview_v2",
    "20260927_fashion_box_v4",
    "20260927_fashion_content_v3",
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


def remote_sha(sftp, path: str) -> str | None:
    try:
        with sftp.open(path, "rb") as handle:
            return sha(handle.read())
    except FileNotFoundError:
        return None


def remote_bytes(sftp, path: str) -> bytes | None:
    try:
        with sftp.open(path, "rb") as handle:
            return handle.read()
    except FileNotFoundError:
        return None


def write_remote(sftp, path: str, data: bytes, mode: int = 0o644) -> None:
    with sftp.open(path, "wb") as handle:
        handle.write(data)
    sftp.chmod(path, mode)


def patch_index(remote: bytes) -> bytes:
    replacements = {
        b'"js/lhs-fashion-content-v1.js?v=20260923_fashion_content_v2"':
            b'"js/lhs-fashion-content-v1.js?v=20260927_fashion_content_v3"',
        b'"js/lhs-fashion-box-v1.js?v=20260909_fashion_box_v3"':
            b'"js/lhs-fashion-box-v1.js?v=20260927_fashion_box_v4"',
        b'"js/lhs-appearance-preview-v1.js?v=20260926_appearance_preview_v1"':
            b'"js/lhs-appearance-preview-v1.js?v=20260927_appearance_preview_v2"',
    }
    candidate = remote
    for old, new in replacements.items():
        if candidate.count(old) != 1:
            raise RuntimeError("INDEX_CACHE_ANCHOR_COUNT:" + old.decode())
        candidate = candidate.replace(old, new, 1)
    for version in VERSIONS:
        if version.encode() not in candidate:
            raise RuntimeError("INDEX_VERSION_MISSING:" + version)
    return candidate


def ready(ssh, port: int) -> str:
    command = (
        "last=000; for i in $(seq 1 30); do "
        "last=$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "
        + shlex.quote(f"http://127.0.0.1:{port}/ready")
        + " || true); if [ \"$last\" = 200 ]; then echo 200; exit 0; fi; sleep 1; "
        "done; echo \"$last\"; exit 1"
    )
    return run(ssh, command).strip()


def main() -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/fashion_preview_fix_20260927_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/fashion_preview_fix_20260927_{stamp}"
    evidence_path = WB / "temp" / "fashion_preview_fix_20260927" / f"deploy_{stamp}.json"
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    local_data = {path: file.read_bytes() for path, file in LOCAL_FILES.items()}
    local_hashes = {path: sha(data) for path, data in local_data.items()}
    evidence = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "PREPARING",
        "backup": backup,
        "stage": stage,
        "files": {},
        "restarts": [],
        "productionWrites": 0,
        "playerWrites": 0,
        "dbWrites": 0,
    }
    ssh = connect()
    installed: list[str] = []
    try:
        # Readiness is a guard only.  No PM2 restart is needed for static files.
        before_ready = {str(port): ready(ssh, port) for _name, port in NODES}
        if any(value != "200" for value in before_ready.values()):
            raise RuntimeError("READY_NOT_200_BEFORE_DEPLOY:" + json.dumps(before_ready))
        evidence["beforeReady"] = before_ready

        with ssh.open_sftp() as sftp:
            remote_data = {path: remote_bytes(sftp, path) for path in LOCAL_FILES}
            if any(data is None for data in remote_data.values()):
                raise RuntimeError("REMOTE_REQUIRED_FILE_MISSING")
            before_hashes = {path: sha(data) for path, data in remote_data.items() if data is not None}
            current_index = remote_data["/linhhoasu/webgame/game/index.html"]
            assert current_index is not None
            # Do not overwrite a completed release.  A read-back can be used
            # safely if the command is retried after a network interruption.
            if all(version.encode() in current_index for version in VERSIONS):
                raise RuntimeError("RELEASE_ALREADY_PRESENT")
            candidate_data = dict(local_data)
            candidate_data["/linhhoasu/webgame/game/index.html"] = patch_index(current_index)
            candidate_hashes = {path: sha(data) for path, data in candidate_data.items()}
            evidence["files"] = {
                path: {
                    "before": before_hashes[path],
                    "candidate": candidate_hashes[path],
                    "bytes": len(candidate_data[path]),
                    "local": local_hashes[path],
                }
                for path in LOCAL_FILES
            }

            run(ssh, "install -d -m 700 " + shlex.quote(backup))
            run(ssh, "install -d -m 700 " + shlex.quote(stage))
            backup_paths = {}
            stage_paths = {}
            for index, path in enumerate(LOCAL_FILES, 1):
                safe = f"{index:02d}_{path.strip('/').replace('/', '__')}"
                backup_path = backup + "/" + safe + ".before"
                run(ssh, "cp -p -- " + shlex.quote(path) + " " + shlex.quote(backup_path))
                if remote_sha(sftp, backup_path) != before_hashes[path]:
                    raise RuntimeError("BACKUP_HASH_MISMATCH:" + path)
                backup_paths[path] = backup_path
                stage_path = stage + "/" + safe + ".candidate"
                write_remote(sftp, stage_path, candidate_data[path])
                if remote_sha(sftp, stage_path) != candidate_hashes[path]:
                    raise RuntimeError("STAGE_HASH_MISMATCH:" + path)
                stage_paths[path] = stage_path

            # Last CAS immediately before any live mutation.
            for path in LOCAL_FILES:
                if remote_sha(sftp, path) != before_hashes[path]:
                    raise RuntimeError("LIVE_CAS_DRIFT:" + path)

            for path in LOCAL_FILES:
                temp_target = path + ".fashion-preview-" + stamp + ".next"
                run(ssh, "cp -p -- " + shlex.quote(stage_paths[path]) + " " + shlex.quote(temp_target))
                run(ssh, "mv -f -- " + shlex.quote(temp_target) + " " + shlex.quote(path))
                if remote_sha(sftp, path) != candidate_hashes[path]:
                    raise RuntimeError("INSTALL_HASH_MISMATCH:" + path)
                installed.append(path)

            after_hashes = {path: remote_sha(sftp, path) for path in LOCAL_FILES}
        evidence["afterHashes"] = after_hashes
        if after_hashes != candidate_hashes:
            raise RuntimeError("REMOTE_READBACK_HASH_MISMATCH")
        evidence["backupFiles"] = backup_paths

        # Verify bytes served through the local nginx vhost and then clean only
        # this release's staging directory.  The static server may cache by URL;
        # the updated query keys are checked in the index response itself.
        served = {}
        for path in LOCAL_FILES:
            url_path = path.removeprefix("/linhhoasu/webgame/game")
            url = "http://127.0.0.1:81" + url_path
            served_hash = run(ssh, "curl -fsS --max-time 15 " + shlex.quote(url) + " | sha256sum | cut -d' ' -f1").strip()
            served[path] = {"url": url, "sha256": served_hash, "matches": served_hash == candidate_hashes[path]}
            if served_hash != candidate_hashes[path]:
                raise RuntimeError("HTTP_READBACK_HASH_MISMATCH:" + path)
        evidence["served"] = served
        evidence["status"] = "DEPLOYED"
        run(ssh, "rm -rf -- " + shlex.quote(stage))
    except Exception:
        evidence["status"] = "FAILED"
        evidence["installedBeforeFailure"] = installed
        raise
    finally:
        evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        ssh.close()
    print(json.dumps(evidence, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
