"""CAS/backup/static-only deployment of the narrow attribute-unit formatter fix."""
from __future__ import annotations

import hashlib
import json
import shlex
import time
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / "linhhoasu" / "webgame" / "game"
LOCAL_BUNDLE = GAME / "js" / "main.min_drop100.js"
LOCAL_INDEX = GAME / "index.html"
CANDIDATE_DIR = ROOT / "_ai_workbench" / "temp" / "attr_format_fix_20260921"
CANDIDATE_BUNDLE = CANDIDATE_DIR / "main.min_drop100.js"
CANDIDATE_INDEX = CANDIDATE_DIR / "index.html"
MANIFEST = CANDIDATE_DIR / "manifest.json"
LOCAL_BACKUP = ROOT / "_ai_workbench" / "backups" / "attr_units_fix_20260921" / "local"
EVIDENCE = CANDIDATE_DIR / "release.json"

REMOTE_BUNDLE = "/linhhoasu/webgame/game/js/main.min_drop100.js"
REMOTE_INDEX = "/linhhoasu/webgame/game/index.html"
REMOTE_BACKUP = "/linhhoasu/_ai_workbench/backups/attr_units_fix_20260921"
REMOTE_STAGE_ROOT = "/linhhoasu/_ai_workbench/temp/attr_units_fix_20260921"
NEW_KEY = "20260921_attr_units_v1"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_sftp(sftp, path: str) -> bytes:
    with sftp.open(path, "rb") as handle:
        return handle.read()


