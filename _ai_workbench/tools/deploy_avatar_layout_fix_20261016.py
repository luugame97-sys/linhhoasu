"""Deploy the six-column avatar-grid repair with CAS, backup, and HTTP read-back."""
from __future__ import annotations

import hashlib
import json
import posixpath
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

WB = Path(__file__).resolve().parents[1]
ROOT = WB.parent
sys.path.insert(0, str(WB / "tools"))
from skin_incident_remote import connect, run  # noqa: E402

REMOTE_ROOT = "/linhhoasu"
REMOTE_ADDON = REMOTE_ROOT + "/webgame/game/js/lhs-avatar-layout-fix-v1.js"
REMOTE_INDEX = REMOTE_ROOT + "/webgame/game/index.html"
LOCAL_ADDON = ROOT / "linhhoasu/webgame/game/js/lhs-avatar-layout-fix-v1.js"
OLD_INDEX_LINE = b'\t\t"js/lhs-avatar-default-fix-v1.js?v=20260922_avatar_default_fix_v1",'
NEW_INDEX_LINE = OLD_INDEX_LINE + b'\n\t\t"js/lhs-avatar-layout-fix-v1.js?v=20261016_avatar_layout_fix_v1",'
EXPECTED_DEFAULT_ADDON = "30370f47e37adfaf50e5171526b50a926c15e2acf014baa0d850dee36783da8d"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_remote(sftp, path: str) -> bytes:
    with sftp.open(path, "rb") as handle:
        return handle.read()


