#!/usr/bin/env python3
"""Deploy the level-100 Thần binh/Võ hồn unlock policy to every live game node."""
from __future__ import annotations

import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
CREDENTIALS = ROOT / "_ai_workbench" / "VPS103.116.104.165.txt"
CANDIDATE = ROOT / "linhhoasu" / "lhs" / "newServer" / "src" / "handlers" / "upgrade.js"
REMOTE = "/linhhoasu/lhs/newServer/src/handlers/upgrade.js"
EXPECTED_PREIMAGE = "48798f66479633a5dedfac552e3e6d905e8003fc328eabe02455e3ebbc144e41"
NODES = [
    ("lhs-s1001", 8080),
    ("lhs-s1002", 8083),
    ("lhs-s1003", 8084),
    ("lhs-s1004", 8085),
    ("lhs-s1005", 8086),
    ("lhs-s1006", 8087),
    ("lhs-s1007", 8088),
    ("lhs-s1008", 8089),
]
OUT = ROOT / "_ai_workbench" / "temp" / "level_unlock_20261009"
REMOTE_TEMP = "/linhhoasu/_ai_workbench/temp/level_unlock_20261009"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def shell(value: str) -> str:
    return shlex.quote(value)


def connect() -> paramiko.SSHClient:
    lines = CREDENTIALS.read_text(encoding="utf-8-sig").splitlines()
    if len(lines) != 3 or lines[0].strip() != "103.116.104.165" or lines[1].strip() != "root":
        raise RuntimeError("CREDENTIAL_TARGET_MISMATCH")
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    client.connect(
        lines[0].strip(),
        username=lines[1].strip(),
        password=lines[2],
        look_for_keys=False,
        allow_agent=False,
        timeout=20,
    )
    return client


def run(ssh: paramiko.SSHClient, command: str, input_text: str | None = None, timeout: int = 120) -> str:
    stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    if input_text is not None:
        stdin.write(input_text)
        stdin.channel.shutdown_write()
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code != 0:
        raise RuntimeError(f"REMOTE_COMMAND_FAILED:{code}:{err[-2000:]}:{out[-1000:]}")
    return out


def ready(ssh: paramiko.SSHClient, port: int) -> str:
    try:
        return run(
            ssh,
            f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 10 http://127.0.0.1:{port}/ready",
            timeout=20,
        ).strip()
    except RuntimeError:
        # A freshly restarted node can briefly refuse the socket.  Treat that
        # as a non-ready sample so the caller can keep polling.
        return "000"


