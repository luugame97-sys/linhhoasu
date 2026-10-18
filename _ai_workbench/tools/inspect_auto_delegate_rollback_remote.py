import getpass
import json

import paramiko


HOST = "103.116.105.154"
BACKUP = "/linhhoasu/_ai_workbench/backups/auto_delegate_pre_20260830_164518"
FILES = [
    "/linhhoasu/lhs/newServer/src/services/EquipService.js",
    "/linhhoasu/lhs/newServer/src/handlers/item.js",
    "/linhhoasu/webgame/game/js/main.min_a6195824.js",
    "/linhhoasu/webgame/game/index.html",
]


def run(ssh, command):
    _stdin, stdout, stderr = ssh.exec_command(command)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-3000:] or output[-3000:])
    return output


def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=15)
    try:
        rows = []
        for file_path in FILES:
            if "/src/services/EquipService.js" in file_path:
                backup_path = f"{BACKUP}/server/services/EquipService.js"
            elif "/src/handlers/item.js" in file_path:
                backup_path = f"{BACKUP}/server/handlers/item.js"
            elif file_path.endswith("main.min_a6195824.js"):
                backup_path = f"{BACKUP}/client/js/main.min_a6195824.js"
            else:
                backup_path = f"{BACKUP}/client/index.html"
            rows.append({
                "file": file_path,
                "current": run(ssh, f"sha256sum {file_path} | cut -d' ' -f1").strip(),
                "backup": run(ssh, f"sha256sum {backup_path} | cut -d' ' -f1").strip(),
                "backupPath": backup_path,
                "backupExists": run(ssh, f"test -f {backup_path} && echo yes || echo no").strip() == "yes",
            })
        print(json.dumps({"backup": BACKUP, "files": rows}, indent=2))
        print("BACKUP_MARKER_COUNT=" + run(ssh, f"grep -Roh 'autoDelegate' {BACKUP} 2>/dev/null | wc -l").strip())
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
