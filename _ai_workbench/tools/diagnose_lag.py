import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.104.165', username='root', password='anhduc11')

remote_code = '''# -*- coding: utf-8 -*-
import subprocess, time

ports = [('S1', 8080), ('S2', 8083), ('S3', 8084), ('S4', 8085), ('S5', 8086), ('S6', 8087), ('S7', 8088), ('S8', 8089)]
print("=== 1. ĐỘ TRỄ HTTP /READY TỪNG SERVER ===")
for name, p in ports:
    res = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code} %{time_total}", f"http://127.0.0.1:{p}/ready"],
        capture_output=True, text=True
    )
    code, lat = res.stdout.strip().split()
    print(f"  {name} (Port {p}): HTTP {code} | Latency: {lat}s")

print("\\n=== 2. THỐNG KÊ LOG WARN / SLOW SAU KHI RESTART ===")
for i in range(1001, 1009):
    sid = f"S{i-1000}"
    lpath = f"/root/.pm2/logs/lhs-s{i}-out.log"
    with open(lpath, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()[-200:]
    slow_3314 = [l for l in lines if "tag=3314" in l]
    slow_4008 = [l for l in lines if "tag=4008" in l]
    slow_2601 = [l for l in lines if "tag=2601" in l]
    slow_2300 = [l for l in lines if "tag=2300" in l]
    slow_hb = [l for l in lines if "heartbeat slow" in l]
    print(f"  {sid}: slow_3314={len(slow_3314)}, slow_4008={len(slow_4008)}, slow_2601={len(slow_2601)}, slow_2300={len(slow_2300)}, slow_heartbeat={len(slow_hb)}")
'''

sftp = client.open_sftp()
with sftp.file('/tmp/diag_post.py', 'w') as f:
    f.write(remote_code)
sftp.close()

_, out, err = client.exec_command('python3 /tmp/diag_post.py && rm -f /tmp/diag_post.py')
print(out.read().decode('utf-8', 'replace'))
client.close()
