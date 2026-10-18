"""Hậu kiểm read-only S1/S2 và trạng thái reconnect bot."""
from __future__ import annotations

import os
from pathlib import Path

import paramiko


HOST = "103.116.105.154"


def main() -> None:
    lines = [line.strip() for line in Path(os.environ["LHS_PROD_CREDENTIAL_FILE"]).read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    if len(lines) != 3 or lines[0] != HOST or lines[1] != "root":
        raise RuntimeError("CREDENTIAL_FILE_TARGET_MISMATCH")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=lines[2], look_for_keys=False, allow_agent=False, timeout=20)
    try:
        command = r"""
date '+TIME=%F %T %z'
echo WS_HEALTH
curl -sS --max-time 10 http://127.0.0.1:9200/health | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s),r=x.runtime||{},b=r.bots||{},real=b.real||{},m=b.mapMonsters||{};console.log(JSON.stringify({status:x.status,pid:r.pid,uptimeSec:r.uptimeSec,clients:r.clients,realBots:real.count,configuredBots:b.botCount,mapInvalid:m.invalid,claims:m.claims,completed:m.completed}))})' || true
echo S2_WS_HEALTH
curl -sS --max-time 10 http://127.0.0.1:9201/health | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s),r=x.runtime||{},b=r.bots||{},real=b.real||{};console.log(JSON.stringify({status:x.status,pid:r.pid,uptimeSec:r.uptimeSec,clients:r.clients,botsEnabled:b.enabled===true,realBots:Number(real.count)||0,configuredBots:Number(b.botCount)||0}))})' || true
echo
echo BOT_ACTIVITY
curl -sS --max-time 10 http://127.0.0.1:9200/bot-activity || true
echo
echo SOCKETS
ss -lntp | grep -E ':(9200|9201)[[:space:]]' || true
echo BOT_RECENT
last=$(tail -500 /root/.pm2/logs/lhs-real-bots-out.log 2>/dev/null | grep -Ei 'Opening handshake has timed out' | tail -1 | sed -E 's/id=[^: ]+/id=[REDACTED]/g' || true); count=$(tail -500 /root/.pm2/logs/lhs-real-bots-out.log 2>/dev/null | grep -Eic 'Opening handshake has timed out' || true); echo "recent_handshake_timeouts=$count"; echo "$last"
echo PROCESS
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s)){if(["lhs-s1001","lhs-s1002","lhs-real-bots","lhs-real-bots-s2"].includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time,uptime:e.pm_uptime}))}}})'
echo PUBLIC_GATE_QA
cd /linhhoasu/lhs/newServer && WS_URL=ws://127.0.0.1:81/ws-s2 node /linhhoasu/_ai_workbench/temp/server2_public_gate_20260903_172734/qa_server2_public_gate.js
"""
        _, stdout, stderr = ssh.exec_command(command, timeout=45)
        output = stdout.read().decode("utf-8", "replace")
        error = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError(error or output)
        print(output)
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
