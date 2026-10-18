#!/usr/bin/env python3
"""Read-only live delay diagnosis for lhs-s1001."""
import getpass
import json
import math
import re
import statistics
from collections import defaultdict
from datetime import datetime, timedelta

import paramiko

HOST = '103.116.105.154'
OUT_LOG = '/root/.pm2/logs/lhs-s1001-out.log'
ERR_LOG = '/root/.pm2/logs/lhs-s1001-error.log'
READ_BYTES = 16 * 1024 * 1024


def run(ssh, command):
    _, stdout, stderr = ssh.exec_command(command)
    out = stdout.read().decode('utf-8', 'replace')
    err = stderr.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    return code, out, err


def tail_bytes(sftp, path, limit=READ_BYTES):
    stat = sftp.stat(path)
    with sftp.open(path, 'rb') as fh:
        fh.seek(max(0, stat.st_size - limit))
        data = fh.read().decode('utf-8', 'replace')
    if stat.st_size > limit:
        data = data.split('\n', 1)[-1]
    return data


def percentile(values, p):
    if not values:
        return 0.0
    values = sorted(values)
    index = (len(values) - 1) * p
    lo, hi = math.floor(index), math.ceil(index)
    if lo == hi:
        return values[lo]
    return values[lo] * (hi - index) + values[hi] * (index - lo)


password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)
try:
    _, server_now_raw, _ = run(ssh, "date '+%Y-%m-%d %H:%M:%S %z'")
    server_now = datetime.strptime(server_now_raw.strip()[:19], '%Y-%m-%d %H:%M:%S')
    cutoff = server_now - timedelta(minutes=20)
    print(f'WINDOW={cutoff}..{server_now} server-local')

    _, pm2_raw, _ = run(ssh, 'pm2 jlist')
    rows = json.loads(pm2_raw)
    for name in ('lhs-s1001', 'lhs-dist', 'lhs-admin'):
        row = next((x for x in rows if x.get('name') == name), None)
        if not row:
            print(f'PM2 {name}=missing')
            continue
        env = row.get('pm2_env') or {}
        mon = row.get('monit') or {}
        print(f"PM2 {name}=status:{env.get('status')} pid:{row.get('pid')} restarts:{env.get('restart_time')} cpu:{mon.get('cpu')}% memMB:{round((mon.get('memory') or 0)/1048576,1)}")

    system_cmd = "uptime; free -m | sed -n '1,3p'; df -h / | tail -1; vmstat 1 5 | tail -5; ps -eo pid,comm,%cpu,%mem --sort=-%cpu | head -8"
    _, system_out, _ = run(ssh, system_cmd)
    print('SYSTEM_START')
    print(system_out.strip())
    print('SYSTEM_END')

    http_cmd = "for i in $(seq 1 12); do curl -sS -o /dev/null -w '%{http_code} %{time_connect} %{time_starttransfer} %{time_total}\\n' http://127.0.0.1:8080/ready; done"
    _, http_out, _ = run(ssh, http_cmd)
    print('HTTP_LOCAL_SAMPLES=' + ' | '.join(x.strip() for x in http_out.splitlines() if x.strip()))

    sftp = ssh.open_sftp()
    try:
        out_log = tail_bytes(sftp, OUT_LOG)
        err_log = tail_bytes(sftp, ERR_LOG, 4 * 1024 * 1024)
    finally:
        sftp.close()

    perf_re = re.compile(r'\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\].*?\[Perf\]\[WS\].*?tag=(\d+).*?totalMs=([\d.]+)(?:.*?taskNormalizeMs=([\d.]+))?')
    queue_re = re.compile(r'\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\].*?handler enter .*?tag=(\d+).*?queueDepth=(\d+)')
    per_tag = defaultdict(list)
    normalize = defaultdict(list)
    queues = []
    for line in out_log.splitlines():
        match = perf_re.search(line)
        if match:
            ts = datetime.strptime(match.group(1), '%Y-%m-%d %H:%M:%S')
            if ts >= cutoff:
                tag = int(match.group(2)); per_tag[tag].append(float(match.group(3)))
                if match.group(4): normalize[tag].append(float(match.group(4)))
            continue
        match = queue_re.search(line)
        if match:
            ts = datetime.strptime(match.group(1), '%Y-%m-%d %H:%M:%S')
            if ts >= cutoff:
                queues.append((int(match.group(2)), int(match.group(3))))

    all_perf = [value for values in per_tag.values() for value in values]
    if all_perf:
        print(f'PERF overall count={len(all_perf)} avg={statistics.mean(all_perf):.1f} p50={percentile(all_perf,.5):.1f} p95={percentile(all_perf,.95):.1f} p99={percentile(all_perf,.99):.1f} max={max(all_perf):.1f} over300={sum(v>=300 for v in all_perf)} over500={sum(v>=500 for v in all_perf)} over1000={sum(v>=1000 for v in all_perf)}')
        ranked = sorted(per_tag.items(), key=lambda pair: (percentile(pair[1], .95), max(pair[1])), reverse=True)
        for tag, values in ranked[:18]:
            norm_values = normalize.get(tag, [])
            norm = statistics.mean(norm_values) if norm_values else 0.0
            print(f'TAG {tag} count={len(values)} avg={statistics.mean(values):.1f} p95={percentile(values,.95):.1f} max={max(values):.1f} normalizeAvg={norm:.1f}')
    else:
        print('PERF no-samples-in-window')

    if queues:
        depths = [depth for _, depth in queues]
        print(f'QUEUE count={len(depths)} avg={statistics.mean(depths):.2f} p95={percentile(depths,.95):.1f} max={max(depths)} over1={sum(d>1 for d in depths)} over3={sum(d>3 for d in depths)}')
        qtags = defaultdict(list)
        for tag, depth in queues: qtags[tag].append(depth)
        for tag, values in sorted(qtags.items(), key=lambda pair:max(pair[1]), reverse=True)[:12]:
            print(f'QUEUE_TAG {tag} count={len(values)} avg={statistics.mean(values):.2f} max={max(values)}')
    else:
        print('QUEUE no-samples-in-window')

    recent_errors=[]
    for line in err_log.splitlines():
        if any(token in line.lower() for token in ('error', 'timeout', 'failed', 'econn', 'slow')):
            recent_errors.append(line[-500:])
    print(f'ERROR_MATCHES_TAIL={len(recent_errors)}')
    for line in recent_errors[-20:]:
        print('ERR ' + line)
finally:
    ssh.close()
