import getpass
import json
import time
import paramiko

HOST = "103.116.105.154"

def run(ssh, cmd):
    _i, o, e = ssh.exec_command(cmd, timeout=60)
    out = o.read().decode('utf-8', 'replace')
    err = e.read().decode('utf-8', 'replace')
    code = o.channel.recv_exit_status()
    if code: raise RuntimeError(err or out)
    return out

def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    last = None
    for i in range(3):
        try:
            ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=30, banner_timeout=30, auth_timeout=30); break
        except Exception as exc:
            last = exc
            if i < 2: time.sleep(3)
    else: raise last
    try:
        user = run(ssh, "grep '\\[Spirit3600\\] user=' /root/.pm2/logs/lhs-s1001-out.log | tail -n 1 | sed -n 's/.*user=\\([^ ]*\\).*/\\1/p'").strip()
        script = """const mongoose=require('mongoose');const Player=require('./src/db/models/Player');(async()=>{await mongoose.connect(process.env.MONGO_URI);const p=await Player.findOne({userId:process.env.TARGET_USER}).lean();console.log(JSON.stringify({userId:p&&p.userId,name:p&&p.name,item60:p&&p.items&&p.items[60],item61:p&&p.items&&p.items[61],diamond:p&&p.currencies&&p.currencies.diamond,spiritRank:p&&p.spiritInfo&&p.spiritInfo.rank,spiritLevel:p&&p.spiritInfo&&p.spiritInfo.level,updatedAt:p&&p.updatedAt}));await mongoose.disconnect()})().catch(e=>{console.error(e.message);process.exit(1)})"""
        escaped = script.replace("'", "'\\''")
        cmd = "pid=$(pm2 pid lhs-s1001 | tail -1); export MONGO_URI=$(tr '\\0' '\\n' < /proc/$pid/environ | sed -n 's/^MONGO_URI=//p'); " + f"export TARGET_USER='{user}'; cd /linhhoasu/lhs/newServer; node -e '{escaped}'"
        print(run(ssh, cmd).strip())
    finally: ssh.close()

if __name__ == '__main__': main()
