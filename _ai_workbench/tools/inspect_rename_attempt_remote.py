import getpass

import paramiko


HOST = "103.116.105.154"


def run(ssh, command):
    _stdin, stdout, stderr = ssh.exec_command(command)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-2000:] or output[-2000:])
    return output


def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=15)
    try:
        print("=== RECENT HTTP 2837 ===")
        print(run(ssh, "grep -E 'POST gameMsg.do cmd=2837|cmd=2837' /root/.pm2/logs/lhs-s1001-*.log 2>/dev/null | tail -n 40 || true"))
        print("=== RECENT RENAME ===")
        print(run(ssh, "grep -E '\\[Rename\\]|tag=21|cmd=21' /root/.pm2/logs/lhs-s1001-*.log 2>/dev/null | tail -n 80 || true"))
        print("=== RECENT WARN/ERROR AROUND RENAME ===")
        print(run(ssh, "tail -n 300 /root/.pm2/logs/lhs-s1001-error.log 2>/dev/null | tail -n 120 || true"))
        print("=== PM2 ===")
        print(run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\"].includes(p.name))console.log(p.name+\"=\"+p.pm2_env.status+\",pid=\"+p.pid+\",restarts=\"+p.pm2_env.restart_time+\",uptime=\"+p.pm2_env.pm_uptime)}})' "))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
