"""Install and start the future two-newest real-bot supervisor.

The helper is deliberately separate from the one-time S1-S4 rollout.  It
backs up only the two newly introduced source files, performs a read-only
remote dry-run, then starts one exact PM2 process and verifies its first
decision.  It never writes player, Mongo, or Redis data; the supervisor only
reads GameServer metadata and changes PM2 worker processes.
"""

from __future__ import annotations

import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
REMOTE_ROOT = "/linhhoasu/lhs/newServer"
FILES = {
    "src/services/BotFleetPolicyService.js": ROOT / "linhhoasu/lhs/newServer/src/services/BotFleetPolicyService.js",
    "scripts/manage-bot-fleet.js": ROOT / "linhhoasu/lhs/newServer/scripts/manage-bot-fleet.js",
}
SUPERVISOR = "lhs-bot-fleet-supervisor"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    local_evidence = ROOT / "_ai_workbench" / "temp" / f"bot_fleet_supervisor_{stamp}"
    local_evidence.mkdir(parents=True, exist_ok=False)
    backup = f"/linhhoasu/_ai_workbench/backups/bot_fleet_supervisor_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/bot_fleet_supervisor_{stamp}"
    ssh = connect()
    installed = []
    started = False
    supervisor_exists = False
    try:
        pm2_probe = json.loads(run(ssh, "pm2 jlist | node -e " + shlex.quote("let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s).find(x=>x.name==='lhs-bot-fleet-supervisor'); console.log(JSON.stringify(!!p));});")))
        supervisor_exists = bool(pm2_probe)
        with ssh.open_sftp() as sftp:
            local = {rel: path.read_bytes() for rel, path in FILES.items()}
            prior = {}
            for rel in FILES:
                remote = f"{REMOTE_ROOT}/{rel}"
                try:
                    prior[rel] = sftp.open(remote, "rb").read()
                except FileNotFoundError:
                    prior[rel] = None
            run(ssh, f"install -d -m 700 {shlex.quote(backup)} {shlex.quote(stage)}")
            manifest = {"createdAt": datetime.now(timezone.utc).isoformat(), "files": {}}
            for rel, data in local.items():
                remote_stage = f"{stage}/{rel}"
                parent = str(Path(remote_stage).parent).replace("\\", "/")
                run(ssh, f"install -d -m 700 {shlex.quote(parent)}")
                backup_parent = str(Path(f"{backup}/{rel}").parent).replace("\\", "/")
                run(ssh, f"install -d -m 700 {shlex.quote(backup_parent)}")
                with sftp.open(remote_stage, "wb") as handle:
                    handle.write(data)
                sftp.chmod(remote_stage, 0o600)
                old = prior[rel]
                old_hash = sha(old) if old is not None else None
                with sftp.open(f"{backup}/{rel}.before", "wb") as handle:
                    handle.write(old or b"")
                sftp.chmod(f"{backup}/{rel}.before", 0o600)
                manifest["files"][rel] = {
                    "beforeSha256": old_hash,
                    "candidateSha256": sha(data),
                    "beforeExists": old is not None,
                }
            with sftp.open(f"{backup}/manifest.json", "wb") as handle:
                handle.write((json.dumps(manifest, indent=2) + "\n").encode())
        run(ssh, f"node --check {shlex.quote(stage + '/src/services/BotFleetPolicyService.js')}")
        run(ssh, f"node --check {shlex.quote(stage + '/scripts/manage-bot-fleet.js')}")
        # Install exact files only after staging and syntax checks.
        with ssh.open_sftp() as sftp:
            for rel in FILES:
                remote = f"{REMOTE_ROOT}/{rel}"
                if prior[rel] is not None:
                    with sftp.open(remote, "rb") as current_file:
                        current = current_file.read()
                    if current != prior[rel]:
                        raise RuntimeError(f"CAS_DRIFT:{rel}")
                else:
                    try:
                        with sftp.open(remote, "rb") as current_file:
                            current_file.read(1)
                    except FileNotFoundError:
                        pass
                    else:
                        raise RuntimeError(f"CAS_UNEXPECTED_EXISTING:{rel}")
                parent = str(Path(remote).parent).replace("\\", "/")
                run(ssh, f"install -d -m 755 {shlex.quote(parent)}")
                temp_live = f"{remote}.candidate-{stamp}"
                with sftp.open(temp_live, "wb") as handle:
                    handle.write(local[rel])
                sftp.chmod(temp_live, 0o644)
                sftp.posix_rename(temp_live, remote)
                with sftp.open(remote, "rb") as live_file:
                    live = live_file.read()
                if live != local[rel]:
                    raise RuntimeError(f"POST_INSTALL_HASH_MISMATCH:{rel}")
                installed.append(rel)
        dry = run(
            ssh,
            f"cd {shlex.quote(REMOTE_ROOT)} && "
            f"BOT_FLEET_STATE_PATH={shlex.quote('/linhhoasu/_ai_workbench/temp/bot-fleet-policy-state.json')} "
            f"BOT_FLEET_LOCK_PATH={shlex.quote('/linhhoasu/_ai_workbench/temp/bot-fleet-policy.lock')} "
            f"node scripts/manage-bot-fleet.js --dry-run --once",
        ).strip()
        plan = json.loads(dry.splitlines()[-1])
        if plan.get("result") not in ("DRY_RUN", "NO_OPERATION"):
            raise RuntimeError(f"DRY_RUN_UNEXPECTED:{plan}")
        if plan.get("selectedServerIds") != [1006, 1005]:
            raise RuntimeError(f"NEWEST_SERVER_SELECTION_UNEXPECTED:{plan}")
        # The current rollout already left S1-S4 stopped and S5/S6 active;
        # --apply must therefore be idempotent and make no PM2 change now.
        if any(action.get("action") in ("start", "stop") for action in plan.get("actions", [])):
            raise RuntimeError(f"SUPERVISOR_NOT_IDEMPOTENT:{plan}")
        command = (
            f"cd {shlex.quote(REMOTE_ROOT)} && "
            f"BOT_FLEET_STATE_PATH={shlex.quote('/linhhoasu/_ai_workbench/temp/bot-fleet-policy-state.json')} "
            f"BOT_FLEET_LOCK_PATH={shlex.quote('/linhhoasu/_ai_workbench/temp/bot-fleet-policy.lock')} "
        )
        if supervisor_exists:
            command += f"pm2 restart {shlex.quote(SUPERVISOR)} --update-env"
        else:
            command += f"pm2 start scripts/manage-bot-fleet.js --name {shlex.quote(SUPERVISOR)} --cwd {shlex.quote(REMOTE_ROOT)} --interpreter node -- --apply"
        run(ssh, command)
        started = True
        run(ssh, "pm2 save")
        rows = json.loads(run(ssh, "pm2 jlist | node -e " + shlex.quote("let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s).find(x=>x.name==='lhs-bot-fleet-supervisor'); console.log(JSON.stringify(p?{name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time}:null));});")))
        if not rows or rows.get("status") != "online":
            raise RuntimeError(f"SUPERVISOR_NOT_ONLINE:{rows}")
        result = {"result": "PASS", "backup": backup, "plan": plan, "supervisor": rows, "installed": installed, "playerDataWrites": 0, "mongoWrites": 0, "redisWrites": 0}
        (local_evidence / "release.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"result": "PASS", "evidence": str(local_evidence / "release.json"), "backup": backup}, ensure_ascii=False))
    except Exception:
        if started:
            try:
                if supervisor_exists:
                    run(ssh, f"pm2 restart {shlex.quote(SUPERVISOR)} --update-env")
                else:
                    run(ssh, f"pm2 delete {shlex.quote(SUPERVISOR)}")
                run(ssh, "pm2 save")
            except Exception:
                pass
        try:
            with ssh.open_sftp() as sftp:
                for rel in installed:
                    old = prior[rel]
                    remote = f"{REMOTE_ROOT}/{rel}"
                    tmp = f"{remote}.rollback-{stamp}"
                    if old is None:
                        sftp.remove(remote)
                    else:
                        with sftp.open(tmp, "wb") as handle:
                            handle.write(old)
                        sftp.chmod(tmp, 0o644)
                        sftp.posix_rename(tmp, remote)
        except Exception:
            pass
        raise
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
