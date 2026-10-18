"""Deploy the WebGM giftcode editor delta only.

Scope: two WebGM files (admin API + admin JS).  No game process, player data,
giftcode rows, or MySQL schema are changed by the deployment itself.
"""
from __future__ import annotations

import hashlib
import json
import posixpath
import shlex
import stat
import sys
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run


ROOT = Path(__file__).resolve().parents[2]
CANDIDATE = ROOT / "_ai_workbench" / "temp" / "giftcode_edit_20260915" / "candidate"
QA = ROOT / "_ai_workbench" / "tools" / "qa_giftcode_edit_api_20260915.php"
REPORT_DIR = ROOT / "_ai_workbench" / "reports"
EVIDENCE_DIR = ROOT / "_ai_workbench" / "temp" / "giftcode_edit_20260915"
REMOTE_ROOT = "/linhhoasu/webgame/gm"
FILES = {
    "admin/admin_api.php": REMOTE_ROOT + "/admin/admin_api.php",
    "assets/js/admin.js": REMOTE_ROOT + "/assets/js/admin.js",
}
EXPECTED_BASELINE = {
    "admin/admin_api.php": "a97cbb15f1845b3f3a6b4b0163dc3063b17441e37481bf775807c6fb9405a575",
    "assets/js/admin.js": "83392b7e8b5f2af30eedbc1f2c4cc4a96f81587c4b51d8818c14cdc355c5a398",
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def q(value: str) -> str:
    return shlex.quote(value)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    for rel in FILES:
        if not (CANDIDATE / rel).is_file():
            raise RuntimeError("CANDIDATE_MISSING:" + rel)
    if not QA.is_file():
        raise RuntimeError("QA_SCRIPT_MISSING")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    remote_stage = f"/linhhoasu/_ai_workbench/temp/giftcode_editor_{stamp}"
    remote_backup = f"/linhhoasu/_ai_workbench/backups/giftcode_editor_{stamp}"
    result = {
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "remoteStage": remote_stage,
        "remoteBackup": remote_backup,
        "files": {},
        "playerWrites": 0,
        "gameRestarted": False,
    }
    ssh = connect()
    installed = []
    try:
        before_pm2 = run(
            ssh,
            "pm2 jlist | python3 -c "
            + q(
                "import sys,json; d=json.load(sys.stdin); "
                "print(json.dumps([(x.get('name'),x.get('pm2_env',{}).get('restart_time')) "
                "for x in d if x.get('name','').startswith('lhs-')]))"
            ),
        ).strip()
        result["pm2Before"] = before_pm2

        run(ssh, f"install -d -m 700 {q(remote_stage)} {q(remote_backup + '/before')} {q(remote_backup + '/next')}")
        with ssh.open_sftp() as sftp:
            for rel, remote in FILES.items():
                current = sftp.open(remote, "rb").read()
                current_sha = sha(current)
                if current_sha != EXPECTED_BASELINE[rel]:
                    raise RuntimeError(f"LIVE_DRIFT:{rel}:{current_sha}")
                candidate = (CANDIDATE / rel).read_bytes()
                candidate_sha = sha(candidate)
                result["files"][rel] = {
                    "beforeSha256": current_sha,
                    "candidateSha256": candidate_sha,
                    "bytes": len(candidate),
                    "remote": remote,
                }
                parent = posixpath.dirname(rel)
                if parent:
                    run(ssh, f"install -d -m 700 {q(remote_stage + '/' + parent)} {q(remote_backup + '/before/' + parent)} {q(remote_backup + '/next/' + parent)}")
                run(ssh, f"cp -p {q(remote)} {q(remote_backup + '/before/' + rel)}")
                with sftp.open(remote_stage + "/" + rel, "wb") as out:
                    out.write(candidate)
                sftp.chmod(remote_stage + "/" + rel, stat.S_IMODE(sftp.stat(remote).st_mode))

        run(ssh, f"php -l {q(remote_stage + '/admin/admin_api.php')}")
        run(ssh, f"node --check {q(remote_stage + '/assets/js/admin.js')}")
        for rel in FILES:
            run(ssh, f"sha256sum {q(remote_stage + '/' + rel)} | grep -F {q(result['files'][rel]['candidateSha256'])}")

        # Re-check the live bytes immediately before each replacement, then
        # atomically rename a same-filesystem staged file into place.
        with ssh.open_sftp() as sftp:
            for rel, remote in FILES.items():
                if sha(sftp.open(remote, "rb").read()) != EXPECTED_BASELINE[rel]:
                    raise RuntimeError("LIVE_DRIFT_BEFORE_SWAP:" + rel)
                staged = remote_stage + "/" + rel
                target = remote
                run(ssh, f"mv -f {q(staged)} {q(target)}")
                installed.append(rel)

        with ssh.open_sftp() as sftp:
            for rel, remote in FILES.items():
                served = sftp.open(remote, "rb").read()
                if sha(served) != result["files"][rel]["candidateSha256"]:
                    raise RuntimeError("POST_SWAP_HASH_FAILED:" + rel)
        result["http"] = {
            "adminIndex": run(ssh, "curl -sS --max-time 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:88/admin/index.php").strip(),
            "adminJs": run(ssh, "curl -fsS --max-time 10 'http://127.0.0.1:88/assets/js/admin.js' | grep -c 'var editItems = rewardItemsFromJson'").strip(),
        }
        if result["http"]["adminIndex"] not in {"200", "302"} or result["http"]["adminJs"] != "1":
            raise RuntimeError("HTTP_VERIFY_FAILED")

        # Exercise the live PHP endpoint with a disposable row and guaranteed
        # cleanup.  This verifies editing a used code, reward replacement and
        # preservation of used_count through the actual deployed source.
        qa_remote = remote_stage + "/qa_giftcode_edit_20260915.php"
        with ssh.open_sftp() as sftp:
            sftp.put(str(QA), qa_remote)
        qa_base = f"php {q(qa_remote)} {q('/linhhoasu/webgame/gm/config.php')} {q('/linhhoasu/webgame/gm/admin/admin_api.php')}"
        state = remote_stage + "/qa_state.json"
        marker = "livegiftedit" + stamp
        qa_setup = False
        try:
            run(ssh, qa_base + f" setup {q(state)} {q(marker)}")
            qa_setup = True
            run(ssh, qa_base + f" invoke {q(state)} {q(marker)}")
            qa_verify = run(ssh, qa_base + f" verify {q(state)} {q(marker)}")
            result["apiQa"] = json.loads(qa_verify.strip().splitlines()[-1])
            run(ssh, qa_base + f" cleanup {q(state)} {q(marker)}")
            qa_setup = False
        finally:
            if qa_setup:
                try:
                    run(ssh, qa_base + f" cleanup {q(state)} {q(marker)}")
                except Exception:
                    result["qaCleanupFailed"] = True

        after_pm2 = run(
            ssh,
            "pm2 jlist | python3 -c "
            + q(
                "import sys,json; d=json.load(sys.stdin); "
                "print(json.dumps([(x.get('name'),x.get('pm2_env',{}).get('restart_time')) "
                "for x in d if x.get('name','').startswith('lhs-')]))"
            ),
        ).strip()
        result["pm2After"] = after_pm2
        if before_pm2 != after_pm2:
            raise RuntimeError("GAME_PROCESS_INVARIANT_FAILED")
        result["installed"] = True
        result["finishedAt"] = datetime.now(timezone.utc).isoformat()
    except Exception as error:
        result["error"] = str(error)
        # Restore only files successfully swapped in this run, from the exact
        # preimage backup.  Never touch unrelated WebGM files or game services.
        for rel in reversed(installed):
            run(ssh, f"cp -p {q(remote_backup + '/before/' + rel)} {q(FILES[rel])}")
        result["rolledBack"] = bool(installed)
        raise
    finally:
        try:
            run(ssh, f"rm -rf -- {q(remote_stage)}")
        except Exception:
            pass
        ssh.close()
        evidence = EVIDENCE_DIR / f"deploy_{stamp}.json"
        evidence.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
