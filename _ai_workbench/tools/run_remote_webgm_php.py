"""Upload and run one non-secret WebGM PHP audit tool."""
from __future__ import annotations

import os
import shlex
import sys
from pathlib import Path

import paramiko


HOST = "103.116.105.154"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: run_remote_webgm_php.py tool.php")
    local = Path(sys.argv[1]).resolve()
    credentials = [line.strip() for line in Path(os.environ["LHS_PROD_CREDENTIAL_FILE"]).read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    if len(credentials) != 3 or credentials[0] != HOST or credentials[1] != "root":
        raise RuntimeError("CREDENTIAL_FILE_TARGET_MISMATCH")
    remote = "/linhhoasu/_ai_workbench/temp/" + local.name
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
    ssh.connect(HOST, username="root", password=credentials[2], look_for_keys=False, allow_agent=False, timeout=20)
    try:
        sftp = ssh.open_sftp()
        try:
            sftp.put(str(local), remote)
        finally:
            sftp.close()
        _, stdout, stderr = ssh.exec_command(
            f"php {shlex.quote(remote)} /linhhoasu/webgame/gm/config.php",
            timeout=60,
        )
        output = stdout.read().decode("utf-8", "replace")
        error = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError(error or output)
        print(output, end="")
    finally:
        ssh.exec_command(f"rm -f -- {shlex.quote(remote)}")
        ssh.close()


if __name__ == "__main__":
    main()
