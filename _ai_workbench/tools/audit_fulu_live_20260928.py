"""Read-only live audit for Activity52 (Thiên Giáng Phúc Lộc).

Does not authenticate a player, send game RPCs, or mutate VPS/DB state.
"""
from __future__ import annotations

import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench" / "temp" / "fulu_live_audit_20260928.json"
REMOTE_ACTIVITY = "/linhhoasu/lhs/newServer/src/handlers/activity.js"
REMOTE_CONFIG = "/linhhoasu/lhs/newServer/scripts/_tables_dump/Activity52Config.json"
REMOTE_ARRANGE = "/linhhoasu/lhs/newServer/scripts/_tables_dump/Activity52ArrangeConfig.json"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sftp_read(sftp, path: str) -> bytes | None:
    try:
        with sftp.open(path, "rb") as handle:
            return handle.read()
    except FileNotFoundError:
        return None


def main() -> None:
    result: dict[str, object] = {
        "scope": "read-only",
        "at": datetime.now(timezone.utc).isoformat(),
        "local": {},
        "remote": {},
    }
    local_activity = ROOT / "linhhoasu" / "lhs" / "newServer" / "src" / "handlers" / "activity.js"
    local_config = ROOT / "linhhoasu" / "lhs" / "newServer" / "scripts" / "_tables_dump" / "Activity52Config.json"
    local_arrange = ROOT / "linhhoasu" / "lhs" / "newServer" / "scripts" / "_tables_dump" / "Activity52ArrangeConfig.json"
    for key, path in (("activity", local_activity), ("config", local_config), ("arrange", local_arrange)):
        data = path.read_bytes()
        result["local"][key] = {"path": str(path), "bytes": len(data), "sha256": sha256_bytes(data)}

    ssh = connect()
    try:
        with ssh.open_sftp() as sftp:
            for key, path in (("activity", REMOTE_ACTIVITY), ("config", REMOTE_CONFIG), ("arrange", REMOTE_ARRANGE)):
                data = sftp_read(sftp, path)
                result["remote"][key] = None if data is None else {
                    "path": path,
                    "bytes": len(data),
                    "sha256": sha256_bytes(data),
                    "matchesLocal": data == {
                        "activity": local_activity,
                        "config": local_config,
                        "arrange": local_arrange,
                    }[key].read_bytes(),
                }

        pm2_js = (
            "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{"
            "const a=JSON.parse(s).filter(p=>/^lhs-s100[1-6]$/.test(p.name));"
            "console.log(JSON.stringify(a.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status," 
            "restarts:p.pm2_env.restart_time,cpu:p.monit&&p.monit.cpu,rss:p.monit&&p.monit.memory," 
            "script:p.pm2_env.pm_exec_path,cwd:p.pm2_env.pm_cwd}))))});"
        )
        result["remote"]["pm2"] = json.loads(run(ssh, "pm2 jlist | node -e " + shlex.quote(pm2_js)))
        health: dict[str, object] = {}
        for server, port in (("S1", 8080), ("S2", 8083), ("S3", 8084), ("S4", 8085), ("S5", 8086), ("S6", 8087)):
            raw = run(
                ssh,
                f"curl -sS -o /dev/null -w '%{{http_code}} %{{time_total}}' --connect-timeout 2 --max-time 5 http://127.0.0.1:{port}/ready || true",
            ).strip()
            code, _, seconds = raw.partition(" ")
            health[server] = {"port": port, "code": code, "seconds": seconds}
        result["remote"]["readiness"] = health

        # Bounded log sample only; no player payloads are collected.
        log_cmd = (
            "for n in lhs-s1001 lhs-s1002 lhs-s1003 lhs-s1004 lhs-s1005 lhs-s1006; do "
            "echo ===$n===; pm2 logs $n --lines 400 --nostream 2>/dev/null | "
            "grep -E '1700|1775|Activity52|52001|ACTIVITY_SAVE_NOT_CONFIRMED' | tail -n 40 || true; done"
        )
        logs = run(ssh, log_cmd)
        lines = [line for line in logs.splitlines() if line.strip()]
        result["remote"]["activityLogSample"] = {
            "lines": lines,
            "counts": {
                "1700": sum("1700" in line for line in lines),
                "1775": sum("1775" in line for line in lines),
                "activity52": sum("Activity52" in line or "52001" in line for line in lines),
                "saveFailure": sum("ACTIVITY_SAVE_NOT_CONFIRMED" in line for line in lines),
            },
        }
    finally:
        ssh.close()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"evidence": str(OUT), "scope": "read-only"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
