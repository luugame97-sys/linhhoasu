"""Roll out the OldTrek finish/reconnect recovery with CAS, backup and read-back."""
import hashlib
import json
import shlex
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
SERVER_ROOT = "/linhhoasu/lhs/newServer"
CLIENT_ROOT = "/linhhoasu/webgame/game"
FILES = {
    SERVER_ROOT + "/src/handlers/old-trek.js": ROOT / "linhhoasu/lhs/newServer/src/handlers/old-trek.js",
    CLIENT_ROOT + "/js/lhs-oldtrek-errors-v1.js": ROOT / "linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js",
    CLIENT_ROOT + "/index.html": ROOT / "linhhoasu/webgame/game/index.html",
}
EXPECTED = {
    SERVER_ROOT + "/src/handlers/old-trek.js": "559050373c0d0c339725ac11014e0ca276c2a60a29cc15790b0a6eb1a0be6c2b",
    CLIENT_ROOT + "/js/lhs-oldtrek-errors-v1.js": "3581e2f5783dfce32878aa00474933d38f99665c0636456598af8e7dbf12e067",
    CLIENT_ROOT + "/index.html": "5f9e9bcab873447b4d283f97289e093d55e9043107f317fda2490f6806609a2d",
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def wait_ready(ssh, port: int, attempts: int = 15) -> str:
    last = ""
    for _ in range(attempts):
        try:
            code = run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 8 http://127.0.0.1:{port}/ready").strip()
        except RuntimeError as exc:
            code = ""
            last = str(exc)
        if code == "200":
            return code
        last = code or last
        time.sleep(2)
    raise RuntimeError(f"READY:{port}:{last}")


def main() -> None:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/oldtrek_finish_recovery_{stamp}"
    stage = f"/tmp/oldtrek_finish_recovery_{stamp}"
    evidence_path = ROOT / "_ai_workbench/temp/oldtrek_finish_recovery_20260926" / f"deploy_{stamp}.json"
    report = {
        "at": datetime.now(timezone.utc).isoformat(),
        "backup": backup,
        "stage": stage,
        "productionPlayerWrites": 0,
        "playerWrites": 0,
        "dbWrites": 0,
        "restarts": 0,
        "files": {},
    }
    ssh = connect()
    try:
        with ssh.open_sftp() as sftp:
            run(ssh, "mkdir -p " + shlex.quote(backup) + " " + shlex.quote(stage))
            for index, (remote, local) in enumerate(FILES.items()):
                before = sftp.open(remote, "rb").read()
                before_sha = sha(before)
                if before_sha != EXPECTED[remote]:
                    raise RuntimeError(f"CAS:{remote}:{before_sha}")
                payload = local.read_bytes()
                remote_name = ["server_old-trek.js", "client_lhs-oldtrek-errors-v1.js", "client_index.html"][index]
                staged = stage + "/" + remote_name
                backup_path = backup + "/" + remote_name
                with sftp.open(backup_path, "wb") as handle:
                    handle.write(before)
                with sftp.open(staged, "wb") as handle:
                    handle.write(payload)
                if sha(sftp.open(backup_path, "rb").read()) != before_sha:
                    raise RuntimeError("BACKUP_HASH_MISMATCH:" + remote)
                if sha(sftp.open(staged, "rb").read()) != sha(payload):
                    raise RuntimeError("STAGE_HASH_MISMATCH:" + remote)
                if remote.endswith(".js"):
                    run(ssh, "node --check " + shlex.quote(staged))
                run(ssh, "mv -f " + shlex.quote(staged) + " " + shlex.quote(remote))
                live = sftp.open(remote, "rb").read()
                if sha(live) != sha(payload):
                    raise RuntimeError("LIVE_HASH_MISMATCH:" + remote)
                report["files"][remote] = {"before": before_sha, "after": sha(payload), "bytes": len(payload)}

        for node in ["lhs-s1001", "lhs-s1002", "lhs-s1003", "lhs-s1004", "lhs-s1005"]:
            run(ssh, f"OLD_TREK_EVENT_ENGINE_ENABLED=1 OLD_TREK_SETTLEMENT_ENABLED=1 OLD_TREK_SETTLEMENT_ACTIVATION_AT=1789956000000 pm2 restart {node} --update-env")
            time.sleep(2)
            rows = json.loads(run(ssh, "pm2 jlist"))
            row = next(item for item in rows if item.get("name") == node)
            if row.get("pm2_env", {}).get("status") != "online":
                raise RuntimeError("PM2_NOT_ONLINE:" + node)
            report["restarts"] += 1

        report["readiness"] = {}
        for port in [8080, 8083, 8084, 8085, 8086]:
            code = wait_ready(ssh, port)
            report["readiness"][str(port)] = int(code)

        served_addon = run(ssh, "curl -fsS --max-time 10 http://127.0.0.1:81/js/lhs-oldtrek-errors-v1.js")
        served_index = run(ssh, "curl -fsS --max-time 10 http://127.0.0.1:81/")
        report["served"] = {
            "addonHash": sha(served_addon.encode()),
            "addonHashMatches": sha(served_addon.encode()) == report["files"][CLIENT_ROOT + "/js/lhs-oldtrek-errors-v1.js"]["after"],
            "indexCacheKey": "20260926_v1" in served_index,
            "indexReferencesAddon": "js/lhs-oldtrek-errors-v1.js?v=20260926_v1" in served_index,
        }
        if not report["served"]["addonHashMatches"] or not report["served"]["indexReferencesAddon"]:
            raise RuntimeError("SERVED_CLIENT_HASH_OR_CACHE_MISMATCH")
        report["recentOldTrekErrors"] = run(
            ssh,
            "for f in /root/.pm2/logs/lhs-s100*-error.log; do tail -n 600 \"$f\" 2>/dev/null; done | grep -E 'TypeError|OLD_TREK|OldTrek' | tail -n 40 || true",
        ).strip()
        run(ssh, "rm -rf " + shlex.quote(stage))
        evidence_path.parent.mkdir(parents=True, exist_ok=True)
        evidence_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