def write_sftp(sftp, path: str, data: bytes, attrs) -> None:
    with sftp.open(path, "wb") as handle:
        handle.write(data)
    sftp.chmod(path, attrs.st_mode & 0o777)
    try:
        sftp.chown(path, attrs.st_uid, attrs.st_gid)
    except OSError:
        # Ownership is best effort on hosts where SFTP disallows chown; mode
        # and byte/CAS checks remain mandatory.
        pass


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    local_before = {LOCAL_BUNDLE: LOCAL_BUNDLE.read_bytes(), LOCAL_INDEX: LOCAL_INDEX.read_bytes()}
    candidate = {CANDIDATE_BUNDLE: CANDIDATE_BUNDLE.read_bytes(), CANDIDATE_INDEX: CANDIDATE_INDEX.read_bytes()}
    assert sha(local_before[LOCAL_BUNDLE]) == manifest["sourceBundle"]["sha256"], "LOCAL_BUNDLE_BASELINE_DRIFT"
    assert sha(candidate[CANDIDATE_BUNDLE]) == manifest["candidateBundle"]["sha256"], "CANDIDATE_BUNDLE_HASH_MISMATCH"
    assert sha(local_before[LOCAL_INDEX]) == manifest["sourceIndex"]["sha256"], "LOCAL_INDEX_BASELINE_DRIFT"
    assert sha(candidate[CANDIDATE_INDEX]) == manifest["candidateIndex"]["sha256"], "CANDIDATE_INDEX_HASH_MISMATCH"
    assert NEW_KEY in candidate[CANDIDATE_INDEX].decode("utf-8")

    ssh = connect()
    try:
        with ssh.open_sftp() as sftp:
            remote_paths = {REMOTE_BUNDLE: LOCAL_BUNDLE, REMOTE_INDEX: LOCAL_INDEX}
            remote_before = {remote: read_sftp(sftp, remote) for remote in remote_paths}
            remote_attrs = {remote: sftp.stat(remote) for remote in remote_paths}
            if remote_before[REMOTE_BUNDLE] != local_before[LOCAL_BUNDLE]:
                raise RuntimeError("REMOTE_BUNDLE_CAS_BASELINE_DRIFT:" + sha(remote_before[REMOTE_BUNDLE]))
            if remote_before[REMOTE_INDEX] != local_before[LOCAL_INDEX]:
                raise RuntimeError("REMOTE_INDEX_CAS_BASELINE_DRIFT:" + sha(remote_before[REMOTE_INDEX]))

            # Create/verify an exact remote backup without overwriting a prior
            # backup from this release.
            try:
                sftp.stat(REMOTE_BACKUP)
                backup_exists = True
            except FileNotFoundError:
                backup_exists = False
            if not backup_exists:
                run(ssh, "install -d -m 700 " + shlex.quote(REMOTE_BACKUP))
            for remote, data in remote_before.items():
                backup_path = REMOTE_BACKUP + "/" + Path(remote).name + ".before"
                try:
                    old_backup = read_sftp(sftp, backup_path)
                except FileNotFoundError:
                    if backup_exists:
                        raise RuntimeError("REMOTE_BACKUP_MISSING:" + backup_path)
                    write_sftp(sftp, backup_path, data, remote_attrs[remote])
                    sftp.chmod(backup_path, 0o600)
                else:
                    if old_backup != data:
                        raise RuntimeError("REMOTE_BACKUP_DRIFT:" + backup_path)

            # CAS immediately before stage/publish.
            for remote, data in remote_before.items():
                if read_sftp(sftp, remote) != data:
                    raise RuntimeError("REMOTE_CAS_DRIFT:" + remote)

            stage = REMOTE_STAGE_ROOT + "_" + str(int(time.time()))
            run(ssh, "install -d -m 700 " + shlex.quote(stage))
            stage_bundle = stage + "/main.min_drop100.js"
            stage_index = stage + "/index.html"
            write_sftp(sftp, stage_bundle, candidate[CANDIDATE_BUNDLE], remote_attrs[REMOTE_BUNDLE])
            write_sftp(sftp, stage_index, candidate[CANDIDATE_INDEX], remote_attrs[REMOTE_INDEX])
            run(ssh, "node --check " + shlex.quote(stage_bundle))
            # Validate the exact formatter markers on the staged bytes.
            check = run(ssh, "node -e " + shlex.quote(
                "const fs=require('fs');const s=fs.readFileSync(process.argv[1],'utf8');"
                "if(!s.includes('1e9<=e?(e/1e9)')||!s.includes('1e6<=e?(e/1e6)'))process.exit(2);"
                "if(s.includes('1e8<=e?(e/1e8)'))process.exit(3);console.log('ATTR_UNITS_STAGE_PASS');"
            ) + " " + shlex.quote(stage_bundle)).strip()
            if check != "ATTR_UNITS_STAGE_PASS":
                raise RuntimeError("STAGE_MARKER_CHECK_FAILED:" + check)
            sftp.posix_rename(stage_bundle, REMOTE_BUNDLE)
            sftp.posix_rename(stage_index, REMOTE_INDEX)

        # Verify served bytes and cache key before touching the local checkout.
        served_bundle_text = run(ssh, "curl -fsS " + shlex.quote("http://127.0.0.1:81/js/main.min_drop100.js?v=" + NEW_KEY))
        served_index = run(ssh, "curl -fsS http://127.0.0.1:81/index.html")
        served_hash = sha(served_bundle_text.encode("utf-8"))
        if served_hash != sha(candidate[CANDIDATE_BUNDLE]):
            raise RuntimeError("SERVED_BUNDLE_HASH_MISMATCH:" + served_hash)
        if NEW_KEY not in served_index or "20260920_gmt7_sync_v1" in served_index:
            raise RuntimeError("SERVED_INDEX_CACHE_KEY_CHECK_FAILED")
        served_marker = "ATTR_UNITS_SERVE_PASS" if "1e9<=e?(e/1e9)" in served_bundle_text and "1e8<=e?(e/1e8)" not in served_bundle_text else ""
        if not served_marker:
            raise RuntimeError("SERVED_FORMATTER_MARKER_CHECK_FAILED")

        # Preserve an exact local rollback copy, then align the checkout with
        # the bytes that were successfully served.
        if LOCAL_BACKUP.exists():
            for path, data in local_before.items():
                backup_path = LOCAL_BACKUP / path.name
                if not backup_path.exists() or backup_path.read_bytes() != data:
                    raise RuntimeError("LOCAL_BACKUP_DRIFT:" + str(backup_path))
        else:
            LOCAL_BACKUP.mkdir(parents=True, exist_ok=False)
            for path, data in local_before.items():
                (LOCAL_BACKUP / path.name).write_bytes(data)
        LOCAL_BUNDLE.write_bytes(candidate[CANDIDATE_BUNDLE])
        LOCAL_INDEX.write_bytes(candidate[CANDIDATE_INDEX])

        release = {
            "result": "DEPLOYED_STATIC_ONLY",
            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "productionWrites": 0,
            "pm2Restart": False,
            "remote": {"bundle": REMOTE_BUNDLE, "index": REMOTE_INDEX},
            "before": {k: {"sha256": sha(v), "bytes": len(v)} for k, v in remote_before.items()},
            "after": {"candidateBundleSha256": sha(candidate[CANDIDATE_BUNDLE]), "candidateIndexSha256": sha(candidate[CANDIDATE_INDEX]), "servedBundleSha256": served_hash, "servedMarker": served_marker, "cacheKey": NEW_KEY},
            "remoteBackup": REMOTE_BACKUP,
            "localBackup": str(LOCAL_BACKUP),
            "stageCheck": check,
            "readiness": "static-only; PM2 not restarted",
        }
        EVIDENCE.write_text(json.dumps(release, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(release, ensure_ascii=False, indent=2))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
