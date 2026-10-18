"""Read-only post-canary audit for S6 virtual-bot disable."""
from __future__ import annotations

import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from deploy_s6_disable_virtual_bots_20260927 import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench" / "temp" / "s6_disable_real_worker_20260927_170142" / ("post_audit_" + datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S") + ".json")


def sample(ssh):
    js = """let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const names=['lhs-s1001','lhs-s1002','lhs-s1003','lhs-s1004','lhs-s1005','lhs-s1006','lhs-real-bots-s6']; const a=JSON.parse(s).filter(p=>names.includes(p.name)).map(p=>{const e=p.pm2_env||{};const v={...(e.env||{}),...e};return {name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time,cpu:p.monit&&p.monit.cpu,rss:p.monit&&p.monit.memory,env:Object.fromEntries(Object.entries(v).filter(([k])=>['BOT_ENABLED','BOT_COUNT_PER_MAP','BOT_MAX_TOTAL','BOT_WORKER_LAZY_MAX_ACTIVE'].includes(k)))};});console.log(JSON.stringify(a));});"""
    pm2 = json.loads(run(ssh, "pm2 jlist | node -e " + shlex.quote(js)))
    probes = {}
    for port, path in [(8087, "ready"), (9205, "health")]:
        raw = run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}} %{{time_total}}' --connect-timeout 2 --max-time 8 http://127.0.0.1:{port}/{path} || true").strip()
        code, _, seconds = raw.partition(" ")
        probes[f"{port}/{path}"] = {"code": code, "seconds": seconds}
    health_raw = run(ssh, "curl -fsS --connect-timeout 2 --max-time 8 http://127.0.0.1:9205/health || true").strip()
    try:
        health = json.loads(health_raw)
    except Exception:
        health = {"raw": health_raw[:500]}
    return {"at": datetime.now(timezone.utc).isoformat(), "pm2": pm2, "probes": probes, "health": health}


def main():
    ssh = connect()
    try:
        out = {"scope": "read-only", "samples": []}
        for i in range(3):
            out["samples"].append(sample(ssh))
            if i < 2:
                time.sleep(20)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"evidence": str(OUT), "samples": len(out["samples"])}))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
