"""Deploy the scoped authoritative item-sync client patch to production."""
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
BACKUP = f"{REMOTE_ROOT}/_ai_workbench/backups/artifact_item_sync_pre_{STAMP}"
TOKEN = "20260831_artifact_item_sync2"

FILES = {
    "webgame/game/js/main.min_a6195824.js": "97de35075b761f1b28c75d5b1d9a7c1bcd17f891d9c5b46862894619225c6331",
    "webgame/game/index.html": "e7c30390e8799b6393684b8552c7984a4e5273635efe9cf317e8bb9d429f3eef",
}


def local_path(rel):
    return os.path.join(LOCAL_ROOT, "linhhoasu", *rel.split("/"))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def run(ssh, command, timeout=120):
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-4000:] or out[-4000:])
    return out


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

            run(ssh, f"mkdir -p -- {BACKUP} {REMOTE_ROOT}/_ai_workbench/temp")
            for rel, payload in originals.items():
                name = rel.replace("/", "__")
                with sftp.open(posixpath.join(BACKUP, name), "wb") as stream:
                    stream.write(payload)

            for rel in FILES:
                remote = f"{REMOTE_ROOT}/{rel}"
                suffix = ".js" if rel.endswith(".js") else ".html"
                stage = f"{remote}.deploy-{STAMP}{suffix}"
                sftp.put(local_path(rel), stage)
                stages.append((rel, remote, stage))
        finally:
            sftp.close()

        main_stage = next(stage for rel, _remote, stage in stages if rel.endswith("main.min_a6195824.js"))
        index_stage = next(stage for rel, _remote, stage in stages if rel.endswith("index.html"))
        run(ssh, f"node --check {main_stage}")
        run(ssh, f"grep -q 'Array.isArray(t.changed)&&t.changed.length' {main_stage}")
        run(ssh, f"grep -q '{TOKEN}' {index_stage}")

        for _rel, remote, stage in stages:
            run(ssh, f"mv -- {stage} {remote}; chmod 644 {remote}")
        installed = True

        remote_hashes = run(
            ssh,
            "sha256sum " + " ".join(f"{REMOTE_ROOT}/{rel}" for rel in FILES),
        ).strip()
        served_index = run(ssh, f"curl -fsS 'http://127.0.0.1:81/index.html?v={TOKEN}'")
        if TOKEN not in served_index:
            raise RuntimeError("served index does not contain the new cache token")
        served_main_hash = run(
            ssh,
            f"curl -fsS 'http://127.0.0.1:81/js/main.min_a6195824.js?v={TOKEN}' | sha256sum | awk '{{print $1}}'",
        ).strip()
        expected_main_hash = digest(open(local_path("webgame/game/js/main.min_a6195824.js"), "rb").read())
        if served_main_hash != expected_main_hash:
            raise RuntimeError(f"served main hash mismatch: {served_main_hash} != {expected_main_hash}")

        print(f"BACKUP={BACKUP}")
        print(f"SERVED_TOKEN={TOKEN}")
        print(f"SERVED_MAIN_SHA256={served_main_hash}")
        print("REMOTE_HASHES_BEGIN")
        print(remote_hashes)
        print("REMOTE_HASHES_END")
        print("PM2_RESTART=none")
    except Exception:
        if installed:
            for rel in FILES:
                remote = f"{REMOTE_ROOT}/{rel}"
                name = rel.replace("/", "__")
                run(ssh, f"cp -p -- {BACKUP}/{name} {remote}")
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
