"""Deploy the narrow supervisor lock/lifecycle fix with backup and CAS.

This changes only manage-bot-fleet.js and restarts only the supervisor.  Game
processes, bot workers, player data, Mongo, and Redis are not mutated.
"""

from __future__ import annotations

import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / "linhhoasu/lhs/newServer/scripts/manage-bot-fleet.js"
REMOTE = "/linhhoasu/lhs/newServer/scripts/manage-bot-fleet.js"
EXPECTED_REMOTE_SHA256 = "D22D3D863D07DC478D8E6F7C3CC13DB09B2A658CFBF28CA5CEBA790FB327E651"
SUPERVISOR = "lhs-bot-fleet-supervisor"
LOCK = "/linhhoasu/_ai_workbench/temp/bot-fleet-policy.lock"
GAME_PORTS = {1001: 8080, 1002: 8083, 1003: 8084, 1004: 8085, 1005: 8086, 1006: 8087}
WS_PORTS = {1001: 9200, 1002: 9201, 1003: 9202, 1004: 9203, 1005: 9204, 1006: 9205}
WORKERS = {
    1001: "lhs-real-bots", 1002: "lhs-real-bots-s2", 1003: "lhs-real-bots-s3",
    1004: "lhs-real-bots-s4", 1005: "lhs-real-bots-s5", 1006: "lhs-real-bots-s6",
}
GAMES = {sid: f"lhs-s{sid}" for sid in GAME_PORTS}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def q(value: str) -> str:
    return shlex.quote(str(value))


def pm2_snapshot(ssh):
    names = list(WORKERS.values()) + list(GAMES.values()) + [SUPERVISOR]
    expr = (
        "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{"
        "const names=new Set(" + json.dumps(names) + ");"
        "const rows=JSON.parse(s).filter(p=>names.has(p.name)).map(p=>{const e=p.pm2_env||{},v={...(e.env||{}),...e};"
        "return {name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time,uptime:e.pm_uptime,"
        "env:Object.fromEntries(Object.entries(v).filter(([k])=>['BOT_FLEET_MODE','BOT_WORKER_LAZY_MAP_ACTIVATION','BOT_WORKER_LAZY_BOTS_PER_MAP','BOT_WORKER_LAZY_MAX_ACTIVE'].includes(k)))};});"
        "console.log(JSON.stringify(rows));});"
    )
    return json.loads(run(ssh, "pm2 jlist | node -e " + q(expr)))


def row(snapshot, name):
    return next((item for item in snapshot if item.get("name") == name), None)


def ready(ssh, port: int, attempts: int = 12) -> bool:
    for _ in range(attempts):
        code = run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}}' --connect-timeout 2 --max-time 8 http://127.0.0.1:{port}/ready || true").strip()
        if code == "200":
            return True
        time.sleep(1)
    return False


def health(ssh, port: int):
    data = json.loads(run(ssh, f"curl -fsS --connect-timeout 2 --max-time 12 http://127.0.0.1:{port}/health"))
    runtime = data.get("runtime") or {}
    bots = runtime.get("bots") or {}
    real = bots.get("real") or {}
    return {"status": data.get("status"), "clients": runtime.get("clients"), "realCount": real.get("count")}


def lock_info(ssh):
    script = r"""const fs=require('fs');const p=process.argv[1];let exists=false,raw='',ownerPid=null,alive=false;try{raw=fs.readFileSync(p,'utf8');exists=true;ownerPid=Number(JSON.parse(raw).pid);if(Number.isInteger(ownerPid)&&ownerPid>0){try{process.kill(ownerPid,0);alive=true}catch(_){}}}catch(_){}console.log(JSON.stringify({exists,ownerPid,alive,bytes:raw.length}));"""
    return json.loads(run(ssh, "node -e " + q(script) + " " + q(LOCK)))


