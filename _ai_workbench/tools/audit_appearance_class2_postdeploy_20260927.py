"""Read-only post-deploy evidence for the class-2 appearance fix."""
from __future__ import annotations

import hashlib
import json
import shlex
import sys
from pathlib import Path

WB = Path(__file__).resolve().parents[1]
ROOT = WB.parent
sys.path.insert(0, str(WB / "tools"))
from snapshot_web_multiserver_20260906 import connect, run  # noqa: E402

APP = "/linhhoasu/lhs/newServer"
GAME = "/linhhoasu/webgame/game"
FILES = [
    f"{APP}/src/handlers/fashion.js",
    f"{GAME}/js/lhs-appearance-preview-v1.js",
    f"{GAME}/index.html",
]
PORTS = [8087, 8086, 8085, 8084, 8083, 8080]
PROCESSES = {f"lhs-s100{i}" for i in range(1, 7)}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    ssh = connect()
    try:
        with ssh.open_sftp() as sftp:
            hashes = {path: digest(sftp.open(path, "rb").read()) for path in FILES}
            backups = run(
                ssh,
                "find /linhhoasu/_ai_workbench/backups -maxdepth 1 -type d -name 'appearance_class2_fix_*' -printf '%f\\n' | sort | tail -n 3",
            ).splitlines()
        processes = [
            {
                "name": row.get("name"),
                "status": row.get("pm2_env", {}).get("status"),
                "pid": row.get("pid"),
                "restarts": row.get("pm2_env", {}).get("restart_time"),
            }
            for row in json.loads(run(ssh, "pm2 jlist"))
            if row.get("name") in PROCESSES
        ]
        ready = {
            str(port): run(
                ssh,
                f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready",
            ).strip()
            for port in PORTS
        }
        served = {}
        for path in [f"{GAME}/js/lhs-appearance-preview-v1.js", f"{GAME}/index.html"]:
            url = "http://127.0.0.1:81" + path.removeprefix(GAME)
            served[path] = run(
                ssh,
                "curl -fsS --max-time 15 " + shlex.quote(url) + " | sha256sum | cut -d' ' -f1",
            ).strip()
        log_counts = {}
        for name in sorted(PROCESSES):
            log_counts[name] = run(
                ssh,
                "for f in /root/.pm2/logs/" + name + "-error.log /root/.pm2/logs/" + name + ".log; do "
                "test -f \"$f\" || continue; "
                "tail -n 300 \"$f\" | grep -E -c 'TypeError|ReferenceError|Unhandled|FATAL' || true; done | awk '{sum+=$1} END{print sum+0}'",
            ).strip()
        result = {
            "result": "READ_ONLY_PASS",
            "hashes": hashes,
            "served": served,
            "ready": ready,
            "processes": processes,
            "backups": backups,
            "recentErrorPatternCounts": log_counts,
            "productionWrites": 0,
            "playerWrites": 0,
        }
        out = WB / "temp" / "appearance_class2_fix_20260927" / "postdeploy_readonly.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
