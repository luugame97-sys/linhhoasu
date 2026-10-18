import getpass
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
REMOTE_ROOT = "/linhhoasu/webgame/game"
LOCAL_ROOT = Path(r"I:\Linhhoasu\server\server\_ai_workbench\temp\auto_delegate\current_remote_client")
FILES = (
    "js/main.min_a6195824.js",
    "index.html",
    "update/resource/assets/cfg/gameEui_18e11b8e.bin",
)


def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=15)
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
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
