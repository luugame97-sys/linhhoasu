import getpass
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
WORKSPACE = Path(r"I:\Linhhoasu\server\server")
FILES = {
    "/linhhoasu/lhs/newServer/src/services/EquipService.js": WORKSPACE / "linhhoasu/lhs/newServer/src/services/EquipService.js",
    "/linhhoasu/lhs/newServer/src/handlers/item.js": WORKSPACE / "linhhoasu/lhs/newServer/src/handlers/item.js",
    "/linhhoasu/webgame/game/js/main.min_a6195824.js": WORKSPACE / "linhhoasu/webgame/game/js/main.min_a6195824.js",
    "/linhhoasu/webgame/game/index.html": WORKSPACE / "linhhoasu/webgame/game/index.html",
}


def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=15)
    try:
        sftp = ssh.open_sftp()
        try:
            for remote, local in FILES.items():
                local.parent.mkdir(parents=True, exist_ok=True)
                sftp.get(remote, str(local))
                print(f"SYNCED={remote} -> {local}")
        finally:
            sftp.close()
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
