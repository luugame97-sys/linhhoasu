from __future__ import annotations

import ast
import datetime as dt
import hashlib
import json
import shlex
import sys
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[2]
REMOTE = "/linhhoasu/webgame/game/index.html"
EXPECTED_REMOTE = "8534dcde685b3f28a37b0b9276afdac8fef5eb2955c8db10efed9f220aa4a9fd"
LOCAL = ROOT / "linhhoasu/webgame/game/index.html"
RECEIPT = ROOT / "_ai_workbench/temp/startup_preload_20260930/deployment.json"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def ssh_config():
    source = (ROOT / "_ai_workbench/tools/vps_exec.py").read_text(encoding="utf-8-sig")
    tree = ast.parse(source)
    call = next(node for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "connect")
    args = [ast.literal_eval(node) for node in call.args]
    kwargs = {node.arg: ast.literal_eval(node.value) for node in call.keywords}
    kwargs.update(timeout=20, banner_timeout=20, auth_timeout=20)
    return args, kwargs


def main():
    local = LOCAL.read_bytes()
    local_hash = sha(local)
    if "preloadStartupScripts" not in local.decode("utf-8") or local_hash == EXPECTED_REMOTE:
        raise RuntimeError("LOCAL_PRELOAD_CANDIDATE_MISSING_OR_UNCHANGED")
    args, kwargs = ssh_config()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()
    nonce = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/startup_preload_{nonce}"
    stage = REMOTE + f".startup_preload_{nonce}.tmp"
    RECEIPT.parent.mkdir(parents=True, exist_ok=True)

    def run(command: str) -> str:
        _, stdout, stderr = client.exec_command(command, timeout=45)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError(f"REMOTE_COMMAND_FAILED({code}): {err[:800]}")
        return out.strip()

    def remote_hash(path: str) -> str:
        with sftp.open(path, "rb") as stream:
            return sha(stream.read())

    def readiness():
        rows = {}
        for port in [8080, 8083, 8084, 8085, 8086, 8087]:
            rows[str(port)] = json.loads(run(f"curl --max-time 8 -fsS http://127.0.0.1:{port}/ready"))
        return rows

    try:
        before = remote_hash(REMOTE)
        if before != EXPECTED_REMOTE:
            raise RuntimeError("CAS_REMOTE_INDEX_CHANGED")
        before_ready = readiness()
        run("install -d -m 700 -- " + shlex.quote(backup))
        run("cp -p -- " + shlex.quote(REMOTE) + " " + shlex.quote(backup + "/index.html"))
        if remote_hash(backup + "/index.html") != EXPECTED_REMOTE:
            raise RuntimeError("BACKUP_HASH_MISMATCH")
        sftp.put(str(LOCAL), stage)
        run("chmod 644 -- " + shlex.quote(stage))
        if remote_hash(stage) != local_hash:
            raise RuntimeError("STAGE_HASH_MISMATCH")
        if remote_hash(REMOTE) != EXPECTED_REMOTE:
            raise RuntimeError("CAS_BEFORE_SWAP_FAILED")
        run("mv -f -- " + shlex.quote(stage) + " " + shlex.quote(REMOTE))
        if remote_hash(REMOTE) != local_hash:
            raise RuntimeError("POST_HASH_MISMATCH")
        served = run("curl --max-time 20 -fsS http://127.0.0.1:81/index.html?preload=" + nonce + " | sha256sum").split()[0]
        if served != local_hash:
            raise RuntimeError("LOOPBACK_HASH_MISMATCH")
        after_ready = readiness()
        report = {
            "result": "DEPLOYED",
            "host": str(args[0]),
            "backupDir": backup,
            "productionWrites": 1,
            "beforeHash": before,
            "afterHash": local_hash,
            "servedHash": served,
            "beforeReady": before_ready,
            "afterReady": after_ready,
            "pm2Restart": False,
            "manifestChanged": False,
            "playerDataChanged": False,
            "at": dt.datetime.now(dt.timezone.utc).isoformat(),
        }
        RECEIPT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except Exception as exc:
        RECEIPT.write_text(json.dumps({"result": "FAILED", "error": str(exc)}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        raise
    finally:
        try:
            sftp.remove(stage)
        except FileNotFoundError:
            pass
        sftp.close()
        client.close()


if __name__ == "__main__":
    main()
