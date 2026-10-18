"""Deploy bounded map-activated real-bot workers to every opened server.

The local ecosystem file is intentionally not used: it predates S5/S6.  This
script changes only the three shared worker/supervisor source files and the
effective PM2 environment of the six exact worker names.  It never writes
players, Mongo, Redis, or game configuration.
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
REMOTE_ROOT = "/linhhoasu/lhs/newServer"
FILES = {
    "src/bots/RealBotWorker.js": ROOT / "linhhoasu/lhs/newServer/src/bots/RealBotWorker.js",
    "src/services/BotFleetPolicyService.js": ROOT / "linhhoasu/lhs/newServer/src/services/BotFleetPolicyService.js",
    "scripts/manage-bot-fleet.js": ROOT / "linhhoasu/lhs/newServer/scripts/manage-bot-fleet.js",
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
    "BOT_WORKER_LAZY_MAP_ACTIVATION": "1",
    "BOT_WORKER_LAZY_BOTS_PER_MAP": "3",
    "BOT_WORKER_LAZY_MAX_ACTIVE": "30",
    "BOT_WORKER_LAZY_DISCONNECT_GRACE_MS": "60000",
    "BOT_WORKER_LAZY_DRAIN_TIMEOUT_MS": "30000",
    "BOT_WORKER_LAZY_ACTIVITY_STALE_MS": "90000",
}
ALLOW_ENV = [
    "BOT_WORKER_ENABLED", "BOT_WORKER_COUNT", "BOT_WORKER_SERVER_ID",
    "BOT_WORKER_WS_URL", "BOT_WORKER_ACTIVITY_URL", "BOT_WORKER_MAP_IDS",
    "BOT_WORKER_MAP_LINE", "BOT_WORKER_LAZY_MAP_ACTIVATION",
    "BOT_WORKER_LAZY_BOTS_PER_MAP", "BOT_WORKER_LAZY_MAX_ACTIVE",
    "BOT_WORKER_LAZY_DISCONNECT_GRACE_MS", "BOT_WORKER_LAZY_DRAIN_TIMEOUT_MS",
    "BOT_WORKER_LAZY_ACTIVITY_STALE_MS", "BOT_FLEET_MODE", "SERVER_ID", "HTTP_PORT",
]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def q(value: str) -> str:
    return shlex.quote(str(value))


def pm2_snapshot(ssh):
    expr = (
        "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{"
        "const names=new Set(" + json.dumps(list(WORKERS.values()) + list(GAME_NAMES.values()) + ["lhs-bot-fleet-supervisor"]) + ");"
        "const rows=JSON.parse(s).filter(p=>names.has(p.name)).map(p=>{const e=p.pm2_env||{},v={...(e.env||{}),...e};"
        "return {name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time,"
        "cpu:p.monit&&p.monit.cpu,rss:p.monit&&p.monit.memory,"
        "env:Object.fromEntries(Object.entries(v).filter(([k])=>" + json.dumps(ALLOW_ENV) + ".includes(k)))};});"
        "console.log(JSON.stringify(rows));});"
    )
    return json.loads(run(ssh, "pm2 jlist | node -e " + q(expr)))


def readiness(ssh, port: int, attempts: int = 12) -> bool:
    for _ in range(attempts):
        code = run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}}' --connect-timeout 2 --max-time 8 http://127.0.0.1:{port}/ready || true").strip()
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
    }


def worker_assigns(server_id: int):
    ws_port = WS_PORTS[server_id]
    env = {
        "BOT_WORKER_ENABLED": "1",
        "BOT_WORKER_COUNT": "580",
        "BOT_WORKER_SERVER_ID": str(server_id),
        "BOT_WORKER_WS_URL": f"ws://127.0.0.1:{ws_port}",
        "BOT_WORKER_ACTIVITY_URL": f"http://127.0.0.1:{ws_port}/bot-activity",
        "BOT_WORKER_MAP_IDS": "all",
        "BOT_WORKER_MAP_LINE": "0",
        **LAZY_ENV,
    }
    return " ".join(f"{key}={q(value)}" for key, value in env.items())


def restart_worker(ssh, server_id: int, status: str):
    name = WORKERS[server_id]
    action = "restart" if status == "online" else "start"
    assigns = worker_assigns(server_id)
    run(ssh, f"env {assigns} pm2 {action} {q(name)} --update-env >/dev/null")


def restart_supervisor(ssh):
    run(ssh, "env BOT_FLEET_MODE=lazy-all pm2 restart lhs-bot-fleet-supervisor --update-env >/dev/null")


def restore_source_cas(ssh, before: dict[str, bytes], candidate: dict[str, bytes], installed: list[str]):
    """Restore only files that still contain this release's candidate bytes.

    A rollback must not overwrite an operator change made after the swap.  Do
    one read-only preflight for every installed file before writing any of
    them; if a file drifted, leave the live tree untouched and require manual
    review instead of doing a partial rollback.
    """
    with ssh.open_sftp() as sftp:
        current = {}
        for rel in installed:
            remote = f"{REMOTE_ROOT}/{rel}"
            with sftp.open(remote, "rb") as handle:
                current[rel] = handle.read()
        drift = {
            rel: {"current": sha(data), "candidate": sha(candidate[rel]), "before": sha(before[rel])}
            for rel, data in current.items()
            if data not in (candidate[rel], before[rel])
        }
        if drift:
            raise RuntimeError(f"ROLLBACK_NEEDS_MANUAL_CHECK:{drift}")
        for rel, data in current.items():
            if data == before[rel]:
                continue
            remote = f"{REMOTE_ROOT}/{rel}"
            tmp = f"{remote}.rollback-{int(time.time())}"
            with sftp.open(tmp, "wb") as handle:
                handle.write(before[rel])
            sftp.chmod(tmp, 0o644)
            sftp.posix_rename(tmp, remote)


def restore_worker_env(ssh, row: dict):
    """Restore the captured worker behavior and status, not a guessed baseline."""
    name = str(row.get("name") or "")
    env = row.get("env") or {}
    assigns_env = dict(env)
    # A missing lazy flag is the legacy/eager behavior.  Explicitly disabling
    # the opt-in flag prevents a partial rollback from inheriting the candidate.
    assigns_env["BOT_WORKER_LAZY_MAP_ACTIVATION"] = str(env.get("BOT_WORKER_LAZY_MAP_ACTIVATION", "0"))
    assigns = " ".join(f"{key}={q(value)}" for key, value in assigns_env.items())
    status = str(row.get("status") or "stopped")
    if status == "online":
        run(ssh, f"env {assigns} pm2 restart {q(name)} --update-env >/dev/null")
    else:
        run(ssh, f"env {assigns} pm2 restart {q(name)} --update-env >/dev/null")
        run(ssh, f"pm2 stop {q(name)} >/dev/null")


def restore_supervisor(ssh, row: dict):
    name = str(row.get("name") or "lhs-bot-fleet-supervisor")
    env = row.get("env") or {}
    mode = str(env.get("BOT_FLEET_MODE") or "newest-two")
    assigns = f"BOT_FLEET_MODE={q(mode)}"
    status = str(row.get("status") or "stopped")
    run(ssh, f"env {assigns} pm2 restart {q(name)} --update-env >/dev/null")
    if status != "online":
        run(ssh, f"pm2 stop {q(name)} >/dev/null")


def snapshot_row(snapshot: list[dict], name: str):
    for row in snapshot:
        if row.get("name") == name:
            return row
    return None


def lazy_worker_contract(snapshot: list[dict], server_id: int):
    row = snapshot_row(snapshot, WORKERS[server_id])
    if not row or row.get("status") != "online":
        raise RuntimeError(f"LAZY_WORKER_NOT_ONLINE:S{server_id - 1000}:{row}")
    env = row.get("env") or {}
    expected = {
        "BOT_WORKER_ENABLED": "1",
        "BOT_WORKER_COUNT": "580",
        "BOT_WORKER_SERVER_ID": str(server_id),
        "BOT_WORKER_WS_URL": f"ws://127.0.0.1:{WS_PORTS[server_id]}",
        "BOT_WORKER_LAZY_MAP_ACTIVATION": "1",
        "BOT_WORKER_LAZY_BOTS_PER_MAP": "3",
        "BOT_WORKER_LAZY_MAX_ACTIVE": "30",
        "BOT_WORKER_LAZY_DISCONNECT_GRACE_MS": "60000",
        "BOT_WORKER_LAZY_DRAIN_TIMEOUT_MS": "30000",
        "BOT_WORKER_LAZY_ACTIVITY_STALE_MS": "90000",
    }
    mismatches = {key: {"expected": value, "actual": env.get(key)}
                  for key, value in expected.items() if str(env.get(key)) != value}
    if mismatches:
        raise RuntimeError(f"LAZY_WORKER_ENV_CONTRACT_FAILED:S{server_id - 1000}:{mismatches}")
    return row


def wait_lazy_contract(ssh, server_id: int, attempts: int = 20):
    last = None
    for _ in range(attempts):
        snapshot = pm2_snapshot(ssh)
        row = snapshot_row(snapshot, WORKERS[server_id])
        if not row:
            last = {"worker": None, "reason": "worker_missing"}
            time.sleep(1)
            continue
        if row.get("status") != "online":
            # PM2 can expose `stopping`/`launching` for a short interval when
            # a formerly stopped scheduled worker is started.  Treat that as
            # a bounded transition, not an immediate release failure.
            last = {"worker": row, "reason": "worker_transition"}
            time.sleep(1)
            continue
        try:
            worker = lazy_worker_contract(snapshot, server_id)
            health = ws_health(ssh, WS_PORTS[server_id])
            last = {"worker": worker, "gameHealth": health}
            if health.get("status") == "ok" and (health.get("realCount") or 0) <= 30:
                return last
        except Exception as error:
            last = {"worker": row, "reason": str(error)}
        time.sleep(1)
    raise RuntimeError(f"LAZY_RUNTIME_CONTRACT_FAILED:S{server_id - 1000}:{last}")


def main():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    evidence_dir = ROOT / "_ai_workbench" / "temp" / f"lazy_real_bots_{stamp}"
    evidence_dir.mkdir(parents=True, exist_ok=False)
    backup = f"/linhhoasu/_ai_workbench/backups/lazy_real_bots_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/lazy_real_bots_{stamp}"
    local = {rel: path.read_bytes() for rel, path in FILES.items()}
    ssh = connect()
    before = {}
    installed = []
    restarted = []
    supervisor_restarted = False
    result = {"release": "lazy_real_bots_20260927", "backup": backup,
              "productionWrites": 0, "playerWrites": 0, "mongoWrites": 0, "redisWrites": 0}
    try:
        before_pm2 = pm2_snapshot(ssh)
        result["beforePm2"] = before_pm2
        if len([row for row in before_pm2 if row["name"] in WORKERS.values()]) != 6:
            raise RuntimeError("PM2_WORKER_SET_INCOMPLETE")
        before_by_name = {row["name"]: row for row in before_pm2}
        before_supervisor = before_by_name.get("lhs-bot-fleet-supervisor")
        if before_supervisor is None:
            raise RuntimeError("PM2_SUPERVISOR_MISSING")
        result["beforeReady"] = {str(sid): readiness(ssh, port, 3) for sid, port in GAME_PORTS.items()}
        not_ready = [int(sid) for sid, ok in result["beforeReady"].items() if not ok]
        if not_ready:
            # S6 is the canary precisely because its eager 580-socket worker
            # is the known overload source.  Permit only that one degraded
            # preflight when PM2 still reports the game process online; the
            # canary restart must bring it back to 200 before any other
            # worker is touched.  Any other degraded server remains fail
            # closed.
            canary_game = before_by_name.get(GAME_NAMES[1006]) or {}
            canary_status = str(canary_game.get("status") or "").lower()
            if not (set(not_ready) == {1006} and canary_status == "online"):
                raise RuntimeError(f"PRE_DEPLOY_READINESS_FAILED:{not_ready}")
            result["degradedCanaryPreflight"] = {
                "serverId": 1006,
                "gameStatus": canary_status,
                "reason": "S6_EAGER_WORKER_OVERLOAD",
            }
        with ssh.open_sftp() as sftp:
            run(ssh, f"install -d -m 700 {q(backup)} {q(stage)}")
            manifest = {"createdAt": datetime.now(timezone.utc).isoformat(), "files": {}}
            for rel, data in local.items():
                remote = f"{REMOTE_ROOT}/{rel}"
                with sftp.open(remote, "rb") as handle:
                    old = handle.read()
                before[rel] = old
                remote_stage = f"{stage}/{rel}"
                run(ssh, f"install -d -m 700 {q(str(Path(remote_stage).parent).replace(chr(92), '/'))}")
                run(ssh, f"install -d -m 700 {q(str(Path(f'{backup}/{rel}').parent).replace(chr(92), '/'))}")
                with sftp.open(remote_stage, "wb") as handle:
                    handle.write(data)
                with sftp.open(f"{backup}/{rel}.before", "wb") as handle:
                    handle.write(old)
                sftp.chmod(remote_stage, 0o600)
                sftp.chmod(f"{backup}/{rel}.before", 0o600)
                manifest["files"][rel] = {"beforeSha256": sha(old), "candidateSha256": sha(data), "bytes": len(data)}
            with sftp.open(f"{backup}/manifest.json", "wb") as handle:
                handle.write((json.dumps(manifest, indent=2) + "\n").encode())
        result["sourceManifest"] = manifest
        # Candidate syntax checks happen before any live swap.
        for rel in FILES:
            stage_file = f"{stage}/{rel}"
            run(ssh, f"node --check {q(stage_file)}")
        # Exact CAS install; any drift aborts before the first replacement.
        with ssh.open_sftp() as sftp:
            for rel, data in local.items():
                remote = f"{REMOTE_ROOT}/{rel}"
                with sftp.open(remote, "rb") as handle:
                    current = handle.read()
                if current != before[rel]:
                    raise RuntimeError(f"CAS_DRIFT:{rel}")
                candidate = f"{remote}.candidate-{stamp}"
                with sftp.open(candidate, "wb") as handle:
                    handle.write(data)
                sftp.chmod(candidate, 0o644)
                sftp.posix_rename(candidate, remote)
                installed.append(rel)
                with sftp.open(remote, "rb") as handle:
                    if handle.read() != data:
                        raise RuntimeError(f"POST_SWAP_HASH_MISMATCH:{rel}")
        # Read-back tests use the installed source but remain offline.
        run(ssh, f"cd {q(REMOTE_ROOT)} && node src/bots/RealBotWorker.js --self-test")
        # Put the supervisor in the same lazy-all mode before any worker is
        # restarted.  Its old newest-two loop could otherwise race this
        # staged rollout and stop a worker that has just been made lazy.
        restart_supervisor(ssh)
        supervisor_restarted = True
        result["supervisorMode"] = "lazy-all"
        result["canary"] = "S6"
        restart_worker(ssh, 1006, before_by_name[WORKERS[1006]]["status"])
        restarted.append(1006)
        if not readiness(ssh, GAME_PORTS[1006], 30):
            raise RuntimeError("S6_CANARY_GAME_NOT_READY")
        result["canaryHealth"] = wait_lazy_contract(ssh, 1006)
        # Other servers are changed only after S6 proves the bounded contract.
        for server_id in (1001, 1002, 1003, 1004, 1005):
            restart_worker(ssh, server_id, before_by_name[WORKERS[server_id]]["status"])
            restarted.append(server_id)
            if not readiness(ssh, GAME_PORTS[server_id], 30):
                raise RuntimeError(f"S{server_id - 1000}_GAME_NOT_READY")
            result.setdefault("workerHealth", {})[str(server_id)] = wait_lazy_contract(ssh, server_id)
        run(ssh, "pm2 save")
        result["afterReady"] = {str(sid): readiness(ssh, port, 15) for sid, port in GAME_PORTS.items()}
        if not all(result["afterReady"].values()):
            raise RuntimeError("POST_DEPLOY_READINESS_FAILED")
        result["afterHealth"] = {
            str(sid): wait_lazy_contract(ssh, sid, attempts=5) for sid in WORKERS
        }
        result["afterPm2"] = pm2_snapshot(ssh)
        supervisor_after = snapshot_row(result["afterPm2"], "lhs-bot-fleet-supervisor")
        if not supervisor_after or supervisor_after.get("status") != "online" \
                or (supervisor_after.get("env") or {}).get("BOT_FLEET_MODE") != "lazy-all":
            raise RuntimeError(f"LAZY_SUPERVISOR_CONTRACT_FAILED:{supervisor_after}")
        result["result"] = "PASS"
        result["restartOrder"] = restarted
        result["completedAt"] = datetime.now(timezone.utc).isoformat()
        (evidence_dir / "release.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(json.dumps({"result": "PASS", "evidence": str(evidence_dir / "release.json"), "backup": backup}, ensure_ascii=False))
    except Exception as error:
        result["result"] = "ROLLBACK_REQUIRED"
        result["error"] = str(error)
        result["restartedBeforeFailure"] = restarted
        try:
            if installed:
                restore_source_cas(ssh, before, local, installed)
            for sid in reversed(restarted):
                restore_worker_env(ssh, before_by_name[WORKERS[sid]])
            if supervisor_restarted:
                restore_supervisor(ssh, before_supervisor)
            run(ssh, "pm2 save")
            result["rollbackPm2"] = pm2_snapshot(ssh)
            result["rollback"] = "PASS"
        except Exception as rollback_error:
            result["rollback"] = "FAILED"
            result["rollbackError"] = str(rollback_error)
        (evidence_dir / "release.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(json.dumps({"result": result["result"], "evidence": str(evidence_dir / "release.json"), "error": result["error"], "rollback": result.get("rollback")}, ensure_ascii=False))
        raise
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
