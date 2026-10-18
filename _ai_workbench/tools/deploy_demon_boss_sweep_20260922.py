"""Deploy cleared Yêu Vương sweep support with CAS, backup verification and rolling readiness."""

import hashlib
import json
import shlex
import time
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "linhhoasu"
REMOTE = "/linhhoasu"
BACKUP = REMOTE + "/_ai_workbench/backups/demon_boss_sweep_20260922"
STAGE_ROOT = REMOTE + "/_ai_workbench/temp/demon_boss_sweep_20260922"
FILES = [
    "lhs/newServer/src/handlers/raid.js",
    "lhs/newServer/src/handlers/dungeon.js",
    "webgame/game/js/main.min_drop100.js",
    "webgame/game/index.html",
]
NODES = [
    ("lhs-s1002", 8083),
    ("lhs-s1001", 8080),
    ("lhs-s1003", 8084),
    ("lhs-s1004", 8085),
    ("lhs-s1005", 8086),
]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def ready(ssh, port: int) -> str:
    command = (
        f"for i in $(seq 1 90); do "
        f"code=$(curl -fsS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{port}/ready || true); "
        f"if [ \"$code\" = 200 ]; then echo 200; exit 0; fi; sleep 1; done; exit 1"
    )
    return run(ssh, command).strip()


def main() -> None:
    local = {rel: (APP / rel).read_bytes() for rel in FILES}
    backups = {
        rel: (ROOT / "_ai_workbench/backups/demon_boss_sweep_20260922"
              / (("linhhoasu/" + rel).replace("/", "__") + ".before")).read_bytes()
        for rel in FILES
    }
    ssh = connect()
    before = {}
    published = []
    touched = []
    stage = f"{STAGE_ROOT}/{int(time.time())}"
    try:
        with ssh.open_sftp() as sftp:
            run(ssh, "install -d -m 700 " + shlex.quote(stage))
            for rel in FILES:
                remote = REMOTE + "/" + rel
                old = sftp.open(remote, "rb").read()
                if old != backups[rel]:
                    raise RuntimeError("REMOTE_CAS_DRIFT:" + rel + ":" + sha(old))
                before[rel] = old
                staged = stage + "/" + rel
                run(ssh, "install -d -m 700 " + shlex.quote(staged.rsplit("/", 1)[0]))
                with sftp.open(staged, "wb") as handle:
                    handle.write(local[rel])
                sftp.chmod(staged, 0o644 if rel.startswith("webgame/") else 0o755)
                if rel.endswith(".js"):
                    run(ssh, "node --check " + shlex.quote(staged))
                sftp.posix_rename(staged, remote)
                published.append(rel)

        for name, port in NODES:
            run(ssh, "pm2 restart " + shlex.quote(name) + " --update-env")
            touched.append(name)
            if ready(ssh, port) != "200":
                raise RuntimeError("READY_FAILED:" + name)

        with ssh.open_sftp() as sftp:
            installed = {
                rel: sha(sftp.open(REMOTE + "/" + rel, "rb").read())
                for rel in FILES
            }
        result = {
            "result": "DEPLOYED_AND_READY",
            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "productionWrites": 0,
            "backup": BACKUP,
            "restartOrder": touched,
            "files": {
                rel: {"before": sha(before[rel]), "after": installed[rel], "expected": sha(local[rel])}
                for rel in FILES
            },
            "readiness": {
                name: json.loads(run(ssh, f"curl -fsS http://127.0.0.1:{port}/ready"))
                for name, port in NODES
            },
        }
        if any(row["after"] != row["expected"] for row in result["files"].values()):
            raise RuntimeError("INSTALLED_HASH_MISMATCH")
        out = ROOT / "_ai_workbench/temp/demon_boss_sweep_20260922/release.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception:
        with ssh.open_sftp() as sftp:
            for rel in published:
                staged = f"{STAGE_ROOT}/rollback-{int(time.time())}/{rel}"
                run(ssh, "install -d -m 700 " + shlex.quote(staged.rsplit("/", 1)[0]))
                with sftp.open(staged, "wb") as handle:
                    handle.write(before[rel])
                sftp.chmod(staged, 0o644 if rel.startswith("webgame/") else 0o755)
                sftp.posix_rename(staged, REMOTE + "/" + rel)
        for name, port in NODES:
            if name in touched:
                run(ssh, "pm2 restart " + shlex.quote(name) + " --update-env")
                ready(ssh, port)
        raise
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
