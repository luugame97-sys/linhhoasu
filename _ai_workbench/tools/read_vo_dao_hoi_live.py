from __future__ import annotations

import base64
import hashlib
import json
import sys

import paramiko

HOST = "103.116.105.154"
EXPECTED_FP = "SHA256:9hrzv0d3h/tdyep0ma+RUFi99n7YGXjQt3J4fI99osQ"


def main() -> None:
    password = sys.stdin.readline().rstrip("\r\n")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False,
                timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        key = ssh.get_transport().get_remote_server_key()
        fp = "SHA256:" + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")
        if fp != EXPECTED_FP:
            raise RuntimeError(f"host fingerprint mismatch: {fp}")
        command = """
echo '---TAIL ARENA S1---'; tail -n 50000 /root/.pm2/logs/lhs-s1001-out.log | grep -Ei 'nicky|ARENA_|tag=(2300|2600|2601|2602)' | tail -200 || true
echo '---TAIL ARENA S2---'; tail -n 50000 /root/.pm2/logs/lhs-s1002-out.log | grep -Ei 'nicky|ARENA_|tag=(2300|2600|2601|2602)' | tail -200 || true
echo '---ERRORS---'; tail -n 5000 /root/.pm2/logs/lhs-s1001-error.log /root/.pm2/logs/lhs-s1002-error.log | grep -Ei 'TypeError|ARENA|uncaught|unhandled|fatal' | tail -100 || true
"""
        stdin, stdout, stderr = ssh.exec_command(command, timeout=60)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        if err.strip():
            raise RuntimeError(err.strip())
        print(json.dumps({"fingerprint": fp, "output": out}, ensure_ascii=False))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
