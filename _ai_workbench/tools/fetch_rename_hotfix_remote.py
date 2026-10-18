import getpass
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
REMOTE_ROOT = "/linhhoasu/lhs/newServer"
LOCAL_ROOT = Path(r"I:\Linhhoasu\server\server\_ai_workbench\temp\rename_hotfix\current_remote")
FILES = (
    "src/handlers/serverList.js",
    "src/handlers/task.js",
    "src/handlers/upgrade.js",
    "src/handlers/item.js",
    "src/handlers/artifact.js",
    "src/services/EquipService.js",
    "src/services/PlayerNameService.js",
    "src/net/HTTPServer.js",
)


def run(ssh, command):
    _stdin, stdout, stderr = ssh.exec_command(command)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-2000:] or f"remote command failed: {code}")
    return output


def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        HOST,
        username="root",
        password=password,
        look_for_keys=False,
        allow_agent=False,
        timeout=15,
    )
    try:
        LOCAL_ROOT.mkdir(parents=True, exist_ok=True)
        sftp = ssh.open_sftp()
        try:
            for relative in FILES:
                target = LOCAL_ROOT / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                sftp.get(f"{REMOTE_ROOT}/{relative}", str(target))
                print(f"DOWNLOADED={relative}")
        finally:
            sftp.close()

        print(run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if([\"lhs-s1001\",\"lhs-real-bots\",\"lhs-dist\",\"lhs-admin\"].includes(p.name))console.log(p.name+\"=\"+p.pm2_env.status+\",pid=\"+p.pid+\",restarts=\"+p.pm2_env.restart_time)}})' ").strip())
        print("READY_HTTP=" + run(ssh, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready").strip())
        print("REMOTE_2837=" + run(ssh, f"grep -c '2837' {REMOTE_ROOT}/src/handlers/serverList.js || true").strip())
        print(run(ssh, "grep -E 'POST gameMsg.do cmd=2837|Rename' /root/.pm2/logs/lhs-s1001-*.log 2>/dev/null | tail -n 40 || true").strip())
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
