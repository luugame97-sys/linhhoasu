"""Deploy client MoveTeam log throttle on top of the served guard3 bundle."""
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
BACKUP = f"{REMOTE_ROOT}/_ai_workbench/backups/move_log_guard4_pre_{STAMP}"
TOKEN = "20260831_move_log_guard4"
FILES = {
    "webgame/game/js/main.min_a6195824.js": "5877c2053d56d9a723c1a1b973cc1c168980cfcb2b34b0d06456ae9a7355a4a5",
    "webgame/game/index.html": "d79bd735e1880edd519d1a43e2019181e91262d6fc54eab21a3b9ee4c8e5d3e4",
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
        raise RuntimeError(err[-5000:] or out[-5000:])
    return out

def connect(password):
    client = paramiko.SSHClient(); client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    last_error = None
    for attempt in range(3):
        try:
            client.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False, timeout=30, banner_timeout=30, auth_timeout=30)
            return client
        except Exception as error:
            last_error = error
            if attempt < 2: time.sleep(3)
    raise last_error

def main():
    password = getpass.getpass("VPS password (not logged): ")
    ssh = connect(password); stages = []; installed = False
    try:
        sftp = ssh.open_sftp()
        try:
            originals = {}
            for rel, expected in FILES.items():
                remote = f"{REMOTE_ROOT}/{rel}"
                with sftp.open(remote, "rb") as stream: payload = stream.read()
                actual = digest(payload)
                if actual != expected:
                    raise RuntimeError(f"precondition failed {rel}: remote={actual} expected={expected}")
                originals[rel] = payload
            run(ssh, f"mkdir -p -- {BACKUP}")
            for rel, payload in originals.items():
                with sftp.open(posixpath.join(BACKUP, rel.replace("/", "__")), "wb") as stream: stream.write(payload)
            for rel in FILES:
                remote = f"{REMOTE_ROOT}/{rel}"; suffix = ".js" if rel.endswith(".js") else ".html"
                stage = f"{remote}.deploy-{STAMP}{suffix}"; sftp.put(local_path(rel), stage); stages.append((rel, remote, stage))
        finally: sftp.close()

        main_stage = next(stage for rel, _remote, stage in stages if rel.endswith(".js")); index_stage = next(stage for rel, _remote, stage in stages if rel.endswith(".html"))
        run(ssh, f"node --check {main_stage}"); run(ssh, f"grep -q '_lhsLastEmptyPathWarnAt' {main_stage}"); run(ssh, f"grep -q '{TOKEN}' {index_stage}")
        for _rel, remote, stage in stages: run(ssh, f"mv -- {stage} {remote}; chmod 644 {remote}")
        installed = True

        served = run(ssh, f"curl -fsS 'http://127.0.0.1:81/index.html?v={TOKEN}'")
        if TOKEN not in served: raise RuntimeError("served index token mismatch")
        expected_main = digest(open(local_path("webgame/game/js/main.min_a6195824.js"), "rb").read())
        served_main = run(ssh, f"curl -fsS 'http://127.0.0.1:81/js/main.min_a6195824.js?v={TOKEN}' | sha256sum | awk '{{print $1}}'").strip()
        if served_main != expected_main: raise RuntimeError(f"served main mismatch {served_main} != {expected_main}")
        print("BACKUP=" + BACKUP); print("SERVED_TOKEN=" + TOKEN); print("SERVED_MAIN_SHA256=" + served_main); print("PM2_RESTART=none")
        print("REMOTE_HASHES_BEGIN"); print(run(ssh, "sha256sum " + " ".join(f"{REMOTE_ROOT}/{rel}" for rel in FILES)).strip()); print("REMOTE_HASHES_END")
    except Exception:
        if installed:
            for rel in FILES: run(ssh, f"cp -p -- {BACKUP}/{rel.replace('/', '__')} {REMOTE_ROOT}/{rel}")
            print("ROLLBACK=restored static files")
        raise
    finally:
        for _rel, _remote, stage in stages:
            try: run(ssh, f"rm -f -- {stage}")
            except Exception: pass
        ssh.close()

if __name__ == "__main__": main()
