"""Bounded read-only S6 runtime profiling; no signals, restarts, or writes."""
from __future__ import annotations

import json
import re
import shlex
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PID = 10612


def command(ssh, text, timeout=60):
    return run(ssh, text)


def main():
    ssh = connect()
    try:
        pid = int(command(ssh, "pm2 pid lhs-s1006 | tail -1").strip() or PID)
        start = datetime.now(timezone.utc).isoformat()
        host = command(ssh, "printf 'nproc='; nproc; printf 'loadavg='; cat /proc/loadavg; printf 'mem='; free -m | awk 'NR==2{print $2,$3,$7}'").strip()
        availability = command(ssh, "for x in pidstat perf top vmstat mongostat redis-cli; do command -v $x 2>/dev/null || true; done").strip().splitlines()
        health = []
        samples = []
        for _ in range(8):
            ps = command(ssh, f"ps -p {pid} -o pid,pcpu,pmem,rss,etime,stat,comm 2>/dev/null || true").strip()
            threads = command(ssh, f"ps -L -p {pid} -o tid,pcpu,stat,comm --sort=-pcpu 2>/dev/null | head -n 8 || true").strip()
            health_raw = command(ssh, "curl -fsS --connect-timeout 2 --max-time 8 http://127.0.0.1:9205/health || true").strip()
            ready_raw = command(ssh, "curl -sS -o /dev/null -w '%{http_code} %{time_total}' --connect-timeout 2 --max-time 8 http://127.0.0.1:8087/ready || true").strip()
            try:
                health.append(json.loads(health_raw))
            except Exception:
                health.append({"raw": health_raw[:200]})
            samples.append({"pid": ps, "threads": threads, "ready": ready_raw})
            time.sleep(2)
        vmstat = command(ssh, "vmstat 1 5", timeout=20).strip()
        top_threads = command(ssh, f"top -H -b -n 3 -d 1 -p {pid} 2>/dev/null | tail -n 90 || true", timeout=15).strip()
        mongo = command(ssh, "timeout 8 mongostat --noheaders --rowcount 3 --json 2>/dev/null || true", timeout=12).strip()
        redis = command(ssh, "redis-cli INFO stats 2>/dev/null | grep -E 'instantaneous_ops_per_sec|rejected_connections|connected_clients' || true").strip()
        log_tail = command(ssh, "pm2 logs lhs-s1006 --lines 1200 --nostream 2>&1 | tail -n 1200", timeout=30)
        slow = []
        queue = []
        errors = Counter()
        for line in log_tail.splitlines():
            m = re.search(r"slow tag=(\d+).*?elapsed=(\d+)ms(?:.*?route=(\d+)ms post=(\d+)ms tail=(\d+)ms)?", line)
            if m:
                slow.append({"tag": int(m.group(1)), "elapsedMs": int(m.group(2)), "routeMs": int(m.group(3) or 0), "postMs": int(m.group(4) or 0), "tailMs": int(m.group(5) or 0)})
            m = re.search(r"queue (?:backlog|wait).*?(?:tag=(\d+))?.*?(?:depth=|wait=)(\d+)", line)
            if m:
                queue.append(line[:260])
            if re.search(r"MongoDB operation timeout|handler stuck|uncaught|unhandled|EPIPE|FATAL", line, re.I):
                key = re.sub(r"user=\S+", "user=[REDACTED]", line).strip()[:260]
                errors[key] += 1
        result = {
            "scope": "read-only", "startedAt": start, "completedAt": datetime.now(timezone.utc).isoformat(),
            "pid": pid, "host": host, "availableTools": availability, "samples": samples,
            "health": [{"status": (x.get("status") if isinstance(x, dict) else None), "clients": ((x.get("runtime") or {}).get("clients") if isinstance(x, dict) else None), "botCount": (((x.get("runtime") or {}).get("bots") or {}).get("botCount") if isinstance(x, dict) else None), "realCount": (((((x.get("runtime") or {}).get("bots") or {}).get("real") or {}).get("count")) if isinstance(x, dict) else None)} for x in health],
            "vmstat": vmstat, "topThreads": top_threads, "mongo": mongo, "redis": redis,
            "slowSummary": {"count": len(slow), "byTag": dict(Counter(str(x["tag"]) for x in slow)), "maxMs": max((x["elapsedMs"] for x in slow), default=0), "p95Ms": sorted((x["elapsedMs"] for x in slow))[min(len(slow)-1, int(len(slow)*0.95))] if slow else 0},
            "slowTail": slow[-80:], "queueEvidenceCount": len(queue), "queueTail": queue[-80:], "errorGroups": errors.most_common(30),
        }
        out = ROOT / "_ai_workbench" / "temp" / f"s6_readonly_profile_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(json.dumps({"evidence": str(out), "pid": pid, "slowCount": len(slow), "queueEvidence": len(queue)}))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
