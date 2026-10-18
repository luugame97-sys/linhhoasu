"""Deploy the Land steal settlement terminal guard without restarting PM2."""
from __future__ import annotations

import getpass
import hashlib
import os
import posixpath
import time
from datetime import datetime

import paramiko


HOST = "103.116.105.154"
LOCAL_ROOT = r"I:\Linhhoasu\server\server"
REMOTE_ROOT = "/linhhoasu"
STAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
BACKUP = f"{REMOTE_ROOT}/_ai_workbench/backups/land_steal_settle_guard_pre_{STAMP}"
TOKEN = "20260831_land_settle_guard3"
FILES = {
    "webgame/game/js/main.min_a6195824.js": "ff262b9cce06e9e7b9ba855ac2f8a8c5cb62de6a8cfa7cee4f8e32d79a1d2da2",
    "webgame/game/index.html": "4e197110454001f5ef0e642c77df6b2e7011fc14e41d2ffdf718c5eac15d47c1",
}


def local_path(rel):
    return os.path.join(LOCAL_ROOT, "linhhoasu", *rel.split("/"))


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def run(ssh, command, timeout=120):
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-5000:] or out[-5000:])
    return out


def connect(password):
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    last_error = None
    for attempt in range(3):
        try:
            client.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=30, banner_timeout=30, auth_timeout=30)
            return client
        except Exception as error:
            last_error = error
            if attempt < 2:
                time.sleep(3)
    raise last_error


def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = connect(password)
    stages = []
    installed = False
    try:
        sftp = ssh.open_sftp()
        try:
            originals = {}
            for rel, expected in FILES.items():
                remote = f"{REMOTE_ROOT}/{rel}"
                with sftp.open(remote, "rb") as stream:
                    payload = stream.read()
                actual = digest(payload)
                if actual != expected:
                    raise RuntimeError(f"precondition failed {rel}: remote={actual} expected={expected}")
                originals[rel] = payload

            run(ssh, f"mkdir -p -- {BACKUP}")
            for rel, payload in originals.items():
                with sftp.open(posixpath.join(BACKUP, rel.replace("/", "__")), "wb") as stream:
                    stream.write(payload)

            for rel in FILES:
                remote = f"{REMOTE_ROOT}/{rel}"
                suffix = ".js" if rel.endswith(".js") else ".html"
                stage = f"{remote}.deploy-{STAMP}{suffix}"
                sftp.put(local_path(rel), stage)
                stages.append((rel, remote, stage))
        finally:
            sftp.close()

        main_stage = next(stage for rel, _remote, stage in stages if rel.endswith(".js"))
        index_stage = next(stage for rel, _remote, stage in stages if rel.endswith(".html"))
        run(ssh, f"node --check {main_stage}")
        run(ssh, f"grep -q '_lhsStealSettleSeq' {main_stage}")
        run(ssh, f"grep -q 'setTimeout(a,3500)' {main_stage}")
        run(ssh, f"grep -q '{TOKEN}' {index_stage}")

        for _rel, remote, stage in stages:
            run(ssh, f"mv -- {stage} {remote}; chmod 644 {remote}")
        installed = True

        expected_main = digest(open(local_path("webgame/game/js/main.min_a6195824.js"), "rb").read())
        expected_index = digest(open(local_path("webgame/game/index.html"), "rb").read())
        served_index = run(ssh, f"curl -fsS 'http://127.0.0.1:81/index.html?v={TOKEN}'")
        if TOKEN not in served_index:
            raise RuntimeError("served index token mismatch")
        served_main_hash = run(ssh, f"curl -fsS 'http://127.0.0.1:81/js/main.min_a6195824.js?v={TOKEN}' | sha256sum | awk '{{print $1}}'").strip()
        if served_main_hash != expected_main:
            raise RuntimeError(f"served main hash mismatch {served_main_hash} != {expected_main}")
        remote_hashes = run(ssh, "sha256sum " + " ".join(f"{REMOTE_ROOT}/{rel}" for rel in FILES)).strip()
        if expected_index not in remote_hashes:
            raise RuntimeError("remote index hash mismatch")

        print("BACKUP=" + BACKUP)
        print("SERVED_TOKEN=" + TOKEN)
        print("SERVED_MAIN_SHA256=" + served_main_hash)
        print("REMOTE_HASHES_BEGIN")
        print(remote_hashes)
        print("REMOTE_HASHES_END")
        print("PM2_RESTART=none")
    except Exception:
        if installed:
            for rel in FILES:
                remote = f"{REMOTE_ROOT}/{rel}"
                backup = f"{BACKUP}/{rel.replace('/', '__')}"
                run(ssh, f"cp -p -- {backup} {remote}")
            print("ROLLBACK=restored static files")
        raise
    finally:
        for _rel, _remote, stage in stages:
            try:
                run(ssh, f"rm -f -- {stage}")
            except Exception:
                pass
        ssh.close()


if __name__ == "__main__":
    main()
