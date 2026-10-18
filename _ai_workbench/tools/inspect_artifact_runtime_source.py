import getpass
import hashlib
import time

import paramiko


HOST = "103.116.105.154"


def connect(password):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    last_error = None
    for attempt in range(3):
        try:
            client.connect(
                HOST,
                username="root",
                password=password,
                look_for_keys=False,
                allow_agent=False,
                timeout=30,
                banner_timeout=30,
                auth_timeout=30,
            )
            return client
        except Exception as error:
            last_error = error
            if attempt < 2:
                time.sleep(3)
    raise last_error


def run(client, command):
    _stdin, stdout, stderr = client.exec_command(command)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-4000:] or out[-4000:])
    return out


def main():
    password = getpass.getpass("VPS password (not logged): ")
    client = connect(password)
    try:
        command = r"""
set -eu
pid=$(pm2 pid lhs-s1001)
echo '=== PROCESS ==='
echo "pid=$pid"
printf 'cwd='; readlink -f "/proc/$pid/cwd"
printf 'exe='; readlink -f "/proc/$pid/exe"
printf 'cmd='; tr '\0' ' ' < "/proc/$pid/cmdline"; echo
echo '=== PM2 ENV ==='
pm2 env "$pid" | grep -E '^(pm_cwd|pm_exec_path|NODE_APP_INSTANCE|ITEM_PAYLOAD_MODE|NODE_ENV|LOG_LEVEL):' || true
echo '=== REMOTE SOURCE ==='
sha256sum /linhhoasu/lhs/newServer/src/handlers/artifact.js
stat -c 'mtime=%y size=%s' /linhhoasu/lhs/newServer/src/handlers/artifact.js
sed -n '760,825p' /linhhoasu/lhs/newServer/src/handlers/artifact.js
echo '=== ROUTE REGISTRATION ==='
grep -n -E '3500|handleArtifactUpgrade' /linhhoasu/lhs/newServer/src/handlers/index.js /linhhoasu/lhs/newServer/src/handlers/artifact.js | tail -n 30
echo '=== SERVER START/REVISION ==='
grep -E 'revision|版本|listening|ready|启动' /root/.pm2/logs/lhs-s1001-out.log | tail -n 30 || true
"""
        print(run(client, command))
    finally:
        client.close()


if __name__ == "__main__":
    main()
