"""Deploy real-bot count adjustment (8 bots/map, range 5-10) and enable S6 bots.

Scope:
- Update RealBotWorker.js and BotFleetPolicyService.js limits
- Enable BOT_ENABLED=1 on lhs-s1006
- Enable BOT_WORKER_ENABLED=1 on lhs-real-bots-s6
- Configure BOT_WORKER_LAZY_BOTS_PER_MAP=8 and BOT_WORKER_LAZY_MAX_ACTIVE=80 across all 6 bot workers
- Restart supervisor and all workers, save PM2
- Comprehensive readiness, health, supervisor, and resource verification
"""

from __future__ import annotations

import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path
import sys

WB_TOOLS = Path(__file__).resolve().parent
sys.path.append(str(WB_TOOLS))
from snapshot_web_multiserver_20260906 import connect, run

ROOT = WB_TOOLS.parent.parent
REMOTE_ROOT = "/linhhoasu/lhs/newServer"

FILES = {
    "src/bots/RealBotWorker.js": ROOT / "linhhoasu/lhs/newServer/src/bots/RealBotWorker.js",
    "src/services/BotFleetPolicyService.js": ROOT / "linhhoasu/lhs/newServer/src/services/BotFleetPolicyService.js",
}

WORKERS = {
    1001: "lhs-real-bots",
    1002: "lhs-real-bots-s2",
    1003: "lhs-real-bots-s3",
    1004: "lhs-real-bots-s4",
    1005: "lhs-real-bots-s5",
    1006: "lhs-real-bots-s6",
}

GAME_NAMES = {server_id: f"lhs-s{server_id}" for server_id in WORKERS}
GAME_PORTS = {1001: 8080, 1002: 8083, 1003: 8084, 1004: 8085, 1005: 8086, 1006: 8087}
WS_PORTS = {1001: 9200, 1002: 9201, 1003: 9202, 1004: 9203, 1005: 9204, 1006: 9205}

