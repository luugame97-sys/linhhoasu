#!/usr/bin/env python3
"""Read-only final 10-minute post-hotfix metrics."""
import getpass
import re
import statistics
from collections import Counter, defaultdict
import paramiko

HOST = "103.116.105.154"
LOG = "/linhhoasu/lhs/newServer/logs/combined-2026-08-30.log"

def pct(vals, p):
    if not vals:
        return 0.0
    a = sorted(vals)
    return a[min(len(a)-1, max(0, int((len(a)-1)*p)))]

password = getpass.getpass("VPS password (not logged): ")
ssh = paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=15)
try:
    sftp = ssh.open_sftp()
    try:
        with sftp.open(LOG, "rb") as fh:
            lines = fh.read().decode("utf-8", "replace").splitlines()
    finally:
        sftp.close()
    markers = [i for i, line in enumerate(lines) if "runtime ready revision=" in line]
    start = markers[-1] if markers else 0
    cur = lines[start:]
    perf = defaultdict(list); queue=[]; errors=[]; warnings=[]; closes=[]; opens=[]; nonzero=[]
    for line in cur:
        m = re.search(r"\[Perf\]\[WS\].*?tag=(\d+).*?totalMs=([\d.]+)", line)
        if m: perf[int(m.group(1))].append(float(m.group(2)))
        m = re.search(r"handler enter .*?tag=(\d+).*?queueDepth=(\d+)", line)
        if m: queue.append((int(m.group(1)), int(m.group(2))))
        if re.search(r"处理 tag=.*失败|unhandled rejection|uncaught exception|send failed|EPIPE|Connection is closed|SyntaxError", line, re.I): errors.append(line)
        if re.search(r"slow tag=|handler stuck|handler still pending|deadline exceeded|queue wait|save queue backlog|heartbeat timeout|heartbeat failed|rate limited", line, re.I): warnings.append(line)
        if "socket closed" in line: closes.append(line)
        if "新连接" in line: opens.append(line)
        m = re.search(r"buffered=(\d+)", line)
        if m and int(m.group(1)) > 0: nonzero.append(line)
    vals=[x for v in perf.values() for x in v]; depths=[x[1] for x in queue]
    print("MARKER", cur[0] if cur else "none")
    print("PERF", {"n":len(vals),"p50":round(pct(vals,.5),1),"p95":round(pct(vals,.95),1),"p99":round(pct(vals,.99),1),"max":round(max(vals),1) if vals else 0,"over500":sum(x>=500 for x in vals),"over3000":sum(x>=3000 for x in vals)})
    print("QUEUE", {"n":len(depths),"p95":pct(depths,.95),"max":max(depths,default=0),"over3":sum(x>3 for x in depths)})
    print("EVENTS", {"errors":len(errors),"warnings":len(warnings),"opens":len(opens),"closes":len(closes),"bufferedNonZero":len(nonzero),"tag2403":len(perf.get(2403,[])),"tag2403Ms":perf.get(2403,[])})
    for tag, values in sorted(perf.items(), key=lambda kv:pct(kv[1],.95), reverse=True)[:18]:
        print("TAG",tag,"n",len(values),"avg",round(statistics.mean(values),1),"p95",round(pct(values,.95),1),"max",round(max(values),1))
    for label, rows in (("ERROR",errors),("WARNING",warnings),("CLOSE",closes)):
        print(label+"_TAIL")
        for line in rows[-20:]: print(re.sub(r"(user=)([^ ]+)",r"\1[REDACTED]",line)[:500])
finally:
    ssh.close()
