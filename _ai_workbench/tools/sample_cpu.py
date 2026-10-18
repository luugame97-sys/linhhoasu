import paramiko
import json
import time

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.104.165', username='root', password='anhduc11')

print("--- Sampling S1, S5, S6 CPU over 12 seconds ---")
for i in range(4):
    _, out, _ = client.exec_command('pm2 jlist')
    processes = json.loads(out.read())
    s1 = next((p for p in processes if p['name'] == 'lhs-s1001'), {})
    s5 = next((p for p in processes if p['name'] == 'lhs-s1005'), {})
    s6 = next((p for p in processes if p['name'] == 'lhs-s1006'), {})
    cpu1 = s1.get('monit', {}).get('cpu', 0)
    cpu5 = s5.get('monit', {}).get('cpu', 0)
    cpu6 = s6.get('monit', {}).get('cpu', 0)
    print(f"Sample {i+1} (T+{i*3}s): S1 CPU={cpu1:>5}% | S5 CPU={cpu5:>5}% | S6 CPU={cpu6:>5}%")
    if i < 3:
        time.sleep(3)

print("\n--- Recent stuck/slow on S6 (past 3 mins) ---")
_, out, _ = client.exec_command("tail -n 60 /root/.pm2/logs/lhs-s1006-out.log | grep -E '(handler stuck|backlog|slow tag)' | tail -n 10")
lines = out.read().decode('utf-8', 'replace').strip()
print(lines if lines else "(Khong co log stuck hay backlog nao - phan hoi binh thuong)")

client.close()
