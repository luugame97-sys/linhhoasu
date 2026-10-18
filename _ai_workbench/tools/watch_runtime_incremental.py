#!/usr/bin/env python3
"""Read-only incremental watcher; prints only lag/freeze-relevant WS events."""
import getpass
import re
import time

import paramiko

HOST = "103.116.105.154"
LOG = "/root/.pm2/logs/lhs-s1001-out.log"


def remote(ssh, command):
    _, out, err = ssh.exec_command(command)
    data = out.read().decode("utf-8", "replace")
    out.channel.recv_exit_status()
    return data, err.read().decode("utf-8", "replace")


def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=15)
    try:
        raw, _ = remote(ssh, f"stat -c %s {LOG}; date '+%Y-%m-%d %H:%M:%S %z'")
        fields = raw.splitlines()
        offset = int(fields[0])
        print("WATCH_START", fields[1] if len(fields) > 1 else "unknown", "offset", offset)
        end_at = time.monotonic() + 300
        while time.monotonic() < end_at:
            raw, err = remote(ssh, f"size=$(stat -c %s {LOG}); echo SIZE=$size; if [ $size -gt {offset} ]; then tail -c +$(({offset}+1)) {LOG}; fi")
            lines = raw.splitlines()
            if not lines:
                time.sleep(2)
                continue
            match = re.match(r"SIZE=(\d+)", lines[0])
            if match:
                size = int(match.group(1))
                for line in lines[1:]:
                    if any(token.lower() in line.lower() for token in (
                        "queue backlog", "queue wait", "handler stuck", "handler still pending",
                        "deadline exceeded", "slow tag", "slow send", "heartbeat timeout",
                        "heartbeat failed", "socket closed", "新连接", "runtime ready",
                        "rate limited", "repeatRpcBlockModel", "failed", "error",
                    )):
                        line = re.sub(r"(user=)([^ ]+)", r"\1[REDACTED]", line)
                        line = re.sub(r"(from )([^ ]+)", r"\1[REDACTED]", line)
                        print(line, flush=True)
                offset = size
            if err.strip():
                print("WATCH_CMDERR", err[-300:])
            time.sleep(2)
        print("WATCH_END")
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
