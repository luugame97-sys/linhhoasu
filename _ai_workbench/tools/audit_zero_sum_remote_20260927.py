"""Read-only live inventory for the zero-sum Arena/CrossArena candidate."""
from __future__ import annotations

import hashlib
import json
import shlex
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
REMOTE_ROOT = "/linhhoasu/lhs/newServer"
FILES = [
    "src/services/CompetitionScoreService.js",
    "src/handlers/arena.js",
    "src/services/CrossArenaService.js",
    "src/app.js",
    "src/db/models/Player.js",
    "src/db/models/ArenaFightLog.js",
    "src/db/models/CrossEventEntry.js",
    "src/db/models/CrossArenaAction.js",
]


def local_hash(rel: str) -> str | None:
    path = ROOT / "linhhoasu" / "lhs" / "newServer" / rel
    if not path.exists():
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    out_dir = ROOT / "_ai_workbench" / "temp" / "zero_sum_score_20260927"
    out_dir.mkdir(parents=True, exist_ok=True)
    ssh = connect()
    try:
        processes = json.loads(run(ssh, "pm2 jlist"))
        nodes = []
        for row in processes:
            name = str(row.get("name", ""))
            if not name.startswith("lhs-s"):
                continue
            env = dict((row.get("pm2_env") or {}).get("env") or {})
            env.update({k: v for k, v in (row.get("pm2_env") or {}).items() if k in {
                "SERVER_ID", "HTTP_PORT", "WS_PORT", "IDENTITY_MONGO_DB", "REDIS_PREFIX"
            }})
            nodes.append({
                "name": name,
                "status": (row.get("pm2_env") or {}).get("status"),
                "pid": row.get("pid"),
                "restartCount": (row.get("pm2_env") or {}).get("restart_time"),
                "cwd": (row.get("pm2_env") or {}).get("pm_cwd"),
                "serverId": env.get("SERVER_ID"),
                "httpPort": env.get("HTTP_PORT"),
                "wsPort": env.get("WS_PORT"),
                "identityDb": env.get("IDENTITY_MONGO_DB"),
                "redisPrefix": env.get("REDIS_PREFIX"),
            })
        hashes = {}
        syntax = {}
        for rel in FILES:
            remote = f"{REMOTE_ROOT}/{rel}"
            remote_hash = run(ssh, f"if test -f {shlex.quote(remote)}; then sha256sum -- {shlex.quote(remote)} | awk '{{print $1}}'; else echo MISSING; fi").strip()
            hashes[rel] = {"local": local_hash(rel), "remote": remote_hash}
            hashes[rel]["match"] = hashes[rel]["local"] == hashes[rel]["remote"]
            syntax[rel] = run(ssh, f"if test -f {shlex.quote(remote)}; then node --check {shlex.quote(remote)} >/dev/null && echo PASS || echo FAIL; else echo MISSING; fi").strip()
        readiness = {}
        for node in sorted(nodes, key=lambda x: str(x.get("name"))):
            port = str(node.get("httpPort") or "")
            if port.isdigit():
                readiness[port] = run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 10 http://127.0.0.1:{int(port)}/ready").strip()
        result = {
            "at": datetime.now(timezone.utc).isoformat(),
            "readOnly": True,
            "productionWrites": 0,
            "nodes": nodes,
            "hashes": hashes,
            "syntax": syntax,
            "readiness": readiness,
        }
        (out_dir / "remote_inventory.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