def main() -> None:
    local_addon = LOCAL_ADDON.read_bytes()
    if b"20261016_avatar_layout_fix_v1" not in local_addon:
        raise RuntimeError("LOCAL_MARKER_MISSING")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"{REMOTE_ROOT}/_ai_workbench/backups/avatar_layout_fix_20261016_{stamp}"
    stage = f"{REMOTE_ROOT}/_ai_workbench/temp/avatar_layout_fix_20261016_{stamp}"
    staged_addon = stage + "/lhs-avatar-layout-fix-v1.js"
    staged_index = stage + "/index.html"
    report_path = WB / "temp/avatar_layout_fix_20261016" / f"deploy_{stamp}.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "status": "STARTED",
        "scope": [REMOTE_ADDON, REMOTE_INDEX],
        "backup": backup,
        "stage": stage,
        "playerWrites": 0,
        "productionWrites": 0,
        "processRestarts": 0,
    }

    ssh = connect()
    swapped = False
    try:
        with ssh.open_sftp() as sftp:
            try:
                before_default = read_remote(
                    sftp, REMOTE_ROOT + "/webgame/game/js/lhs-avatar-default-fix-v1.js"
                )
            except FileNotFoundError as exc:
                raise RuntimeError("REMOTE_DEFAULT_ADDON_MISSING") from exc
            if sha(before_default) != EXPECTED_DEFAULT_ADDON:
                raise RuntimeError("DEFAULT_ADDON_CAS_DRIFT:" + sha(before_default))
            try:
                existing_layout = read_remote(sftp, REMOTE_ADDON)
            except FileNotFoundError:
                existing_layout = None
            if existing_layout is not None:
                raise RuntimeError("LAYOUT_ADDON_ALREADY_EXISTS:" + sha(existing_layout))
            before_index = read_remote(sftp, REMOTE_INDEX)
            if before_index.count(OLD_INDEX_LINE) != 1:
                raise RuntimeError("INDEX_ANCHOR_MISMATCH")
            if b"lhs-avatar-layout-fix-v1.js?v=20261016_avatar_layout_fix_v1" in before_index:
                raise RuntimeError("INDEX_MARKER_ALREADY_PRESENT")
            candidate_index = before_index.replace(OLD_INDEX_LINE, NEW_INDEX_LINE, 1)
            report["files"] = {
                REMOTE_ADDON: {"before": None, "after": sha(local_addon), "bytes": len(local_addon)},
                REMOTE_INDEX: {"before": sha(before_index), "after": sha(candidate_index), "bytes": len(candidate_index)},
            }

            q = shlex.quote
            run(ssh, "install -d -m 700 " + q(backup) + " " + q(stage))
            backup_index = backup + "/index.html.before"
            run(ssh, "cp -p -- " + q(REMOTE_ROOT + "/webgame/game/js/lhs-avatar-default-fix-v1.js") + " " + q(backup + "/lhs-avatar-default-fix-v1.js.reference"))
            run(ssh, "cp -p -- " + q(REMOTE_INDEX) + " " + q(backup_index))
            with sftp.open(backup_index, "rb") as handle:
                if sha(handle.read()) != sha(before_index):
                    raise RuntimeError("BACKUP_INDEX_HASH_MISMATCH")
            with sftp.open(staged_addon, "wb") as handle:
                handle.write(local_addon)
            with sftp.open(staged_index, "wb") as handle:
                handle.write(candidate_index)
            sftp.chmod(staged_addon, 0o644)
            sftp.chmod(staged_index, 0o644)
            if sha(read_remote(sftp, staged_addon)) != sha(local_addon):
                raise RuntimeError("STAGE_ADDON_HASH_MISMATCH")
            if sha(read_remote(sftp, staged_index)) != sha(candidate_index):
                raise RuntimeError("STAGE_INDEX_HASH_MISMATCH")
            run(ssh, "node --check " + q(staged_addon))
            if sha(read_remote(sftp, REMOTE_INDEX)) != sha(before_index):
                raise RuntimeError("LIVE_INDEX_CAS_DRIFT")

            run(ssh, "mv -f -- " + q(staged_addon) + " " + q(REMOTE_ADDON))
            run(ssh, "mv -f -- " + q(staged_index) + " " + q(REMOTE_INDEX))
            swapped = True
            if sha(read_remote(sftp, REMOTE_ADDON)) != sha(local_addon):
                raise RuntimeError("LIVE_ADDON_HASH_MISMATCH")
            if sha(read_remote(sftp, REMOTE_INDEX)) != sha(candidate_index):
                raise RuntimeError("LIVE_INDEX_HASH_MISMATCH")
            report["afterHashes"] = {REMOTE_ADDON: sha(local_addon), REMOTE_INDEX: sha(candidate_index)}
            report["backupFiles"] = [backup_index, backup + "/lhs-avatar-default-fix-v1.js.reference"]

        index_body = run(ssh, "curl -fsS --max-time 15 http://127.0.0.1:81/")
        addon_body = run(ssh, "curl -fsS --max-time 15 'http://127.0.0.1:81/js/lhs-avatar-layout-fix-v1.js?verify=20261016'")
        if "lhs-avatar-layout-fix-v1.js?v=20261016_avatar_layout_fix_v1" not in index_body:
            raise RuntimeError("HTTP_INDEX_MARKER_MISSING")
        if sha(addon_body.encode()) != sha(local_addon):
            raise RuntimeError("HTTP_ADDON_HASH_MISMATCH")
        report["http"] = {"index": 200, "addon": 200, "addonSha256": sha(addon_body.encode())}
        report["status"] = "DEPLOYED_HTTP_VERIFIED"
    except Exception:
        report["status"] = "FAILED"
        if swapped:
            try:
                with ssh.open_sftp() as sftp:
                    rollback_path = stage + "/rollback-index.html"
                    with sftp.open(backup + "/index.html.before", "rb") as source:
                        previous_index = source.read()
                    with sftp.open(rollback_path, "wb") as target:
                        target.write(previous_index)
                    sftp.chmod(rollback_path, 0o644)
                    run(ssh, "mv -f -- " + shlex.quote(rollback_path) + " " + shlex.quote(REMOTE_INDEX))
                    run(ssh, "rm -f -- " + shlex.quote(REMOTE_ADDON))
                report["rollback"] = "PASS"
            except Exception as rollback_error:
                report["rollback"] = "FAILED:" + str(rollback_error)
        raise
    finally:
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        ssh.close()

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
