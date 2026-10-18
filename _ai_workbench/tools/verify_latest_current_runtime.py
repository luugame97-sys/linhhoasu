#!/usr/bin/env python3
"""Read-only full verification against newest runtime marker in Winston log."""
import getpass
import json
import re
import statistics
from collections import Counter, defaultdict

import paramiko

HOST = "103.116.105.154"
LOG = "/linhhoasu/lhs/newServer/logs/combined-2026-08-30.log"


def pct(values, p):
    if not values:
        return 0.0
    values = sorted(values)
    return values[min(len(values) - 1, max(0, int((len(values) - 1) * p)))]


password = getpass.getpass("VPS password (not logged): ")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username="root", password=password, look_for_keys=False,
            allow_agent=False, timeout=15)
try:
    sftp = ssh.open_sftp()
    try:
        with sftp.open(LOG, "rb") as handle:
            raw = handle.read()
    finally:
        sftp.close()
    lines = raw.decode("utf-8", "replace").splitlines()
    starts = [i for i, line in enumerate(lines) if "runtime ready revision=" in line]
    start = starts[-1] if starts else max(0, len(lines) - 10000)
    current = lines[start:]
    marker = current[0] if current else ""
    perf = defaultdict(list)
    queue = []
    errors = []
    warnings = []
    sends = []
    closes = []
    opens = []
    heartbeat = []
    for line in current:
        m = re.search(r"\[Perf\]\[WS\].*?tag=(\d+).*?totalMs=([\d.]+)", line)
        if m:
            perf[int(m.group(1))].append(float(m.group(2)))
        m = re.search(r"handler enter .*?tag=(\d+).*?queueDepth=(\d+)", line)
        if m:
            queue.append((int(m.group(1)), int(m.group(2))))
        if re.search(r"处理 tag=.*失败|unhandled rejection|uncaught exception|send failed|EPIPE|Connection is closed|SyntaxError", line, re.I):
            errors.append(line)
        if re.search(r"slow tag=|handler stuck|handler still pending|deadline exceeded|queue wait|save queue backlog|heartbeat timeout|heartbeat failed|rate limited", line, re.I):
            warnings.append(line)
        if "slow send" in line or ("发送 tag=" in line and "buffered=" in line):
            sends.append(line)
        if "socket closed" in line:
            closes.append(line)
        if "新连接" in line:
            opens.append(line)
        if "发送 tag=11" in line:
            heartbeat.append(line)
    all_values = [value for rows in perf.values() for value in rows]
    print("MARKER", marker)
    print("LINES", len(current))
    print("PERF", {"n": len(all_values), "p50": round(pct(all_values, .5), 1),
                   "p95": round(pct(all_values, .95), 1), "p99": round(pct(all_values, .99), 1),
                   "max": round(max(all_values), 1) if all_values else 0,
                   "over300": sum(v >= 300 for v in all_values),
                   "over500": sum(v >= 500 for v in all_values),
                   "over3000": sum(v >= 3000 for v in all_values)})
    depths = [x[1] for x in queue]
    print("QUEUE", {"n": len(depths), "p95": pct(depths, .95), "max": max(depths, default=0),
                    "over3": sum(v > 3 for v in depths)})
    print("EVENTS", {"errors": len(errors), "warnings": len(warnings), "opens": len(opens),
                     "closes": len(closes), "heartbeats": len(heartbeat), "sends": len(sends),
                     "bufferedNonZero": sum(not re.search(r"buffered=0(?:\D|$)", x) for x in sends)})
    for tag, values in sorted(perf.items(), key=lambda pair: pct(pair[1], .95), reverse=True)[:25]:
        print("TAG", tag, {"n": len(values), "avg": round(statistics.mean(values), 1),
                           "p95": round(pct(values, .95), 1), "max": round(max(values), 1)})
    print("TAG2403", perf.get(2403, []))
    for label, rows in (("ERROR", errors), ("WARNING", warnings), ("CLOSE", closes)):
        print(label + "_TAIL")
        for line in rows[-50:]:
            print(re.sub(r"(user=)([^ ]+)", r"\1[REDACTED]", line)[:600])
finally:
    ssh.close()
