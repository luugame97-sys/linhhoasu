"""Small read-only diagnostic for production log formatting."""

import getpass
import paramiko

host = "103.116.105.154"
password = getpass.getpass("Production password (not logged): ")
ssh = paramiko.SSHClient()
ssh.load_system_host_keys()
ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh.connect(host, username="root", password=password, look_for_keys=False, allow_agent=False)
commands = [
    "grep -a -m 3 -n 'handler enter' /linhhoasu/lhs/newServer/logs/combined-2026-09-01.log",
    "grep -a -m 3 -n 'tag=1241' /root/.pm2/logs/lhs-s1001-out.log",
    "grep -a -m 3 -n 'tag=1241' /linhhoasu/lhs/newServer/logs/combined-2026-09-01.log",
    "head -c 500 /linhhoasu/lhs/newServer/logs/combined-2026-09-01.log | strings",
    "grep -a -m 12 -n 'goodsId=11018000' /linhhoasu/lhs/newServer/logs/combined-2026-08-29.log /linhhoasu/lhs/newServer/logs/combined-2026-08-30.log /linhhoasu/lhs/newServer/logs/combined-2026-08-31.log /linhhoasu/lhs/newServer/logs/combined-2026-09-01.log",
]
try:
    for command in commands:
        _, stdout, stderr = ssh.exec_command(command, timeout=30)
        print("COMMAND=" + command)
        print(stdout.read().decode("utf-8", "replace"))
        print(stderr.read().decode("utf-8", "replace"))
finally:
    ssh.close()
