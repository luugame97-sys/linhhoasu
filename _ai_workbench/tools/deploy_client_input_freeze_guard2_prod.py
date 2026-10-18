"""Deploy the client-only input-freeze terminal guards with rollback."""
from __future__ import annotations

import getpass
import hashlib
import json
import os
import posixpath
import time
from datetime import datetime

import paramiko


HOST = "103.116.105.154"
LOCAL_ROOT = r"I:\Linhhoasu\server\server"
REMOTE_ROOT = "/linhhoasu"
STAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
BACKUP = f"{REMOTE_ROOT}/_ai_workbench/backups/input_freeze_guard2_pre_{STAMP}"
TOKEN = "20260831_input_freeze_guard2"

FILES = {
    "webgame/game/js/main.min_a6195824.js": "e9c2140f1fed3637bf12e857dcf005bc2a531165feef4d9cfe69d929f573d0c3",
    "webgame/game/index.html": "5b25b0143c6b9ef539e180d42b36099c69279d83f156dd48f1a71ddabbed6ccf",
}

REQUIRED_MARKERS = (
    "i._rpcRecordMap[t]===n&&2==n.state",
    "i&&(i.globalMask.visible=!1,i.autoCheck.selected=!1)",
    "t&&t.resetBlockFlag()",
    "function(){e.changeAutoComposeState(0)}",
    "setTimeout(a,8e3)",
    "Array.isArray(t.changed)&&t.changed.length",
    "_lhsActiveTracks",
)


def local_path(relative: str) -> str:
    return os.path.join(LOCAL_ROOT, "linhhoasu", *relative.split("/"))


def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 120) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-4000:] or output[-4000:] or f"command failed with {code}")
    return output


def connect(password: str) -> paramiko.SSHClient:
    last_error: Exception | None = None
    for attempt in range(3):
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
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
            client.close()
            last_error = error
            if attempt < 2:
                time.sleep(3)
    assert last_error is not None
    raise last_error


def runtime_snapshot(ssh: paramiko.SSHClient) -> dict[str, object]:
    pm2_raw = run(ssh, "pm2 jlist")
    wanted = {"lhs-s1001", "lhs-real-bots", "lhs-dist", "lhs-admin"}
    pm2 = {
        process["name"]: {
            "status": process.get("pm2_env", {}).get("status"),
            "pid": process.get("pid"),
            "restarts": process.get("pm2_env", {}).get("restart_time"),
        }
        for process in json.loads(pm2_raw)
        if process.get("name") in wanted
    }
    missing = sorted(wanted.difference(pm2))
    offline = sorted(name for name, row in pm2.items() if row.get("status") != "online")
    if missing or offline:
        raise RuntimeError(f"PM2 pre/postcondition failed missing={missing} offline={offline}")
    ready = json.loads(run(ssh, "curl -fsS --max-time 8 http://127.0.0.1:8080/ready"))
    health = json.loads(run(ssh, "curl -fsS --max-time 8 http://127.0.0.1:9200/health"))
    checks = ready.get("checks", ready)
    if ready.get("status") not in {"ok", "ready"} or not checks.get("mongo") or not checks.get("redis"):
        raise RuntimeError(f"readiness failed: {ready}")
    runtime = health.get("runtime", {})
    bots = runtime.get("bots", {})
    return {
        "pm2": pm2,
        "ready": ready,
        "runtime": {
            "revision": runtime.get("revision"),
            "clients": runtime.get("clients"),
            "virtualBots": bots.get("botCount"),
            "realBots": bots.get("real"),
        },
    }


