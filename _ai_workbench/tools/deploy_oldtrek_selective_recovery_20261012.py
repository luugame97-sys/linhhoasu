from __future__ import annotations

import datetime as dt
import hashlib
import json
import shlex
import subprocess
import time
from pathlib import Path

import paramiko

from rollback_role_lian_manifest_20260930 import ssh_config


ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "_ai_workbench" / "temp" / "oldtrek_selective_20261012" / "candidate" / "src"
OUT = ROOT / "_ai_workbench" / "temp" / "oldtrek_selective_20261012"
FILES = {
    "handler": {
        "local": BASE / "handlers" / "old-trek.js",
        "remote": "/linhhoasu/lhs/newServer/src/handlers/old-trek.js",
        "expected": "02c06b591f1a36816406ea66212d7c315a34baf65cfd196264326f5a379dd615",
        "backup_name": "old-trek.js",
    },
    "event_service": {
        "local": BASE / "services" / "OldTrekEventService.js",
        "remote": "/linhhoasu/lhs/newServer/src/services/OldTrekEventService.js",
        "expected": "4e745dae0433c1f5e00fda820ce88a52a1139a0999d8243cebea798b0245e6fd",
        "backup_name": "OldTrekEventService.js",
    },
}
NODES = {
    "lhs-s1001": 8080,
    "lhs-s1002": 8083,
    "lhs-s1003": 8084,
    "lhs-s1004": 8085,
    "lhs-s1005": 8086,
    "lhs-s1006": 8087,
    "lhs-s1007": 8088,
    "lhs-s1008": 8089,
}


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def local_hash(path: Path) -> str:
    return sha_bytes(path.read_bytes())


