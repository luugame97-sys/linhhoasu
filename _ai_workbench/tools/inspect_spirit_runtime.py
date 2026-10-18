import getpass
import time

import paramiko


HOST = "103.116.105.154"


def run(ssh, command, timeout=120):
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-4000:] or out[-4000:])
    return out


def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    last_error = None
    for attempt in range(3):
        try:
            ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=30, banner_timeout=30, auth_timeout=30)
            break
        except Exception as error:
            last_error = error
            if attempt < 2:
                time.sleep(3)
    else:
        raise last_error

    try:
        logs = run(
            ssh,
            "grep -E '\\[Spirit3600\\]|handler enter .*tag=3600|BATCH \\[.*3600' "
            "/root/.pm2/logs/lhs-s1001-out.log 2>/dev/null | tail -n 240 || true",
        )
        print("=== SPIRIT RUNTIME ===")
        print(logs)

        user_id = run(
            ssh,
            "grep '\\[Spirit3600\\] user=' /root/.pm2/logs/lhs-s1001-out.log 2>/dev/null "
            "| tail -n 1 | sed -n 's/.*user=\\([^ ]*\\).*/\\1/p' || true",
        ).strip()
        print(f"LATEST_USER={user_id or 'none'}")
        if user_id:
            script = r'''const mongoose=require('mongoose');
const Player=require('./src/db/models/Player');
(async()=>{await mongoose.connect(process.env.MONGO_URI);
const p=await Player.findOne({userId:process.env.TARGET_USER}).lean();
if(!p){console.log('PLAYER_NOT_FOUND');process.exit(0)}
console.log(JSON.stringify({userId:p.userId,name:p.name,level:p.level,item60:p.items&&p.items[60],item61:p.items&&p.items[61],currencies:p.currencies,spiritInfo:p.spiritInfo,updatedAt:p.updatedAt},null,2));
await mongoose.disconnect()})().catch(e=>{console.error(e.message);process.exit(1)})'''
            escaped = script.replace("'", "'\\''")
            command = (
                "pid=$(pm2 pid lhs-s1001 | tail -1); "
                "export MONGO_URI=$(tr '\\0' '\\n' < /proc/$pid/environ | sed -n 's/^MONGO_URI=//p'); "
                f"export TARGET_USER='{user_id}'; cd /linhhoasu/lhs/newServer; node -e '{escaped}'"
            )
            print("=== LATEST PLAYER DB (READ-ONLY) ===")
            print(run(ssh, command, timeout=60))
            print("=== SAVE/SESSION LOGS ===")
            print(run(
                ssh,
                f"grep -E 'user={user_id}([^0-9]|$)|{user_id}' /root/.pm2/logs/lhs-s1001-out.log 2>/dev/null "
                "| grep -E 'Spirit3600|PlayerSave|skip stale save|login|close|duplicate|tag=3600' | tail -n 240 || true",
            ))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
