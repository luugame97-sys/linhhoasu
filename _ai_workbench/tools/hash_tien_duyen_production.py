from __future__ import annotations
import getpass
import paramiko

FILES = [
    "/linhhoasu/lhs/newServer/src/handlers/activity.js",
    "/linhhoasu/lhs/newServer/src/handlers/recharge.js",
    "/linhhoasu/lhs/newServer/src/services/RechargeBenefitService.js",
    "/linhhoasu/lhs/newServer/src/handlers/compat.js",
    "/linhhoasu/lhs/newServer/src/handlers/account.js",
    "/linhhoasu/webgame/game/index.html",
    "/linhhoasu/webgame/game/js/main.min_a6195824.js",
]
def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("103.116.105.154", username="root", password=password,
                look_for_keys=False, allow_agent=False, timeout=20)
    try:
        command = "sha256sum " + " ".join(FILES)
        _, out, err = ssh.exec_command(command, timeout=60)
        print(out.read().decode("utf-8", "replace"), end="")
        e = err.read().decode("utf-8", "replace")
        if e:
            print("STDERR=" + e, end="")
    finally:
        ssh.close()
if __name__ == "__main__":
    main()

