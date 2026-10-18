"""Deploy the production Spirit resource-authority fix with rollback."""
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
BACKUP = f"{REMOTE_ROOT}/_ai_workbench/backups/spirit_resource_authority_pre_{STAMP}"
FILES = {
    "lhs/newServer/src/handlers/account.js": "3b05ad44c5ad6bc4f4b218dc6e95ea866d8e38f7fe7fc5cf39356d4d3c053da3",
    "lhs/newServer/src/handlers/spirit.js": "6f2094570c56a2e57e05384c574c49c591b7da45ae18fa6f1a5eb087314b4e6a",
}


def local_path(rel):
    if rel.endswith("src/handlers/spirit.js"):
        return os.path.join(LOCAL_ROOT, "_ai_workbench", "temp", "spirit_resource_authority_merged", "spirit.js")
    return os.path.join(LOCAL_ROOT, "linhhoasu", *rel.split("/"))


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def run(ssh, command, timeout=180):
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
    installed = False
    stages = []
    worker_was_online = False
    game_was_online = False
    try:
        worker_was_online = int(run(ssh, "pm2 pid lhs-real-bots | tail -1 || true").strip() or 0) > 0
        game_was_online = int(run(ssh, "pm2 pid lhs-s1001 | tail -1 || true").strip() or 0) > 0

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
                stage = f"{remote}.deploy-{STAMP}.js"
                sftp.put(local_path(rel), stage)
                stages.append((rel, remote, stage))
        finally:
            sftp.close()

        for _rel, _remote, stage in stages:
            run(ssh, f"node --check {stage}")
        account_stage = next(s for rel, _r, s in stages if rel.endswith("account.js"))
        spirit_stage = next(s for rel, _r, s in stages if rel.endswith("spirit.js"))
        run(ssh, f"! grep -q 'LOGIN_SPIRIT_STONE_MIN' {account_stage}")
        run(ssh, f"grep -q 'items: deltas' {spirit_stage}")
        run(ssh, f"! grep -q \"require('../services/CurrencySync')\" {spirit_stage}")

        for _rel, remote, stage in stages:
            run(ssh, f"mv -- {stage} {remote}; chmod 644 {remote}")
        installed = True

        core = run(ssh, f"cd {REMOTE_ROOT}/lhs/newServer && npm run test:core-contract")
        print("CORE_CONTRACT=" + (core.strip().splitlines()[-1] if core.strip() else "empty"))

        if worker_was_online:
            run(ssh, "pm2 stop lhs-real-bots")
        try:
            run(ssh, "pm2 restart lhs-s1001 --update-env")
            ready = run(
                ssh,
                "for i in $(seq 1 45); do code=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); "
                "[ \"$code\" = 200 ] && echo 200 && exit 0; sleep 1; done; exit 1",
                timeout=70,
            ).strip()
            print("READY=" + ready)
        finally:
            if worker_was_online:
                run(ssh, "pm2 start lhs-real-bots --update-env")

        run(ssh, "pm2 save")
        hashes = run(ssh, "sha256sum " + " ".join(f"{REMOTE_ROOT}/{rel}" for rel in FILES)).strip()
        health = run(ssh, "curl -fsS http://127.0.0.1:9200/health").strip()
        print("BACKUP=" + BACKUP)
        print("REMOTE_HASHES_BEGIN")
        print(hashes)
        print("REMOTE_HASHES_END")
        print("HEALTH=" + health)
    except Exception:
        if installed:
            for rel in FILES:
                remote = f"{REMOTE_ROOT}/{rel}"
                backup = f"{BACKUP}/{rel.replace('/', '__')}"
                run(ssh, f"cp -p -- {backup} {remote}")
            if game_was_online:
                run(ssh, "pm2 restart lhs-s1001 --update-env")
            if worker_was_online:
                run(ssh, "pm2 start lhs-real-bots --update-env")
            run(ssh, "pm2 save")
            print("ROLLBACK=restored")
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
