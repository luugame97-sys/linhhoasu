"""Remove the custom appearance-preview addon from the runtime manifest.

The original addon is moved into a timestamped backup; only index.html remains
as a live client mutation. No PM2, server logic, or player data is touched.
"""
from __future__ import annotations
import hashlib, json, shlex, sys
from datetime import datetime, timezone
from pathlib import Path
sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / "tools"))
from snapshot_web_multiserver_20260906 import connect, run  # noqa: E402

INDEX = "/linhhoasu/webgame/game/index.html"
ADDON = "/linhhoasu/webgame/game/js/lhs-appearance-preview-v1.js"
OLD = b'\t\t"js/lhs-appearance-preview-v1.js?v=20260929_appearance_preview_cn_v5",\r\n'
OLD_LF = b'\t\t"js/lhs-appearance-preview-v1.js?v=20260929_appearance_preview_cn_v5",\n'
EXPECTED_ADDON = "2accef6b5754422a76a7acde67c76f9df83cf1bf1805ab151f81ea8c94784431"
EXPECTED_INDEX = "d7908da88ece27e5ab805e19d69fdc8a88ea7f09beabe4848d0191b497806ddd"

def sha(data: bytes) -> str: return hashlib.sha256(data).hexdigest()
def rb(sftp, path):
    try:
        with sftp.open(path, "rb") as h: return h.read()
    except FileNotFoundError: return None
def rsha(sftp, path):
    data = rb(sftp, path); return sha(data) if data is not None else None
def wr(sftp, path, data):
    with sftp.open(path, "wb") as h: h.write(data)
    sftp.chmod(path, 0o644)

def main():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/appearance_preview_removed_20260929_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/appearance_preview_removed_20260929_{stamp}"
    evidence_path = WB / "temp" / "appearance_preview_removed_20260929" / f"remove_{stamp}.json"
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    ssh = connect()
    evidence = {"generatedAt": datetime.now(timezone.utc).isoformat(), "status": "PREPARING", "scope": [INDEX, ADDON], "productionWrites": 0, "playerWrites": 0, "dbWrites": 0, "processRestarts": 0, "backup": backup, "stage": stage}
    try:
        with ssh.open_sftp() as sftp:
            index0, addon0 = rb(sftp, INDEX), rb(sftp, ADDON)
            if index0 is None or addon0 is None: raise RuntimeError("REMOTE_REQUIRED_FILE_MISSING")
            before = {INDEX: sha(index0), ADDON: sha(addon0)}
            if before != {INDEX: EXPECTED_INDEX, ADDON: EXPECTED_ADDON}: raise RuntimeError("LIVE_BASELINE_DRIFT:" + json.dumps(before, sort_keys=True))
            marker = OLD if OLD in index0 else OLD_LF
            if index0.count(marker) != 1: raise RuntimeError("INDEX_PREVIEW_MARKER_MISMATCH")
            candidate = index0.replace(marker, b"", 1)
            candidate_hash = sha(candidate)
            run(ssh, "install -d -m 700 " + shlex.quote(backup) + " " + shlex.quote(stage))
            bp_index = backup + "/index.html.before"
            bp_addon = backup + "/lhs-appearance-preview-v1.js.removed"
            sp_index = stage + "/index.html.candidate"
            run(ssh, "cp -p -- " + shlex.quote(INDEX) + " " + shlex.quote(bp_index))
            if rsha(sftp, bp_index) != before[INDEX]: raise RuntimeError("INDEX_BACKUP_HASH_MISMATCH")
            run(ssh, "cp -p -- " + shlex.quote(ADDON) + " " + shlex.quote(bp_addon))
            if rsha(sftp, bp_addon) != before[ADDON]: raise RuntimeError("ADDON_BACKUP_HASH_MISMATCH")
            wr(sftp, sp_index, candidate)
            if rsha(sftp, sp_index) != candidate_hash: raise RuntimeError("INDEX_STAGE_HASH_MISMATCH")
            run(ssh, "node --check " + shlex.quote(ADDON))
            if rsha(sftp, INDEX) != before[INDEX] or rsha(sftp, ADDON) != before[ADDON]: raise RuntimeError("LIVE_CAS_DRIFT")
            tmp = INDEX + ".appearance-preview-removed-" + stamp + ".next"
            run(ssh, "cp -p -- " + shlex.quote(sp_index) + " " + shlex.quote(tmp)); run(ssh, "mv -f -- " + shlex.quote(tmp) + " " + shlex.quote(INDEX))
            run(ssh, "rm -f -- " + shlex.quote(ADDON))
            after_index = rsha(sftp, INDEX); after_addon = rsha(sftp, ADDON)
            if after_index != candidate_hash or after_addon is not None: raise RuntimeError("REMOVE_READBACK_MISMATCH")
            evidence["beforeHashes"] = before; evidence["afterHashes"] = {INDEX: after_index, ADDON: after_addon}; evidence["backupFiles"] = {INDEX: bp_index, ADDON: bp_addon}
        served_index_url = "http://127.0.0.1:81/index.html?verify=appearance_preview_removed_" + stamp
        served_addon_url = "http://127.0.0.1:81/js/lhs-appearance-preview-v1.js?verify=appearance_preview_removed_" + stamp
        served_index = run(ssh, "curl -fsS --max-time 15 " + shlex.quote(served_index_url))
        if "lhs-appearance-preview-v1.js" in served_index: raise RuntimeError("PUBLIC_INDEX_STILL_REFERENCES_ADDON")
        addon_probe = run(ssh, "curl -sS --max-time 15 -o /dev/null -w '%{http_code}' " + shlex.quote(served_addon_url)).strip()
        if addon_probe != "404": raise RuntimeError("PUBLIC_ADDON_NOT_REMOVED:" + addon_probe)
        evidence["served"] = {"index": {"url": served_index_url, "sha256": sha(served_index), "addonReference": False}, "addon": {"url": served_addon_url, "http": addon_probe}}
        evidence["status"] = "REMOVED"
        run(ssh, "rm -f -- " + shlex.quote(sp_index)); run(ssh, "rmdir -- " + shlex.quote(stage))
    except Exception:
        evidence["status"] = "FAILED"
        raise
    finally:
        evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"); ssh.close()
    print(json.dumps(evidence, ensure_ascii=False, indent=2))
if __name__ == "__main__": main()
