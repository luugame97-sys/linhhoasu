"""Read-only inspection of the unexpected lhs-s1001 restart window."""
from __future__ import annotations

import getpass
import paramiko


HOST = "103.116.105.154"


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-4000:] or out[-4000:])
    return out


def main() -> None:
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=20)
    try:
        commands = {
            "pm2": "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\"].includes(p.name))console.log(JSON.stringify({name:p.name,status:p.pm2_env.status,pid:p.pid,restart:p.pm2_env.restart_time,unstable:p.pm2_env.unstable_restarts,exit:p.pm2_env.exit_code,signal:p.pm2_env.exit_signal,autorestart:p.pm2_env.autorestart,created:p.pm2_env.created_at,uptime:Date.now()-p.pm2_env.pm_uptime}))}})'",
            "out_window": "f=/root/.pm2/logs/lhs-s1001-out.log; grep -n -E '09:3[7-9]|09:40|runtime ready|SIG|shutdown|closed|fatal|uncaught|unhandled|EPIPE|Mongo|Redis' $f | tail -n 260",
            "err_window": "f=/root/.pm2/logs/lhs-s1001-error.log; tail -n 260 $f",
            "pm2_log": "grep -h -E 'lhs-s1001|online|stopped|errored|restart' /root/.pm2/pm2.log | tail -n 260",
            "kernel": "dmesg -T | tail -n 120 | grep -Ei 'oom|killed process|node|segfault|panic' || true",
        }
        for name, command in commands.items():
            print(f"===== {name.upper()} =====")
            print(run(ssh, command))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
