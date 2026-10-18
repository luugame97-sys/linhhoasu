import getpass
import time
import paramiko

HOST = "103.116.105.154"

def main():
    password = getpass.getpass("VPS password (not logged): ")
    client = paramiko.SSHClient(); client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    last = None
    for i in range(3):
        try:
            client.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=30, banner_timeout=30, auth_timeout=30)
            break
        except Exception as e:
            last = e
            if i < 2: time.sleep(3)
    else: raise last
    try:
        command = r"grep -n -E 'tag=3500|\[Artifact\]' /root/.pm2/logs/lhs-s1001-out.log | tail -n 120"
        _stdin, stdout, stderr = client.exec_command(command)
        out = stdout.read().decode("utf-8", "replace")
        # Remove terminal cursor-control sequences emitted by the process logger.
        import re
        out = re.sub(r'\x1b\[[0-9;?]*[A-Za-z]', '', out)
        print(out)
    finally:
        client.close()

if __name__ == "__main__": main()
