"""Deploy pet avatar fallback (Option 1) and quality 10 Hon Don icon to VPS."""
from __future__ import annotations
import hashlib
import json
import posixpath
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
GAME_LOCAL = ROOT / "linhhoasu/webgame/game"
HOSTROOT = "/linhhoasu"
GAME_REMOTE = HOSTROOT + "/webgame/game"
STAMP = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
BACKUP = f"{HOSTROOT}/_ai_workbench/backups/pet_avatar_quality10_{STAMP}"
STAGE = f"{HOSTROOT}/_ai_workbench/temp/stage_pet_avatar_quality10_{STAMP}"

MAPPING = {
    GAME_LOCAL / "index.html": GAME_REMOTE + "/index.html",
    GAME_LOCAL / "js/main.min_drop100.js": GAME_REMOTE + "/js/main.min_drop100.js",
    GAME_LOCAL / "update/resource/default.res_cn_main_f70d4753_pet_vusa_v2_20260929.bin": GAME_REMOTE + "/update/resource/default.res_cn_main_f70d4753_pet_vusa_v2_20260929.bin",
    GAME_LOCAL / "update/resource/default.res_cn_main_f70d4753_pet_vusa_20260929.bin": GAME_REMOTE + "/update/resource/default.res_cn_main_f70d4753_pet_vusa_20260929.bin",
    GAME_LOCAL / "update/resource/assets/atlas_ui/0_common/bm/lang_cn/common_bm_quality_10_264c3006.png": GAME_REMOTE + "/update/resource/assets/atlas_ui/0_common/bm/lang_cn/common_bm_quality_10_264c3006.png",
    GAME_LOCAL / "update/resource/assets/atlas_ui/0_common/bm/lang_cn/common_bm_quality_10.png": GAME_REMOTE + "/update/resource/assets/atlas_ui/0_common/bm/lang_cn/common_bm_quality_10.png",
}

q = shlex.quote
sha = lambda b: hashlib.sha256(b).hexdigest()

def hashes(s, paths):
    res = {}
    chunk_size = 20
    for i in range(0, len(paths), chunk_size):
        chunk = paths[i:i + chunk_size]
        out = run(s, "sha256sum -- " + " ".join(q(p) for p in chunk) + " || true")
        for line in out.splitlines():
            parts = line.split()
            if len(parts) >= 2:
                res[parts[1]] = parts[0]
    return res

def main():
    print(f"Deploying pet avatar fallback & quality 10 icon at {STAMP}...")
    payload = {}
    for local_p, remote_p in MAPPING.items():
        assert local_p.is_file(), f"MISSING_LOCAL: {local_p}"
        payload[remote_p] = {
            "local": local_p,
            "sha": sha(local_p.read_bytes())
        }

    s = connect()
    report = {"result": "STARTED", "backup": BACKUP, "stage": STAMP, "files": list(payload.keys())}
    try:
        # Check existing remote files to back up
        check_exist = [p for p in payload if "quality_10" not in p and "_v2_" not in p]
        live_hashes = hashes(s, check_exist)
        print("Existing files to back up:", live_hashes)

        # Create backup and stage dirs
        run(s, f"install -d -m 700 {q(BACKUP)} {q(STAGE)}")

        # Copy existing files to backup
        for p in check_exist:
            if p in live_hashes:
                run(s, f"install -d -m 700 {q(BACKUP + posixpath.dirname(p))} && cp -p -- {q(p)} {q(BACKUP + p)}")
        print(f"Backup created at {BACKUP}")

        # Upload files to stage
        with s.open_sftp() as sf:
            for remote_p, info in payload.items():
                stage_p = STAGE + remote_p[len(HOSTROOT):]
                run(s, f"install -d -m 700 {q(posixpath.dirname(stage_p))}")
                sf.put(str(info["local"]), stage_p)
                sf.chmod(stage_p, 0o644)

        # Verify staged hashes
        staged_paths = [STAGE + remote_p[len(HOSTROOT):] for remote_p in payload]
        staged_hashes = hashes(s, staged_paths)
        for remote_p, info in payload.items():
            sp = STAGE + remote_p[len(HOSTROOT):]
            if staged_hashes.get(sp) != info["sha"]:
                raise RuntimeError(f"STAGE_HASH_MISMATCH: {remote_p}")
        print("Stage verification passed.")

        # Swap files
        for remote_p in payload:
            sp = STAGE + remote_p[len(HOSTROOT):]
            run(s, f"install -d -m 755 {q(posixpath.dirname(remote_p))} && mv -f -- {q(sp)} {q(remote_p)}")
        print("Files swapped into production.")

        # Verify live hashes
        after_hashes = hashes(s, list(payload.keys()))
        for remote_p, info in payload.items():
            if after_hashes.get(remote_p) != info["sha"]:
                raise RuntimeError(f"LIVE_HASH_MISMATCH: {remote_p}")
        print("Live verification passed.")

        # Syntax check JS
        run(s, f"node --check {q(GAME_REMOTE + '/js/main.min_drop100.js')}")
        print("JS syntax check passed on VPS.")

        report["result"] = "DEPLOYED"

    except Exception as e:
        report["result"] = "FAILED"
        report["error"] = str(e)
        print("Error during deploy:", e)
        # Rollback if needed
        for p in check_exist:
            if p in live_hashes:
                run(s, f"cp -p -- {q(BACKUP + p)} {q(p)}")
        print("Rolled back to previous state.")
        raise
    finally:
        run(s, f"rm -rf -- {q(STAGE)}")
        s.close()

    evidence_file = ROOT / f"_ai_workbench/temp/pet_avatar_quality10_{STAMP}.json"
    evidence_file.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Release completed successfully!")

if __name__ == "__main__":
    main()
