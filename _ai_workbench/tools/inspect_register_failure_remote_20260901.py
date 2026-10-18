#!/usr/bin/env python3
from __future__ import annotations
import getpass
import paramiko

HOST='103.116.105.154'
ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy()); ssh.connect(HOST,username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
    commands = [
        "date '+NOW=%Y-%m-%d %H:%M:%S %z'; pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restart:e.restart_time,uptime:e.pm_uptime}))}}})'",
        "echo '--- CREATE_ROLE_FAILURE logs ---'; grep -h -n -E 'CREATE_ROLE_FAILED|create role failed|POST gameMsg.do cmd=2818|/api/user/register|REGISTER_FAILED|ACCOUNT_EXISTS|INVITE_CODE_REQUIRED' /root/.pm2/logs/lhs-s1001-out.log /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null | tail -n 260",
        "echo '--- latest runtime marker ---'; grep -n '\\[WSServer\\] runtime ready revision=' /root/.pm2/logs/lhs-s1001-out.log | tail -n 5",
        "echo '--- source throw context ---'; grep -n -B45 -A22 'CREATE_ROLE_FAILED' /linhhoasu/lhs/newServer/src/services/AccountService.js",
        "echo '--- player creation errors ---'; grep -h -n -E '\\[Player|createPlayer|savePlayer|E11000|duplicate|MongoServerError|MongoError' /root/.pm2/logs/lhs-s1001-out.log /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null | tail -n 220",
        "echo '--- resource/permission checks ---'; stat -c '%A %U:%G %s %y %n' /linhhoasu/lhs/newServer/src/services/AccountService.js /linhhoasu/lhs/newServer/src/services/PlayerService.js; df -h /linhhoasu /tmp",
    ]
    for command in commands:
        _,out,err=ssh.exec_command(command); text=out.read().decode('utf-8','replace'); out.channel.recv_exit_status(); error=err.read().decode('utf-8','replace'); print(f'\n$ {command.split(";",1)[0]}\n{text}');
        if error.strip(): print('[stderr]',error[-2000:])
finally: ssh.close()
