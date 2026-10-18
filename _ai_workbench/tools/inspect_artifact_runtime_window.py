import getpass
import time

import paramiko


HOST = "103.116.105.154"


def main():
    password = getpass.getpass("VPS password (not logged): ")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    last = None
    for attempt in range(3):
        try:
            client.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=30, banner_timeout=30, auth_timeout=30)
            break
        except Exception as error:
            last = error
            if attempt < 2:
                time.sleep(3)
    else:
        raise last
    try:
        commands = [
            r"grep -n -E '3500|1202' /root/.pm2/logs/lhs-s1001-out.log | tail -n 300",
            r"grep -n -E '3500|1202' /root/.pm2/logs/lhs-s1001-error.log | tail -n 100 || true",
        ]
        for command in commands:
            _stdin, stdout, stderr = client.exec_command(command)
            print(stdout.read().decode("utf-8", "replace"))
            error = stderr.read().decode("utf-8", "replace")
            if error:
                print(error)
    finally:
        client.close()


if __name__ == "__main__":
    main()