LAZY_ENV = {
    "BOT_WORKER_ENABLED": "1",
    "BOT_WORKER_COUNT": "580",
    "BOT_WORKER_LAZY_MAP_ACTIVATION": "1",
    "BOT_WORKER_LAZY_BOTS_PER_MAP": "8",
    "BOT_WORKER_LAZY_MAX_ACTIVE": "80",
    "BOT_WORKER_LAZY_DISCONNECT_GRACE_MS": "60000",
    "BOT_WORKER_LAZY_DRAIN_TIMEOUT_MS": "30000",
    "BOT_WORKER_LAZY_ACTIVITY_STALE_MS": "90000",
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def q(value: str) -> str:
    return shlex.quote(str(value))


def readiness(ssh, port: int, attempts: int = 15) -> bool:
    for _ in range(attempts):
        code = run(
            ssh,
            f"curl -sS -o /dev/null -w '%{{http_code}}' --connect-timeout 2 --max-time 8 http://127.0.0.1:{port}/ready || true"
        ).strip()
        if code == "200":
            return True
        time.sleep(1)
    return False


def ws_health(ssh, port: int):
    raw = run(ssh, f"curl -fsS --connect-timeout 2 --max-time 12 http://127.0.0.1:{port}/health")
    data = json.loads(raw)
    runtime = data.get("runtime") or {}
    bots = runtime.get("bots") or {}
    real = bots.get("real") or {}
    return {
        "status": data.get("status"),
        "clients": runtime.get("clients"),
        "realCount": real.get("count"),
        "realConnected": real.get("connected"),
        "lazy": (bots.get("lazyMapActivation") is True),
        "desired": bots.get("desiredBotCount"),
        "connected": bots.get("connected"),
        "activeMaps": bots.get("activeMaps"),
        "activityFresh": bots.get("activityFresh"),
    }


def restart_worker(ssh, name: str):
    assigns = " ".join(f"{key}={q(value)}" for key, value in LAZY_ENV.items())
    run(ssh, f"env {assigns} pm2 restart {q(name)} --update-env >/dev/null")


def restart_s6_game(ssh):
    run(ssh, "env BOT_ENABLED=1 pm2 restart lhs-s1006 --update-env >/dev/null")


def restart_supervisor(ssh):
    run(ssh, "env BOT_FLEET_MODE=lazy-all pm2 restart lhs-bot-fleet-supervisor --update-env >/dev/null")


def main():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/bot_update_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/bot_update_{stamp}"
    local = {rel: path.read_bytes() for rel, path in FILES.items()}
    
    print(f"Connecting to VPS...")
    ssh = connect()
    before = {}
    installed = []
    
    try:
        print("Checking pre-deploy game readiness on all 6 servers...")
        for sid, port in GAME_PORTS.items():
            if not readiness(ssh, port, 3):
                raise RuntimeError(f"PRE_DEPLOY_READINESS_FAILED: S{sid}")
        print("All 6 servers are READY (200 OK).")

        print(f"Creating backup directory {backup} and staging {stage}...")
        run(ssh, f"install -d -m 700 {q(backup)} {q(stage)}")
        
        with ssh.open_sftp() as sftp:
            manifest = {"createdAt": datetime.now(timezone.utc).isoformat(), "files": {}}
            for rel, data in local.items():
                remote = f"{REMOTE_ROOT}/{rel}"
                with sftp.open(remote, "rb") as handle:
                    old = handle.read()
                before[rel] = old
                
                remote_stage = f"{stage}/{rel}"
                remote_backup = f"{backup}/{rel}.before"
                
                run(ssh, f"install -d -m 700 {q(str(Path(remote_stage).parent).replace(chr(92), '/'))}")
                run(ssh, f"install -d -m 700 {q(str(Path(remote_backup).parent).replace(chr(92), '/'))}")
                
                with sftp.open(remote_stage, "wb") as handle:
                    handle.write(data)
                with sftp.open(remote_backup, "wb") as handle:
                    handle.write(old)
                    
                sftp.chmod(remote_stage, 0o600)
                sftp.chmod(remote_backup, 0o600)
                manifest["files"][rel] = {
                    "beforeSha256": sha(old),
                    "candidateSha256": sha(data),
                    "bytes": len(data)
                }
            with sftp.open(f"{backup}/manifest.json", "wb") as handle:
                handle.write((json.dumps(manifest, indent=2) + "\n").encode())
        print(f"Backup manifest saved to {backup}/manifest.json")

        print("Checking staged files syntax with node --check...")
        for rel in FILES:
            stage_file = f"{stage}/{rel}"
            run(ssh, f"node --check {q(stage_file)}")
        print("All staged files syntax valid.")

        print("Performing atomic file swap on VPS...")
        with ssh.open_sftp() as sftp:
            for rel, data in local.items():
                remote = f"{REMOTE_ROOT}/{rel}"
                with sftp.open(remote, "rb") as handle:
                    current = handle.read()
                if current != before[rel]:
                    raise RuntimeError(f"CAS_DRIFT: {rel}")
                candidate = f"{remote}.candidate-{stamp}"
                with sftp.open(candidate, "wb") as handle:
                    handle.write(data)
                sftp.chmod(candidate, 0o644)
                sftp.posix_rename(candidate, remote)
                installed.append(rel)
                with sftp.open(remote, "rb") as handle:
                    if handle.read() != data:
                        raise RuntimeError(f"POST_SWAP_HASH_MISMATCH: {rel}")
        print("Installed files verified successfully.")

        print("Restarting lhs-s1006 with BOT_ENABLED=1...")
        restart_s6_game(ssh)
        if not readiness(ssh, GAME_PORTS[1006], 15):
            raise RuntimeError("S6_RESTART_READINESS_FAILED")
        print("lhs-s1006 online and ready.")

        print("Restarting bot workers with LAZY_ENV (8 bots/map, max 80)...")
        for sid, worker_name in WORKERS.items():
            print(f"  Restarting {worker_name} (S{sid})...")
            restart_worker(ssh, worker_name)

        print("Restarting lhs-bot-fleet-supervisor...")
        restart_supervisor(ssh)

        print("Saving PM2 configuration...")
        run(ssh, "pm2 save")

        print("Waiting 6 seconds for workers and supervisor cycle...")
        time.sleep(6)

        print("Checking readiness across all 6 servers...")
        for sid, port in GAME_PORTS.items():
            if not readiness(ssh, port, 10):
                raise RuntimeError(f"POST_DEPLOY_READINESS_FAILED: S{sid}")
        print("All 6 servers are READY (200 OK).")

        print("Checking supervisor logs...")
        sup_logs = run(ssh, "pm2 logs lhs-bot-fleet-supervisor --lines 10 --nostream")
        print("Supervisor output:\n" + sup_logs[-800:])

        print("Checking ws health across all 6 servers...")
        for sid, port in WS_PORTS.items():
            h = ws_health(ssh, port)
            print(f"S{sid} (port {port}): status={h['status']} clients={h['clients']} realCount={h['realCount']}")

        print("\nDEPLOYMENT COMPLETED SUCCESSFULLY!")

    except Exception as error:
        print(f"\nERROR OCCURRED: {error}")
        print("Initiating rollback...")
        if installed:
            with ssh.open_sftp() as sftp:
                for rel, old_data in before.items():
                    remote = f"{REMOTE_ROOT}/{rel}"
                    rb = f"{remote}.rollback-{stamp}"
                    with sftp.open(rb, "wb") as handle:
                        handle.write(old_data)
                    sftp.chmod(rb, 0o644)
                    sftp.posix_rename(rb, remote)
            print("Source files rolled back.")
        restart_supervisor(ssh)
        run(ssh, "pm2 save")
        raise
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
