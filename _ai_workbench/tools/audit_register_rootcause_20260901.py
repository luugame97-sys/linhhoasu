#!/usr/bin/env python3
import getpass, paramiko

HOST='103.116.105.154'
ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
commands = [
 "echo '--- prepared name service ---'; find /linhhoasu/lhs/newServer/src -type f -iname '*Name*Service*' -print",
 "echo '--- PreparedNameService.js ---'; sed -n '1,220p' /linhhoasu/lhs/newServer/src/services/PreparedNameService.js",
 "echo '--- account/role source refs ---'; grep -RIn --exclude='*.map' -E 'resolveNewPlayerName|isDefaultGeneratedName|preparedNames' /linhhoasu/lhs/newServer/src/services /linhhoasu/lhs/newServer/src/handlers | head -n 120",
 "echo '--- recent create failures timestamps ---'; grep -E 'CREATE_ROLE_FAILED|request parse failed path=/api/user/login' /root/.pm2/logs/lhs-s1001-out.log | tail -n 90",
 "echo '--- mongo/server errors around latest failures ---'; tail -n 250000 /root/.pm2/logs/lhs-s1001-out.log | grep -Ei 'E11000|duplicate key|MongoServerError|MongoError|OperationTimeout|create player|Player.*error|save player.*error|CREATE_ROLE_FAILED' | tail -n 240",
 "echo '--- process env relevant ---'; pid=$(pm2 pid lhs-s1001|tail -1); tr '\\0' '\\n' </proc/$pid/environ | grep -E 'MONGO|PLAYER|DB|NODE_ENV' | sed -E 's/(MONGO_URI=).*/\\1[REDACTED]/'",
]
try:
    for c in commands:
        _,out,err=ssh.exec_command(c); text=out.read().decode('utf-8','replace'); out.channel.recv_exit_status(); print('\n$ '+c+'\n'+text[-24000:]); e=err.read().decode('utf-8','replace');
        if e.strip(): print('[stderr] '+e[-2000:])
finally: ssh.close()