def node_check(path: Path) -> None:
    result = subprocess.run(
        ["node", "--check", str(path)],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode:
        raise RuntimeError(f"NODE_CHECK:{path.name}:{result.stderr[-1000:]}")


def main() -> None:
    for key, item in FILES.items():
        path = item["local"]
        if not path.is_file():
            raise RuntimeError(f"CANDIDATE_MISSING:{key}:{path}")
        node_check(path)
    handler = FILES["handler"]["local"].read_text(encoding="utf-8")
    service = FILES["event_service"]["local"].read_text(encoding="utf-8")
    if "resolveExpired" not in handler or "settleArrivedOldTrek" not in handler:
        raise RuntimeError("HANDLER_SELECTIVE_MARKERS_MISSING")
    if "function resolveExpired" not in service or "expired-recovery" not in service:
        raise RuntimeError("SERVICE_SELECTIVE_MARKERS_MISSING")
    after = {key: local_hash(item["local"]) for key, item in FILES.items()}

    args, kwargs = ssh_config()
    if args[0] != "103.116.104.165":
        raise RuntimeError(f"UNEXPECTED_HOST:{args[0]}")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()
    stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/oldtrek_selective_recovery_{stamp}"
    stage = {
        key: f"{item['remote']}.selective_{stamp}.stage.js"
        for key, item in FILES.items()
    }
    report = {
        "at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "scope": "OldTrek selective recovery: expired event state-machine + arrived-without-event settlement",
        "productionPlayerWrites": 0,
        "backupDir": backup,
        "files": {
            key: {
                "remote": item["remote"],
                "preimage": item["expected"],
                "candidate": after[key],
            }
            for key, item in FILES.items()
        },
        "restarts": [],
    }

    def run(command: str, timeout: int = 55) -> str:
        _, out, err = client.exec_command(command, timeout=timeout)
        text = out.read().decode("utf-8", "replace")
        error = err.read().decode("utf-8", "replace")
        rc = out.channel.recv_exit_status()
        if rc:
            raise RuntimeError(f"REMOTE({rc}):{error[-1200:]}")
        return text.strip()

    def remote_hash(path: str) -> str:
        with sftp.open(path, "rb") as stream:
            return sha_bytes(stream.read())

    def ready(name: str) -> dict:
        deadline = time.monotonic() + 60
        while True:
            try:
                value = json.loads(
                    run(f"curl --max-time 5 -fsS http://127.0.0.1:{NODES[name]}/ready", 8)
                )
                checks = value.get("checks", {})
                if value.get("status") == "ok" and checks.get("mongo") is True and checks.get("redis") is True:
                    return value
            except Exception:
                pass
            if time.monotonic() > deadline:
                raise RuntimeError(f"READY:{name}")
            time.sleep(1)

    swapped: list[str] = []
    restarted: list[str] = []
    try:
        current = {key: remote_hash(item["remote"]) for key, item in FILES.items()}
        report["remotePreflight"] = current
        for key, item in FILES.items():
            if current[key] != item["expected"]:
                raise RuntimeError(f"CAS:{key}:{current[key]}")

        run("mkdir -m 700 -- " + shlex.quote(backup))
        for key, item in FILES.items():
            backup_path = f"{backup}/{item['backup_name']}"
            run("cp -p -- " + shlex.quote(item["remote"]) + " " + shlex.quote(backup_path))
            if remote_hash(backup_path) != item["expected"]:
                raise RuntimeError(f"BACKUP_HASH_MISMATCH:{key}")
            run("node --check " + shlex.quote(item["remote"]))
            sftp.put(str(item["local"]), stage[key])
            run("chmod --reference=" + shlex.quote(item["remote"]) + " " + shlex.quote(stage[key]))
            run("chown --reference=" + shlex.quote(item["remote"]) + " " + shlex.quote(stage[key]))
            run("node --check " + shlex.quote(stage[key]))
            if remote_hash(stage[key]) != after[key]:
                raise RuntimeError(f"STAGE_HASH_MISMATCH:{key}")

        current_before_swap = {key: remote_hash(item["remote"]) for key, item in FILES.items()}
        if current_before_swap != {key: item["expected"] for key, item in FILES.items()}:
            raise RuntimeError(f"CAS_BEFORE_SWAP:{current_before_swap}")
        for key, item in FILES.items():
            run("mv -f -- " + shlex.quote(stage[key]) + " " + shlex.quote(item["remote"]))
            if remote_hash(item["remote"]) != after[key]:
                raise RuntimeError(f"LIVE_HASH_MISMATCH:{key}")
            swapped.append(key)

        for name in NODES:
            run("pm2 restart " + shlex.quote(name) + " --update-env")
            ready_value = ready(name)
            restarted.append(name)
            report["restarts"].append({"name": name, "ready": ready_value})

        report["postHashes"] = {key: remote_hash(item["remote"]) for key, item in FILES.items()}
        report["postReady"] = {name: ready(name) for name in NODES}
        report["result"] = "DEPLOYED"
        report["completedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
    except Exception as exc:
        report["result"] = "FAILED"
        report["error"] = str(exc)
        if swapped:
            try:
                report["rollbackAttempted"] = True
                for key in swapped:
                    item = FILES[key]
                    live = remote_hash(item["remote"])
                    if live != after[key]:
                        raise RuntimeError(f"ROLLBACK_CAS:{key}:{live}")
                    rollback_stage = stage[key] + ".rollback.js"
                    backup_path = f"{backup}/{item['backup_name']}"
                    run("cp -p -- " + shlex.quote(backup_path) + " " + shlex.quote(rollback_stage))
                    run("chmod --reference=" + shlex.quote(item["remote"]) + " " + shlex.quote(rollback_stage))
                    run("chown --reference=" + shlex.quote(item["remote"]) + " " + shlex.quote(rollback_stage))
                    run("mv -f -- " + shlex.quote(rollback_stage) + " " + shlex.quote(item["remote"]))
                    if remote_hash(item["remote"]) != item["expected"]:
                        raise RuntimeError(f"ROLLBACK_HASH_MISMATCH:{key}")
                for name in restarted:
                    run("pm2 restart " + shlex.quote(name) + " --update-env")
                    ready(name)
                report["rollback"] = "restored"
            except Exception as rollback_error:
                report["rollbackError"] = str(rollback_error)
        raise
    finally:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / "deployment.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        for path in stage.values():
            try:
                sftp.remove(path)
            except FileNotFoundError:
                pass
        sftp.close()
        client.close()
        print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
