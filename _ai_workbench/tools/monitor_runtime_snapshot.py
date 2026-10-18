#!/usr/bin/env python3
"""Read-only production runtime snapshot for lag/freeze investigation.

The script deliberately does not mutate the VPS, restart PM2, or print secrets.
"""
import getpass
import json
import re
import statistics
from collections import Counter, defaultdict

import paramiko

HOST = "103.116.105.154"
OUT = "/root/.pm2/logs/lhs-s1001-out.log"
ERR = "/root/.pm2/logs/lhs-s1001-error.log"


def run(ssh, cmd):
    _, out, err = ssh.exec_command(cmd)
    text = out.read().decode("utf-8", "replace")
    code = out.channel.recv_exit_status()
    return code, text, err.read().decode("utf-8", "replace")


def pct(values, p):
    if not values:
        return 0.0
    values = sorted(values)
    return values[min(len(values) - 1, max(0, int((len(values) - 1) * p)))]


def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=15)
    try:
        commands = {
            "clock": "date '+%Y-%m-%d %H:%M:%S %z'; uptime",
            "pm2": "pm2 jlist",
            "health": "curl -sS http://127.0.0.1:9200/health; echo; curl -sS http://127.0.0.1:8080/ready; echo",
            "listeners": "ss -ltnp | grep -E ':(8080|9200)\\b' || true",
            "conns": "ss -tn state established | awk '$4 ~ /:9200$/ {print $4, $5}'",
            "runtime": "grep -n '\\[WSServer\\] runtime ready revision=' /root/.pm2/logs/lhs-s1001-out.log | tail -5",
            "out": "f=/root/.pm2/logs/lhs-s1001-out.log; n=$(grep -n '\\[WSServer\\] runtime ready revision=' $f | tail -1 | cut -d: -f1); if [ -n \"$n\" ]; then tail -n +$n $f; else tail -n 10000 $f; fi",
            "err": "tail -n 30000 /root/.pm2/logs/lhs-s1001-error.log",
            "outflags": "f=/root/.pm2/logs/lhs-s1001-out.log; n=$(grep -n '\\[WSServer\\] runtime ready revision=' $f | tail -1 | cut -d: -f1); if [ -n \"$n\" ]; then tail -n +$n $f | grep -Ei 'RepeatRpcBlockModel|10000|7063|timeout|pending|stuck|queue wait|queue backlog|rate limited|message too short|failed|error|close handler|socket error|slow|freeze' | tail -n 300; fi",
            "errmeta": "stat -c 'ERR_SIZE=%s ERR_MTIME=%y' /root/.pm2/logs/lhs-s1001-error.log; wc -l /root/.pm2/logs/lhs-s1001-error.log",
        }
        results = {}
        for key, cmd in commands.items():
            code, out, err = run(ssh, cmd)
            results[key] = out
            if err.strip():
                print(f"CMDERR {key}: {err[-500:]}")
        print("CLOCK\n" + results["clock"].strip())
        try:
            rows = json.loads(results["pm2"])
            for name in ("lhs-s1001", "lhs-dist", "lhs-admin"):
                row = next((x for x in rows if x.get("name") == name), {})
                env = row.get("pm2_env") or {}
                mon = row.get("monit") or {}
                axm = env.get("axm_monitor") or {}
                print("PM2", name, {
                    "status": env.get("status"), "pid": row.get("pid"),
                    "restarts": env.get("restart_time"), "cpu": mon.get("cpu"),
                    "memoryMB": round((mon.get("memory") or 0) / 1048576, 1),
                    "loopP50": (axm.get("Event Loop Latency") or {}).get("value"),
                    "loopP95": (axm.get("Event Loop Latency p95") or {}).get("value"),
                })
        except Exception as exc:
            print("PM2_PARSE_ERROR", repr(exc))
        print("HEALTH\n" + results["health"].strip())
        print("LISTENERS\n" + results["listeners"].strip())
        print("CONNECTIONS\n" + results["conns"].strip())
        print("RUNTIME_MARKERS\n" + results["runtime"].strip())
        print("OUT_FLAGS\n" + results["outflags"].strip())
        print("ERROR_META\n" + results["errmeta"].strip())

        out = results["out"]
        err = results["err"]
        perf = defaultdict(list)
        slow = []
        enters = []
        queue_wait = []
        socket_closed = []
        socket_new = []
        heartbeat = []
        sends = []
        pending = []
        errors = []
        compact_events = []
        # Keep only compact evidence lines; user IDs are intentionally redacted.
        for line in out.splitlines():
            m = re.search(r"\[Perf\]\[WS\].*?tag=(\d+).*?totalMs=([\d.]+)(?:.*?routeMs=([\d.]+))?(?:.*?postMs=([\d.]+))?(?:.*?tailMs=([\d.]+))?", line)
            if m:
                perf[int(m.group(1))].append(tuple(float(x or 0) for x in m.groups()[1:]))
            if "[WSServer] slow tag=" in line:
                slow.append(line)
            if "handler enter " in line:
                enters.append(line)
            if "queue wait " in line:
                queue_wait.append(line)
            if "socket closed " in line:
                socket_closed.append(line)
            if "新连接" in line or "new connection" in line.lower():
                socket_new.append(line)
            if "heartbeat" in line.lower():
                heartbeat.append(line)
            if "slow send" in line.lower() or "buffered=" in line.lower():
                sends.append(line)
            if "handler still pending" in line or "handler stuck" in line or "deadline exceeded" in line:
                pending.append(line)
            if any(token in line for token in ("handler enter ", "[Perf][WS]", "queue backlog ", "queue wait ", "socket closed ", "新连接 ")):
                # Preserve timestamp/ws/tag/timing while dropping account IDs and payloads.
                clean = re.sub(r" user=[^ ]+", " user=[REDACTED]", line)
                clean = re.sub(r"(from )[^ ]+", r"\1[REDACTED]", clean)
                compact_events.append(clean)
        for line in err.splitlines():
            if re.search(r"error|exception|timeout|failed|closed|syntaxerror", line, re.I):
                errors.append(line)

        allvals = [x[0] for vals in perf.values() for x in vals]
        print("PERF", {"count": len(allvals), "p50": round(pct(allvals, .5), 1),
                        "p95": round(pct(allvals, .95), 1), "p99": round(pct(allvals, .99), 1),
                        "max": round(max(allvals), 1) if allvals else 0,
                        "over300": sum(v >= 300 for v in allvals),
                        "over500": sum(v >= 500 for v in allvals),
                        "over3000": sum(v >= 3000 for v in allvals)})
        for tag, vals in sorted(perf.items(), key=lambda kv: pct([x[0] for x in kv[1]], .95), reverse=True)[:25]:
            totals = [x[0] for x in vals]
            norms = [x[1] for x in vals if len(x) > 1 and x[1] is not None]
            print("TAG", tag, {"n": len(vals), "avg": round(statistics.mean(totals), 1),
                                "p95": round(pct(totals, .95), 1), "max": round(max(totals), 1),
                                "normAvg": round(statistics.mean(norms), 1) if norms else 0})
        print("COUNTS", {"enter": len(enters), "queueWait": len(queue_wait), "slow": len(slow),
                          "closed": len(socket_closed), "new": len(socket_new), "heartbeat": len(heartbeat),
                          "sendEvidence": len(sends), "pending": len(pending), "errors": len(errors)})
        for label, seq in (("QUEUE_WAIT", queue_wait), ("SLOW", slow), ("PENDING", pending),
                           ("HEARTBEAT", heartbeat), ("CLOSED", socket_closed), ("NEW", socket_new),
                           ("SEND", sends), ("ERROR", errors)):
            print(label + "_TAIL")
            for line in seq[-40:]:
                # redact account-like values while retaining ws/tag/timing evidence.
                line = re.sub(r"(user=)([^ ]+)", r"\1[REDACTED]", line)
                print(line)
        print("EVENTS_TAIL")
        for line in compact_events[-120:]:
            print(line)
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