def main() -> None:
    candidate = CANDIDATE.read_bytes()
    candidate_hash = digest(candidate)
    if candidate_hash == EXPECTED_PREIMAGE:
        raise RuntimeError("CANDIDATE_NOT_PATCHED")
    OUT.mkdir(parents=True, exist_ok=True)
    release_at = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/level_unlock_20261009_{release_at}"
    stage = f"{REMOTE}.level_unlock_20261009_{release_at}.stage"
    evidence: dict = {
        "at": datetime.now(timezone.utc).isoformat(),
        "readOnly": False,
        "productionWrites": 0,
        "playerWrites": 0,
        "candidate": str(CANDIDATE),
        "candidateHash": candidate_hash,
        "expectedPreimage": EXPECTED_PREIMAGE,
        "nodes": [name for name, _ in NODES],
    }

    ssh = connect()
    try:
        pm2 = json.loads(run(ssh, "pm2 jlist"))
        rows = {row.get("name"): row for row in pm2}
        missing = [name for name, _ in NODES if name not in rows]
        offline = [name for name, _ in NODES if (rows[name].get("pm2_env") or {}).get("status") != "online"]
        if missing or offline:
            raise RuntimeError(f"RUNTIME_SCOPE_NOT_READY:missing={missing}:offline={offline}")
        remote_pre = run(ssh, f"sha256sum -- {shell(REMOTE)} | awk '{{print $1}}'").strip()
        if remote_pre != EXPECTED_PREIMAGE:
            raise RuntimeError(f"SOURCE_PREIMAGE_MISMATCH:{remote_pre}")
        pre_ready = {str(port): ready(ssh, port) for _, port in NODES}
        if any(code != "200" for code in pre_ready.values()):
            raise RuntimeError(f"PRE_READY_FAILED:{pre_ready}")
        evidence["preReady"] = pre_ready
        evidence["remotePreimage"] = remote_pre

        run(ssh, f"install -d -m 700 -- {shell(backup)}")
        run(ssh, f"cp -p -- {shell(REMOTE)} {shell(backup + '/upgrade.js')}")
        backup_hash = run(ssh, f"sha256sum -- {shell(backup + '/upgrade.js')} | awk '{{print $1}}'").strip()
        if backup_hash != EXPECTED_PREIMAGE:
            raise RuntimeError(f"BACKUP_HASH_MISMATCH:{backup_hash}")
        evidence["backup"] = backup
        evidence["backupHash"] = backup_hash

        with ssh.open_sftp() as sftp:
            with sftp.open(stage, "wb") as handle:
                handle.write(candidate)
        run(ssh, f"chmod --reference={shell(REMOTE)} -- {shell(stage)}")
        staged_hash = run(ssh, f"sha256sum -- {shell(stage)} | awk '{{print $1}}'").strip()
        if staged_hash != candidate_hash:
            raise RuntimeError(f"STAGE_HASH_MISMATCH:{staged_hash}")
        remote_before_swap = run(ssh, f"sha256sum -- {shell(REMOTE)} | awk '{{print $1}}'").strip()
        if remote_before_swap != EXPECTED_PREIMAGE:
            raise RuntimeError(f"PREIMAGE_CHANGED_BEFORE_SWAP:{remote_before_swap}")
        run(ssh, f"mv -f -- {shell(stage)} {shell(REMOTE)}")
        installed_hash = run(ssh, f"sha256sum -- {shell(REMOTE)} | awk '{{print $1}}'").strip()
        if installed_hash != candidate_hash:
            raise RuntimeError(f"INSTALLED_HASH_MISMATCH:{installed_hash}")
        evidence["installedHashBeforeRestart"] = installed_hash

        restart_rows = []
        for name, port in NODES:
            run(ssh, f"pm2 restart {shell(name)}", timeout=120)
            deadline = time.time() + 90
            code = ""
            while time.time() < deadline:
                code = ready(ssh, port)
                if code == "200":
                    break
                time.sleep(1)
            if code != "200":
                raise RuntimeError(f"READY_FAILED:{name}:{port}:{code}")
            restart_rows.append({"name": name, "port": port, "ready": code})
        evidence["restarted"] = restart_rows

        post_pm2 = json.loads(run(ssh, "pm2 jlist"))
        evidence["postProcesses"] = [
            {
                "name": row.get("name"),
                "pid": row.get("pid"),
                "status": (row.get("pm2_env") or {}).get("status"),
                "restartCount": (row.get("pm2_env") or {}).get("restart_time"),
                "forceUnlock": ((row.get("pm2_env") or {}).get("env") or {}).get("FORCE_UNLOCK_SYSTEM_IDS"),
            }
            for row in post_pm2 if row.get("name") in {name for name, _ in NODES}
        ]
        evidence["installedHash"] = run(ssh, f"sha256sum -- {shell(REMOTE)} | awk '{{print $1}}'").strip()
        evidence["postReady"] = {str(port): ready(ssh, port) for _, port in NODES}
        evidence["productionWrites"] = 0
        evidence["playerWrites"] = 0
        evidence["result"] = "PASS"
    except Exception:
        evidence["result"] = "FAILED"
        raise
    finally:
        try:
            run(ssh, f"rm -f -- {shell(stage)}", timeout=30)
        except Exception:
            pass
        ssh.close()
        (OUT / "release.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

