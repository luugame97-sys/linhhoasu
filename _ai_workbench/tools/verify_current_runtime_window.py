#!/usr/bin/env python3
"""Read-only metrics from only the latest lhs-s1001 runtime marker."""
import getpass
import json
import math
import re
import statistics
from collections import defaultdict

import paramiko


def percentile(values, p):
    if not values:
        return 0.0
    values = sorted(values)
    index = min(len(values) - 1, max(0, int((len(values) - 1) * p)))
    return values[index]


password = getpass.getpass("VPS password (not logged): ")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("103.116.105.154", username="root", password=password,
            look_for_keys=False, allow_agent=False, timeout=15)
try:
    cmd = "f=/root/.pm2/logs/lhs-s1001-out.log; n=$(grep -n '\\[WSServer\\] runtime ready revision=' $f | tail -1 | cut -d: -f1); tail -n +$n $f"
    _, out, err = ssh.exec_command(cmd)
    text = out.read().decode("utf-8", "replace")
    out.channel.recv_exit_status()
    metrics = defaultdict(list)
    enter = []
    closes = []
    new = []
    flags = []
    for line in text.splitlines():
        m = re.search(r"\[Perf\]\[WS\].*?tag=(\d+).*?totalMs=([\d.]+)", line)
        if m:
            metrics[int(m.group(1))].append(float(m.group(2)))
        m = re.search(r"handler enter ws#(\d+) tag=(\d+) msgUid=(\d+) queueDepth=(\d+)", line)
        if m:
            enter.append(tuple(int(x) for x in m.groups()))
        if "socket closed" in line:
            closes.append(line)
        if "新连接" in line:
            new.append(line)
        if re.search(r"scheduleFarmPlayerSave|handler stuck|handler still pending|deadline exceeded|queue wait|slow send|heartbeat timeout|send failed|EPIPE|unhandled rejection|处理 tag=.*失败", line, re.I):
            flags.append(line)
    all_values = [value for values in metrics.values() for value in values]
    marker = next((x for x in text.splitlines() if "runtime ready revision=" in x), "")
    print("MARKER", marker)
    print("OVERALL", {"n": len(all_values), "p50": round(percentile(all_values, .5), 1),
                      "p95": round(percentile(all_values, .95), 1), "p99": round(percentile(all_values, .99), 1),
                      "max": round(max(all_values), 1) if all_values else 0,
                      "over500": sum(v >= 500 for v in all_values), "over3000": sum(v >= 3000 for v in all_values)})
    print("QUEUE", {"n": len(enter), "p95": percentile([x[3] for x in enter], .95),
                    "max": max([x[3] for x in enter], default=0), "over3": sum(x[3] > 3 for x in enter)})
    print("SOCKET", {"new": len(new), "closed": len(closes)})
    for tag, values in sorted(metrics.items(), key=lambda pair: percentile(pair[1], .95), reverse=True)[:20]:
        print("TAG", tag, {"n": len(values), "avg": round(statistics.mean(values), 1),
                            "p95": round(percentile(values, .95), 1), "max": round(max(values), 1)})
    print("TAG2403", {"n": len(metrics.get(2403, [])), "values": metrics.get(2403, [])[-20:]})
    print("FLAGS")
    for line in flags[-80:]:
        line = re.sub(r"(user=)([^ ]+)", r"\1[REDACTED]", line)
        print(line)
finally:
    ssh.close()
