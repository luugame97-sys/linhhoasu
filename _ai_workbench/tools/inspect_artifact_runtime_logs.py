import getpass
import time
import paramiko


HOST = "103.116.105.154"


def run(ssh, command):
    _stdin, stdout, stderr = ssh.exec_command(command)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-3000:] or out[-3000:])
    return out


def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    last_error = None
    for attempt in range(3):
        try:
            ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=30, banner_timeout=30, auth_timeout=30)
            break
        except Exception as error:
            last_error = error
            if attempt == 2: raise
            time.sleep(3)
    try:
        commands = [
            "echo '=== ARTIFACT HANDLER LOGS ==='; grep -E '\\[Artifact\\]|tag=3500|tag=3501|tag=3505|tag=6401|tag=6402|tag=6403|tag=6405' /root/.pm2/logs/lhs-s1001-out.log 2>/dev/null | tail -n 160 || true",
            "echo '=== 1202 OUTBOUND AROUND ARTIFACT ==='; grep -E '发送 tag=1202|发送 BATCH .*1202|tag=1202' /root/.pm2/logs/lhs-s1001-out.log 2>/dev/null | tail -n 160 || true",
            "echo '=== RECENT ERRORS ==='; tail -n 160 /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null || true",
            "echo '=== PM2 ==='; pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\"].includes(p.name))console.log(p.name+\"=\"+p.pm2_env.status+\",pid=\"+p.pid+\",restart=\"+p.pm2_env.restart_time)}})'",
        ]
        for command in commands:
            print(run(ssh, command))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