def main():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    evidence_dir = ROOT / "_ai_workbench/temp" / f"lazy_supervisor_lock_fix_{stamp}"
    evidence_dir.mkdir(parents=True, exist_ok=False)
    backup = f"/linhhoasu/_ai_workbench/backups/lazy_supervisor_lock_fix_{stamp}"
    candidate = LOCAL.read_bytes()
    ssh = connect()
    result = {"release": "lazy_supervisor_lock_fix_20260927", "backup": backup,
              "productionWrites": 0, "playerWrites": 0, "mongoWrites": 0, "redisWrites": 0}
    try:
        before_pm2 = pm2_snapshot(ssh)
        result["beforePm2"] = before_pm2
        result["beforeReady"] = {str(sid): ready(ssh, port, 3) for sid, port in GAME_PORTS.items()}
        if not all(result["beforeReady"].values()):
            raise RuntimeError(f"PRE_DEPLOY_READINESS_FAILED:{result['beforeReady']}")
        before_workers = {str(sid): {"worker": row(before_pm2, WORKERS[sid]), "game": row(before_pm2, GAMES[sid])} for sid in GAME_PORTS}
        before_supervisor = row(before_pm2, SUPERVISOR)
        if not before_supervisor or before_supervisor.get("status") != "online":
            raise RuntimeError("SUPERVISOR_NOT_ONLINE")
        with ssh.open_sftp() as sftp:
            with sftp.open(REMOTE, "rb") as handle:
                before = handle.read()
            remote_hash = sha(before)
            result["beforeSourceSha256"] = remote_hash
            result["candidateSourceSha256"] = sha(candidate)
            if remote_hash.lower() != EXPECTED_REMOTE_SHA256.lower():
                raise RuntimeError(f"SOURCE_BASELINE_MISMATCH:{remote_hash}")
            run(ssh, f"install -d -m 700 {q(backup)}")
            with sftp.open(f"{backup}/manage-bot-fleet.js.before", "wb") as handle:
                handle.write(before)
            sftp.chmod(f"{backup}/manage-bot-fleet.js.before", 0o600)
            lock_before = b""
            try:
                with sftp.open(LOCK, "rb") as handle:
                    lock_before = handle.read()
            except IOError:
                pass
            if lock_before:
                with sftp.open(f"{backup}/bot-fleet-policy.lock.before", "wb") as handle:
                    handle.write(lock_before)
                sftp.chmod(f"{backup}/bot-fleet-policy.lock.before", 0o600)
            manifest = {"createdAt": datetime.now(timezone.utc).isoformat(),
                        "sourceBeforeSha256": remote_hash, "sourceCandidateSha256": sha(candidate),
                        "lockBeforeSha256": sha(lock_before) if lock_before else None,
                        "sourceBytes": len(before), "lockBytes": len(lock_before)}
            with sftp.open(f"{backup}/manifest.json", "wb") as handle:
                handle.write((json.dumps(manifest, indent=2) + "\n").encode())
        expected_before = before
        with ssh.open_sftp() as sftp:
            with sftp.open(REMOTE, "rb") as handle:
                if handle.read() != expected_before:
                    raise RuntimeError("CAS_DRIFT_SOURCE")
            stage = f"{REMOTE}.candidate-{stamp}"
            with sftp.open(stage, "wb") as handle:
                handle.write(candidate)
            sftp.chmod(stage, 0o644)
            sftp.posix_rename(stage, REMOTE)
            with sftp.open(REMOTE, "rb") as handle:
                if handle.read() != candidate:
                    raise RuntimeError("POST_SWAP_HASH_MISMATCH")
        result["sourceSwapped"] = True
        run(ssh, f"pm2 restart {q(SUPERVISOR)} --update-env >/dev/null")
        result["supervisorRestarted"] = True
        after = None
        for _ in range(30):
            after = pm2_snapshot(ssh)
            current = row(after, SUPERVISOR)
            if current and current.get("status") == "online" and current.get("env", {}).get("BOT_FLEET_MODE") == "lazy-all":
                break
            time.sleep(1)
        current = row(after or [], SUPERVISOR)
        if not current or current.get("status") != "online":
            raise RuntimeError(f"SUPERVISOR_NOT_ONLINE_AFTER:{current}")
        result["afterPm2Initial"] = after
        result["afterReady"] = {str(sid): ready(ssh, port, 12) for sid, port in GAME_PORTS.items()}
        if not all(result["afterReady"].values()):
            raise RuntimeError(f"POST_DEPLOY_READINESS_FAILED:{result['afterReady']}")
        result["afterHealth"] = {str(sid): health(ssh, WS_PORTS[sid]) for sid in GAME_PORTS}
        bad = {sid: info for sid, info in result["afterHealth"].items()
               if info.get("status") != "ok" or info.get("realCount") is None
               or int(info.get("realCount") or 0) > 30}
        if bad:
            raise RuntimeError(f"BOT_HEALTH_CONTRACT_FAILED:{bad}")
        time.sleep(20)
        stable = pm2_snapshot(ssh)
        stable_supervisor = row(stable, SUPERVISOR)
        if not stable_supervisor or stable_supervisor.get("status") != "online":
            raise RuntimeError(f"SUPERVISOR_UNSTABLE:{stable_supervisor}")
        if int(stable_supervisor.get("restarts") or 0) != int(current.get("restarts") or 0):
            raise RuntimeError(f"SUPERVISOR_RESTART_STORM:{current.get('restarts')}->{stable_supervisor.get('restarts')}")
        for sid in GAME_PORTS:
            before_game = (before_workers[str(sid)]["game"] or {}).get("pid")
            after_game = (row(stable, GAMES[sid]) or {}).get("pid")
            if before_game != after_game:
                raise RuntimeError(f"GAME_PID_CHANGED:S{sid - 1000}:{before_game}->{after_game}")
        result["stablePm2"] = stable
        result["stableLock"] = lock_info(ssh)
        if not result["stableLock"].get("exists") or not result["stableLock"].get("alive"):
            raise RuntimeError(f"SUPERVISOR_LOCK_NOT_LIVE:{result['stableLock']}")
        result["result"] = "PASS"
        result["completedAt"] = datetime.now(timezone.utc).isoformat()
        (evidence_dir / "release.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"result": "PASS", "evidence": str(evidence_dir / "release.json"), "backup": backup}))
    except Exception as error:
        result["result"] = "FAILED_AFTER_MUTATION"
        result["error"] = str(error)
        result["afterFailurePm2"] = pm2_snapshot(ssh)
        (evidence_dir / "release.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"result": result["result"], "evidence": str(evidence_dir / "release.json"), "error": result["error"]}))
        raise
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
