import getpass
import pathlib

import paramiko


HOST = "103.116.105.154"
FILES = {
    "/linhhoasu/lhs/newServer/src/handlers/mail.js": pathlib.Path("_ai_workbench/temp/remote_mail.js"),
    "/linhhoasu/lhs/newServer/src/services/RewardGrantService.js": pathlib.Path("_ai_workbench/temp/remote_RewardGrantService.js"),
    "/linhhoasu/lhs/newServer/src/handlers/raid.js": pathlib.Path("_ai_workbench/temp/remote_raid.js"),
    "/linhhoasu/lhs/newServer/src/handlers/item.js": pathlib.Path("_ai_workbench/temp/remote_item.js"),
    "/linhhoasu/lhs/newServer/src/net/HTTPServer.js": pathlib.Path("_ai_workbench/temp/remote_HTTPServer.js"),
}


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=getpass.getpass("VPS password (not logged): "), look_for_keys=False, allow_agent=False, timeout=15)
    try:
        sftp = ssh.open_sftp()
        try:
            for remote, local in FILES.items():
                local.parent.mkdir(parents=True, exist_ok=True)
                with sftp.open(remote, "rb") as src:
                    local.write_bytes(src.read())
                print(f"FETCHED {remote} -> {local} ({local.stat().st_size} bytes)")
        finally:
            sftp.close()
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
