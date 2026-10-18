#!/usr/bin/env python3
"""Static client policy release for the level-100 Thần binh/Võ hồn gate."""
from __future__ import annotations

import base64
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
CREDENTIALS = ROOT / "_ai_workbench" / "VPS103.116.104.165.txt"
OUT = ROOT / "_ai_workbench" / "temp" / "day_gate_client_sync_20261009"
MANIFEST = OUT / "release.json"
REMOTE_ROOT = "/linhhoasu/webgame/game"
REMOTE_STAGE = "/linhhoasu/_ai_workbench/temp/day_gate_client_sync_20261009"
VERSION = "20261009_level_unlock_v2"
FILES = [
    {
        "relative": "js/lhs-feature-day1-v1.js",
        "candidate": "e2601a4efdabe217ea74d72639563de229ae3efb064488f26a2b8d9a284480dc",
        "baseline": "2d42a629658cebab596a05e64bad7ceec53cb1edbbd2edc7f2e25d507053e89f",
    },
    {
        "relative": "index.html",
        "candidate": "e602b633070aba638abfa1de8a4893b0eefb1779c62380a2d29a683eeaef5f27",
        "baseline": "1593d6b61591c90ae088dc443e722c454d4717b626b83457f422091ad60b8bde",
    },
]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def q(value: str) -> str:
    return shlex.quote(value)


def connect() -> paramiko.SSHClient:
    host, user, password = CREDENTIALS.read_text(encoding="utf-8-sig").splitlines()
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    client.connect(host, username=user, password=password, look_for_keys=False, allow_agent=False, timeout=20)
    return client


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90) -> str:
    stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(f"REMOTE_COMMAND_FAILED:{code}:{err[-1500:]}:{out[-500:]}")
    return out


def remote_hash(ssh: paramiko.SSHClient, path: str) -> str:
    return run(ssh, f"sha256sum -- {q(path)} | awk '{{print $1}}'").strip()


def upload(ssh: paramiko.SSHClient, path: str, data: bytes) -> None:
    run(ssh, f"install -d -m 700 -- {q(path.rsplit('/', 1)[0])}")
    with ssh.open_sftp() as sftp:
        with sftp.open(path, "wb") as handle:
            handle.write(data)
    if remote_hash(ssh, path) != sha(data):
        raise RuntimeError(f"UPLOAD_HASH:{path}")


def processes(ssh: paramiko.SSHClient) -> list[dict]:
    code = (
        "const a=JSON.parse(require('fs').readFileSync(0,'utf8'));"
        "console.log(JSON.stringify(a.filter(p=>/^lhs-s100[1-8]$/.test(p.name))"
        ".map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time}))));"
    )
    return json.loads(run(ssh, f"pm2 jlist | node -e {q(code)}"))


def fetch(ssh: paramiko.SSHClient, url: str) -> str:
    return run(ssh, f"curl -fsS --max-time 45 {q(url)}", timeout=60)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/day_gate_client_sync_20261009_{stamp}"
    stage = f"{REMOTE_STAGE}/candidate"
    evidence = {
        "at": datetime.now(timezone.utc).isoformat(),
        "result": "FAILED",
        "version": VERSION,
        "readOnly": False,
        "productionWrites": 0,
        "playerWrites": 0,
        "restarts": 0,
        "files": FILES,
    }
    ssh = connect()
    try:
        evidence["preProcesses"] = processes(ssh)
        for row in FILES:
            target = f"{REMOTE_ROOT}/{row['relative']}"
            if remote_hash(ssh, target) != row["baseline"]:
                raise RuntimeError(f"BASELINE_CAS:{row['relative']}")
            data = (OUT / "candidate" / Path(row["relative"]).name).read_bytes()
            if sha(data) != row["candidate"]:
                raise RuntimeError(f"LOCAL_CANDIDATE_HASH:{row['relative']}")
            upload(ssh, f"{stage}/{row['relative']}", data)
        for row in FILES:
            staged = f"{stage}/{row['relative']}"
            if remote_hash(ssh, staged) != row["candidate"]:
                raise RuntimeError(f"STAGE_HASH:{row['relative']}")
            if row["relative"].endswith(".js"):
                run(ssh, f"node --check {q(staged)}")
        run(ssh, f"install -d -m 700 -- {q(backup)}")
        for row in FILES:
            target = f"{REMOTE_ROOT}/{row['relative']}"
            destination = f"{backup}/{row['relative']}"
            run(ssh, f"install -d -m 700 -- {q(destination.rsplit('/', 1)[0])}")
            run(ssh, f"cp -p -- {q(target)} {q(destination)}")
            if remote_hash(ssh, destination) != row["baseline"]:
                raise RuntimeError(f"BACKUP_HASH:{row['relative']}")
        evidence["backup"] = backup
        evidence["backupHashes"] = {row["relative"]: row["baseline"] for row in FILES}
        evidence["phase"] = "backed_up"
        MANIFEST.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        for row in FILES:
            target = f"{REMOTE_ROOT}/{row['relative']}"
            staged = f"{stage}/{row['relative']}"
            if remote_hash(ssh, target) != row["baseline"]:
                raise RuntimeError(f"PUBLISH_CAS:{row['relative']}")
            temp = f"{target}.level_unlock_client.tmp"
            run(ssh, f"cp -- {q(staged)} {q(temp)} && chmod --reference={q(target)} {q(temp)} && chown --reference={q(target)} {q(temp)}")
            if remote_hash(ssh, temp) != row["candidate"]:
                raise RuntimeError(f"TEMP_HASH:{row['relative']}")
            run(ssh, f"mv -f -- {q(temp)} {q(target)}")
            if remote_hash(ssh, target) != row["candidate"]:
                raise RuntimeError(f"FINAL_HASH:{row['relative']}")
        evidence["installedHashes"] = {row["relative"]: row["candidate"] for row in FILES}

        for base in ("http://127.0.0.1:81/", "https://linhhoasu.lol/"):
            index = fetch(ssh, f"{base}index.html?v={VERSION}")
            if f"js/lhs-feature-day1-v1.js?v={VERSION}" not in index:
                raise RuntimeError(f"INDEX_MARKER:{base}")
            served_addon = sha(fetch(ssh, f"{base}js/lhs-feature-day1-v1.js?v={VERSION}").encode())
            if served_addon != FILES[0]["candidate"]:
                raise RuntimeError(f"SERVED_ADDON_HASH:{base}:{served_addon}")
        evidence["served"] = {
            "origin": "PASS",
            "https": "PASS",
            "indexMarker": f"js/lhs-feature-day1-v1.js?v={VERSION}",
            "addonHash": FILES[0]["candidate"],
        }
        evidence["postProcesses"] = processes(ssh)
        if evidence["postProcesses"] != evidence["preProcesses"]:
            raise RuntimeError("PROCESS_CHANGED")
        evidence["phase"] = "verified"
        evidence["result"] = "PASS"
        MANIFEST.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({
            "result": "PASS",
            "backup": backup,
            "served": evidence["served"],
            "restarts": 0,
            "productionWrites": 0,
            "playerWrites": 0,
        }, ensure_ascii=False))
    except Exception as error:
        evidence["error"] = str(error)
        MANIFEST.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        raise
    finally:
        try:
            run(ssh, f"rm -rf -- {q(REMOTE_STAGE)}", timeout=30)
        except Exception:
            pass
        ssh.close()


if __name__ == "__main__":
    main()

