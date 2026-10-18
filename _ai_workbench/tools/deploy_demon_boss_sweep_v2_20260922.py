"""Deploy the quota-inspection side-effect guard after the sweep release."""
import hashlib
import json
import shlex
import time
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / "linhhoasu/lhs/newServer/src/handlers/raid.js"
BACKUP_LOCAL = ROOT / "_ai_workbench/backups/demon_boss_sweep_20260922_v2/raid.js.before"
REMOTE = "/linhhoasu/lhs/newServer/src/handlers/raid.js"
BACKUP = "/linhhoasu/_ai_workbench/backups/demon_boss_sweep_20260922_v2/raid.js.before"
STAGE_ROOT = "/linhhoasu/_ai_workbench/temp/demon_boss_sweep_20260922_v2"
NODES = [("lhs-s1002", 8083), ("lhs-s1001", 8080), ("lhs-s1003", 8084), ("lhs-s1004", 8085), ("lhs-s1005", 8086)]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def ready(ssh, port: int) -> str:
    cmd = f"for i in $(seq 1 90); do c=$(curl -fsS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{port}/ready || true); if [ \"$c\" = 200 ]; then echo 200; exit 0; fi; sleep 1; done; exit 1"
    return run(ssh, cmd).strip()


def main() -> None:
    new = LOCAL.read_bytes()
    baseline = BACKUP_LOCAL.read_bytes()
    if sha(new) == sha(baseline):
        raise RuntimeError("V2_SOURCE_NOT_CHANGED")
    ssh = connect()
    old = b""
    touched = False
    try:
        with ssh.open_sftp() as sftp:
            old = sftp.open(REMOTE, "rb").read()
            if old != baseline:
                raise RuntimeError("REMOTE_CAS_DRIFT:" + sha(old))
            if sftp.open(BACKUP, "rb").read() != baseline:
                raise RuntimeError("REMOTE_BACKUP_DRIFT")
            stage = f"{STAGE_ROOT}/{int(time.time())}/lhs/newServer/src/handlers"
            run(ssh, "install -d -m 700 " + shlex.quote(stage))
            staged = stage + "/raid.js"
            with sftp.open(staged, "wb") as handle:
                handle.write(new)
            sftp.chmod(staged, 0o755)
            run(ssh, "node --check " + shlex.quote(staged))
            sftp.posix_rename(staged, REMOTE)
            touched = True
        for name, port in NODES:
            run(ssh, "pm2 restart " + shlex.quote(name) + " --update-env")
            if ready(ssh, port) != "200":
                raise RuntimeError("READY_FAILED:" + name)
        with ssh.open_sftp() as sftp:
            installed = sftp.open(REMOTE, "rb").read()
        if installed != new:
            raise RuntimeError("INSTALLED_HASH_MISMATCH")
        result = {"result": "DEPLOYED_AND_READY", "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "productionWrites": 0,
                  "backup": "/linhhoasu/_ai_workbench/backups/demon_boss_sweep_20260922_v2", "file": {"before": sha(old), "after": sha(new)},
                  "restartOrder": [name for name, _ in NODES],
                  "readiness": {name: json.loads(run(ssh, f"curl -fsS http://127.0.0.1:{port}/ready")) for name, port in NODES}}
        out = ROOT / "_ai_workbench/temp/demon_boss_sweep_20260922/release_v2.json"
        out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception:
        if touched:
            with ssh.open_sftp() as sftp:
                stage = f"{STAGE_ROOT}/rollback-{int(time.time())}/lhs/newServer/src/handlers"
                run(ssh, "install -d -m 700 " + shlex.quote(stage))
                staged = stage + "/raid.js"
                with sftp.open(staged, "wb") as handle:
                    handle.write(old)
                sftp.chmod(staged, 0o755)
                sftp.posix_rename(staged, REMOTE)
            for name, port in NODES:
                run(ssh, "pm2 restart " + shlex.quote(name) + " --update-env")
                ready(ssh, port)
        raise
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
