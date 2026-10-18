"""Roll out the pet reset/refund fix with CAS, backup and five-node readiness checks."""

import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run


ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / "linhhoasu/lhs/newServer/src/handlers/pet.js"
REMOTE = "/linhhoasu/lhs/newServer/src/handlers/pet.js"
EXPECTED_REMOTE_BEFORE = "f65ebaef904c60e5eb93366d90f1ee6dbd9dd0e4847556eb1444f7e8dbfb350d"
EXPECTED_REMOTE_AFTER = "2e9770029f617ea3c575a1d0c228b0d26f6460890f39d23c1552190becfcf636"
NODES = [
    ("lhs-s1001", 8080),
    ("lhs-s1002", 8083),
    ("lhs-s1003", 8084),
    ("lhs-s1004", 8085),
    ("lhs-s1005", 8086),
]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    payload = LOCAL.read_bytes()
    if digest(payload) != "2e9770029f617ea3c575a1d0c228b0d26f6460890f39d23c1552190becfcf636":
        raise RuntimeError("LOCAL_HASH_DRIFT")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/pet_reset_fix_20260923_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/pet_reset_fix_20260923_{stamp}/pet.js"
    report = {
        "at": datetime.now(timezone.utc).isoformat(),
        "backup": backup,
        "stage": stage,
        "directPlayerWrites": 0,
        "files": {},
        "restarts": [],
    }
    ssh = connect()
    installed = False
    restarted = []
    try:
        with ssh.open_sftp() as sftp:
            current = sftp.open(REMOTE, "rb").read()
            current_hash = digest(current)
            if current_hash not in (EXPECTED_REMOTE_BEFORE, EXPECTED_REMOTE_AFTER):
                raise RuntimeError(f"REMOTE_CAS_DRIFT:{current_hash}")

            if current_hash == EXPECTED_REMOTE_BEFORE:
                run(ssh, "mkdir -p " + shlex.quote(backup) + " " + shlex.quote(stage.rsplit("/", 1)[0]))
                backup_file = backup + "/pet.js.before"
                with sftp.open(backup_file, "wb") as handle:
                    handle.write(current)
                if digest(sftp.open(backup_file, "rb").read()) != current_hash:
                    raise RuntimeError("BACKUP_HASH_MISMATCH")

                with sftp.open(stage, "wb") as handle:
                    handle.write(payload)
                run(ssh, "chmod 644 " + shlex.quote(stage))
                run(ssh, "node --check " + shlex.quote(stage))
                if digest(sftp.open(stage, "rb").read()) != digest(payload):
                    raise RuntimeError("STAGE_HASH_MISMATCH")
                if digest(sftp.open(REMOTE, "rb").read()) != current_hash:
                    raise RuntimeError("PRE_SWAP_CAS_DRIFT")
                sftp.posix_rename(stage, REMOTE)
            else:
                # The first attempt swapped the file before its restart step;
                # continue that rollout instead of treating the already-fixed
                # remote file as a CAS conflict.
                report["resume"] = "source_already_installed"
                previous_backup = run(
                    ssh,
                    "ls -dt /linhhoasu/_ai_workbench/backups/pet_reset_fix_20260923_* 2>/dev/null | head -1",
                ).strip()
                if previous_backup:
                    backup = previous_backup
            installed = True
            live_hash = digest(sftp.open(REMOTE, "rb").read())
            if live_hash != digest(payload):
                raise RuntimeError("LIVE_HASH_MISMATCH")
            report["files"][REMOTE] = {"before": current_hash, "after": live_hash}

        for name, port in NODES:
            run(ssh, "pm2 restart " + shlex.quote(name) + " --update-env")
            restarted.append(name)
            report["restarts"].append(name)
            ready = False
            code = ""
            for _ in range(20):
                code = run(
                    ssh,
                    f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 3 http://127.0.0.1:{port}/ready || true",
                ).strip()
                if code == "200":
                    ready = True
                    break
                time.sleep(2)
            report.setdefault("readiness", {})[str(port)] = code
            if not ready:
                raise RuntimeError(f"READY_FAILED:{name}:{port}:{code}")

        status_script = (
            "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(" 
            "JSON.parse(s).filter(p=>/^lhs-s100[1-5]$/.test(p.name)).map(p=>({name:p.name,status:p.pm2_env.status,pid:p.pid,restarts:p.pm2_env.restart_time})))))"
        )
        report["processes"] = json.loads(run(ssh, "pm2 jlist | node -e " + shlex.quote(status_script)))
        if any(row.get("status") != "online" for row in report["processes"]):
            raise RuntimeError("NODE_NOT_ONLINE")
        run(ssh, "pm2 save")
        report["status"] = "DEPLOYED"
    except Exception:
        if installed:
            try:
                run(ssh, "cp -p " + shlex.quote(backup + "/pet.js.before") + " " + shlex.quote(REMOTE))
                for name, _port in NODES:
                    try:
                        run(ssh, "pm2 restart " + shlex.quote(name) + " --update-env")
                    except Exception:
                        pass
                report["rollback"] = "restored_and_restarted"
            except Exception as rollback_error:
                report["rollbackError"] = str(rollback_error)
        report["status"] = "FAILED"
        raise
    finally:
        try:
            try:
                run(ssh, "rm -f -- " + shlex.quote(stage))
            except Exception:
                pass
        finally:
            ssh.close()
        out = ROOT / "_ai_workbench/temp/pet_reset_fix_20260923/release.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
