import paramiko
import json
import time

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.104.165', username='root', password='anhduc11')

def exec_cmd(cmd):
    _, out, err = client.exec_command(cmd)
    return out.read().decode('utf-8', 'replace'), err.read().decode('utf-8', 'replace')

print("=== 1. VPS UPTIME & HOST METRICS ===")
out, _ = exec_cmd("uptime; free -h")
print(out.strip())

print("\n=== 2. PM2 PROCESS STATS (CPU & MEMORY) ===")
out, _ = exec_cmd("pm2 jlist")
try:
    processes = json.loads(out)
    for p in sorted(processes, key=lambda x: x.get('name', '')):
        name = p.get('name', '')
        cpu = p.get('monit', {}).get('cpu', 0)
        mem = p.get('monit', {}).get('memory', 0) // (1024 * 1024)
        status = p.get('pm2_env', {}).get('status', 'unknown')
        uptime = p.get('pm2_env', {}).get('pm_uptime', 0)
        restart_time = p.get('pm2_env', {}).get('restart_time', 0)
        uptime_str = f"{(time.time()*1000 - uptime) // 60000:.0f}m" if uptime else "?"
        print(f"[{status:<7}] {name:<26} CPU: {cpu:>4}% | RAM: {mem:>4}MB | Uptime: {uptime_str:>4} | Restarts: {restart_time}")
except Exception as e:
    print(f"Error parsing PM2 jlist: {e}")

print("\n=== 3. WEBSOCKET HEALTH & RECENT LOGS (PAST 2 MINS) ===")
for s in ['lhs-s1001', 'lhs-s1005', 'lhs-s1006']:
    out, _ = exec_cmd(f"tail -n 30 /root/.pm2/logs/{s}-out.log | grep -E '(\\[Perf\\]\\[PlayerSave\\]|stuck|backlog|queue wait|slow tag)' | tail -n 8")
    print(f"--- {s} Recent Perf/Warning Lines ---")
    if out.strip():
        print(out.strip())
    else:
        print("(No slow/stuck/backlog warnings in recent lines - healthy)")

print("\n=== 4. HTTP READINESS CHECKS ===")
out, _ = exec_cmd("for p in 8080 8083 8084 8085 8086 8087; do echo -n \"Port $p: \"; curl -s http://127.0.0.1:$p/ready || echo 'FAILED'; done")
print(out.strip())

client.close()
