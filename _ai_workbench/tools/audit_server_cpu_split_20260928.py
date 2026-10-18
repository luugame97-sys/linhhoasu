"""Read-only VPS CPU/process split audit for S1-S6."""
from __future__ import annotations

import json
import shlex
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run  # noqa: E402


def main():
    ssh = connect()
    try:
        names = [f"lhs-s{sid}" for sid in range(1001, 1007)] + [f"lhs-real-bots-s{sid - 1000}" for sid in range(1002, 1007)] + ["lhs-real-bots", "lhs-bot-fleet-supervisor"]
        js = """let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const n=new Set(%s);console.log(JSON.stringify(JSON.parse(s).filter(p=>n.has(p.name)).map(p=>{const e=p.pm2_env||{};return {name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time,cpu:p.monit&&p.monit.cpu,rss:p.monit&&p.monit.memory,uptime:e.pm_uptime};})));});""" % json.dumps(names)
        pm2 = json.loads(run(ssh, "pm2 jlist | node -e " + shlex.quote(js)))
        host = run(ssh, "printf 'nproc='; nproc; printf 'loadavg='; cat /proc/loadavg; printf 'mem='; free -m | awk 'NR==2{print $2,$3,$7}'; printf 'cpus_allowed='; grep -m1 Cpus_allowed_list /proc/1/status | awk '{print $2}'").strip()
        top = run(ssh, "ps -eo pid,pcpu,pmem,rss,comm,args --sort=-pcpu | head -n 28").strip()
        affinity = {}
        for row in pm2:
            pid = int(row.get("pid") or 0)
            if pid <= 0:
                continue
            raw = run(ssh, f"taskset -pc {pid} 2>/dev/null || true").strip()
            affinity[row["name"]] = raw
        logs = run(ssh, "pm2 logs lhs-s1006 --lines 180 --nostream 2>&1 | tail -n 180 | grep -Ei 'queue backlog|queue wait|handler stuck|MongoDB operation timeout|heartbeat|slow|timeout' | tail -n 80 || true").strip()
        result = {"scope": "read-only", "host": host, "pm2": pm2, "affinity": affinity, "top": top, "s6RelevantLogs": logs}
        out = Path(__file__).resolve().parents[2] / "_ai_workbench" / "temp" / "server_cpu_split_20260928.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(json.dumps({"evidence": str(out), "processes": len(pm2)}))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
