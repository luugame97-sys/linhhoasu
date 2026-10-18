import getpass
import re

import paramiko

tags = {1, 1500, 1505, 10002, 3301, 3302}
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

lines = text.splitlines()
print('PLAYER_SAVE_SLOW')
for line in lines:
    if '[Perf][PlayerSave]' in line:
        print(line)
for i, line in enumerate(lines):
    match = re.search(r'\[WSServer\] slow tag=(\d+).*?elapsed=(\d+)ms.*?route=(\d+)ms post=(\d+)ms tail=(\d+)ms', line)
    if not match or int(match.group(1)) not in tags:
        continue
    print(f'--- slow line {i + 1}: {line}')
    start = max(0, i - 12)
    for previous in lines[start:i]:
        if any(marker in previous for marker in ('handler enter', '发送 tag=', '发送 BATCH', 'C->S', 'task-refresh', 'slow send', '[Player]')):
            print(previous)