def main() -> None:
    local_payloads = {relative: open(local_path(relative), "rb").read() for relative in FILES}
    new_hashes = {relative: digest(payload) for relative, payload in local_payloads.items()}
    if new_hashes["webgame/game/js/main.min_a6195824.js"] != "ff262b9cce06e9e7b9ba855ac2f8a8c5cb62de6a8cfa7cee4f8e32d79a1d2da2":
        raise RuntimeError("local main hash is not the verified guard2 candidate")
    if new_hashes["webgame/game/index.html"] != "4e197110454001f5ef0e642c77df6b2e7011fc14e41d2ffdf718c5eac15d47c1":
        raise RuntimeError("local index hash is not the verified guard2 candidate")

    password = getpass.getpass("VPS password (not logged): ")
    ssh = connect(password)
    stages: list[tuple[str, str, str]] = []
    installed = False
    try:
        before = runtime_snapshot(ssh)
        remote_payloads: dict[str, bytes] = {}
        sftp = ssh.open_sftp()
        try:
            for relative, expected in FILES.items():
                remote = f"{REMOTE_ROOT}/{relative}"
                with sftp.open(remote, "rb") as stream:
                    payload = stream.read()
                actual = digest(payload)
                if actual != expected:
                    raise RuntimeError(
                        f"precondition failed {relative}: remote={actual} expected={expected}"
                    )
                remote_payloads[relative] = payload

            run(ssh, f"mkdir -p -- {BACKUP} {REMOTE_ROOT}/_ai_workbench/temp")
            for relative, payload in remote_payloads.items():
                backup_name = relative.replace("/", "__")
                with sftp.open(posixpath.join(BACKUP, backup_name), "wb") as stream:
                    stream.write(payload)

            for relative in FILES:
                remote = f"{REMOTE_ROOT}/{relative}"
                suffix = ".html" if relative.endswith(".html") else ".js"
                stage = f"{remote}.deploy-{STAMP}{suffix}"
                sftp.put(local_path(relative), stage)
                stages.append((relative, remote, stage))
        finally:
            sftp.close()

        main_stage = next(stage for relative, _remote, stage in stages if relative.endswith(".js"))
        index_stage = next(stage for relative, _remote, stage in stages if relative.endswith(".html"))
        run(ssh, f"node --check {main_stage}", timeout=180)
        for marker in REQUIRED_MARKERS:
            marker_hash = hashlib.sha256(marker.encode()).hexdigest()[:12]
            command = (
                f"export MAIN_STAGE={main_stage} MARKER_B64=$(printf %s {json.dumps(marker)} | base64 -w0); "
                "node -e 'const fs=require(\"fs\");const s=fs.readFileSync(process.env.MAIN_STAGE,\"utf8\");"
                "const m=Buffer.from(process.env.MARKER_B64,\"base64\").toString();if(!s.includes(m))process.exit(1)'"
            )
            try:
                run(ssh, command)
            except Exception as error:
                raise RuntimeError(f"staged main missing marker {marker_hash}") from error
        run(ssh, f"grep -q {TOKEN} {index_stage}")

        for _relative, remote, stage in stages:
            run(ssh, f"mv -- {stage} {remote}; chmod 644 {remote}")
        installed = True

        served_index = run(ssh, f"curl -fsS --max-time 10 'http://127.0.0.1:81/index.html?v={TOKEN}'")
        if served_index.count(TOKEN) != 2:
            raise RuntimeError("served index cache token mismatch")
        served_main_hash = run(
            ssh,
            f"curl -fsS --max-time 20 'http://127.0.0.1:81/js/main.min_a6195824.js?v={TOKEN}' | sha256sum | awk '{{print $1}}'",
            timeout=40,
        ).strip()
        expected_main_hash = new_hashes["webgame/game/js/main.min_a6195824.js"]
        if served_main_hash != expected_main_hash:
            raise RuntimeError(f"served main hash mismatch {served_main_hash} != {expected_main_hash}")

        after = runtime_snapshot(ssh)
        if before["pm2"] != after["pm2"]:
            raise RuntimeError("PM2 PID/restart counters changed during client-only deployment")
        print("BACKUP=" + BACKUP)
        print("SERVED_TOKEN=" + TOKEN)
        print("SERVED_MAIN_SHA256=" + served_main_hash)
        print("REMOTE_INDEX_SHA256=" + new_hashes["webgame/game/index.html"])
        print("PM2_RESTART=none")
        print("RUNTIME_BEFORE=" + json.dumps(before, ensure_ascii=False, separators=(",", ":")))
        print("RUNTIME_AFTER=" + json.dumps(after, ensure_ascii=False, separators=(",", ":")))
    except Exception:
        if installed:
            for relative in FILES:
                remote = f"{REMOTE_ROOT}/{relative}"
                backup_name = relative.replace("/", "__")
                run(ssh, f"cp -p -- {BACKUP}/{backup_name} {remote}")
            print("ROLLBACK=restored static client files")
        raise
    finally:
        for _relative, _remote, stage in stages:
            try:
                run(ssh, f"rm -f -- {stage}")
            except Exception:
                pass
        ssh.close()


if __name__ == "__main__":
    main()
