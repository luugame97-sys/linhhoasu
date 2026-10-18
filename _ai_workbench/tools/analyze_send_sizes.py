import getpass
import re
import statistics

import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.105.154', username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    command = "f=/root/.pm2/logs/lhs-s1001-out.log; line=$(grep -n '\\[WSServer\\] runtime ready revision=' $f | tail -1 | cut -d: -f1); [ -n \"$line\" ] && tail -n +$line $f || tail -n 50000 $f"
    _, out, err = ssh.exec_command(command)
    text = out.read().decode('utf-8', 'replace')
    if out.channel.recv_exit_status() != 0:
        raise RuntimeError(err.read().decode('utf-8', 'replace'))
finally:
    ssh.close()

sizes = {}
for line in text.splitlines():
    match = re.search(r'\[WSServer\] 发送 tag=(\d+) msgUid=.*?size=(\d+)', line)
    if match:
        sizes.setdefault(int(match.group(1)), []).append(int(match.group(2)))

def pct(values, p):
    if not values:
        return 0
    values = sorted(values)
    return values[min(len(values) - 1, max(0, int(len(values) * p)))]

for tag, values in sorted(sizes.items(), key=lambda item: pct(item[1], .95), reverse=True)[:40]:
    print('TAG', tag, 'n', len(values), 'avg', round(statistics.mean(values)), 'p95', pct(values, .95), 'max', max(values))
