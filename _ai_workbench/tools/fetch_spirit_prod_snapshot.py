import getpass
from pathlib import Path
import time
import paramiko

HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench/temp/spirit_resource_authority_prod"

def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    last = None
    for i in range(3):
        try:
            ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=30, banner_timeout=30, auth_timeout=30); break
        except Exception as e:
            last = e
            if i < 2: time.sleep(3)
    else: raise last
    OUT.mkdir(parents=True, exist_ok=True)
    sftp = ssh.open_sftp()
    try:
        for name in ("account.js", "spirit.js"):
            sftp.get(f"/linhhoasu/lhs/newServer/src/handlers/{name}", str(OUT / name))
            print(OUT / name)
    finally:
        sftp.close(); ssh.close()

if __name__ == "__main__": main()
