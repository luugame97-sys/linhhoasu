"""Canary-disable only S6 lazy real-bot worker, with CAS and rollback."""
from __future__ import annotations

import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
GAME = "lhs-s1006"
WORKER = "lhs-real-bots-s6"
HTTP = 8087
WS = 9205
KEEP_KEYS = [
    "BOT_WORKER_ENABLED", "BOT_WORKER_COUNT", "BOT_WORKER_SERVER_ID",
    "BOT_WORKER_WS_URL", "BOT_WORKER_ACTIVITY_URL", "BOT_WORKER_MAP_IDS",
    "BOT_WORKER_MAP_LINE", "BOT_WORKER_LAZY_MAP_ACTIVATION",
    "BOT_WORKER_LAZY_BOTS_PER_MAP", "BOT_WORKER_LAZY_MAX_ACTIVE",
    "BOT_WORKER_LAZY_DISCONNECT_GRACE_MS", "BOT_WORKER_LAZY_DRAIN_TIMEOUT_MS",
    "BOT_WORKER_LAZY_ACTIVITY_STALE_MS", "BOT_FLEET_MODE", "SERVER_ID", "HTTP_PORT",
    "BOT_ENABLED", "BOT_COUNT_PER_MAP", "BOT_MAX_TOTAL",
]


def q(value):
    return shlex.quote(str(value))


def snapshot(ssh):
    names = json.dumps([GAME, WORKER])
    js = (
        "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const n=new Set(" + names + ");"
        "console.log(JSON.stringify(JSON.parse(s).filter(p=>n.has(p.name)).map(p=>{const e=p.pm2_env||{},v={...(e.env||{}),...e};"
        "return {name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time,cpu:p.monit&&p.monit.cpu,rss:p.monit&&p.monit.memory,"
        "env:Object.fromEntries(Object.entries(v).filter(([k])=>" + json.dumps(KEEP_KEYS) + ".includes(k)))};})));});"
    )
    return json.loads(run(ssh, "pm2 jlist | node -e " + q(js)))


def row(rows, name):
    return next((r for r in rows if r.get("name") == name), None)


def probe(ssh, port, path, timeout=8):
    raw = run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}} %{{time_total}}' --connect-timeout 2 --max-time {timeout} http://127.0.0.1:{port}/{path} || true").strip()
    code, _, elapsed = raw.partition(" ")
    return {"code": code, "seconds": elapsed}


def health(ssh):
    raw = run(ssh, f"curl -fsS --connect-timeout 2 --max-time 12 http://127.0.0.1:{WS}/health")
    data = json.loads(raw)
    runtime = data.get("runtime") or {}
    bots = runtime.get("bots") or {}
    real = bots.get("real") or {}
    return {"status": data.get("status"), "clients": runtime.get("clients"),
            "botCount": bots.get("botCount"), "realCount": real.get("count"),
            "botsEnabled": bots.get("enabled")}


def wait_ready(ssh, attempts=45):
    samples = []
    for _ in range(attempts):
        sample = probe(ssh, HTTP, "ready")
        samples.append(sample)
        if sample.get("code") == "200":
            return True, samples
        time.sleep(1)
    return False, samples


def restore_worker(ssh, before):
    env = before.get("env") or {}
    assigns = " ".join(f"{k}={q(v)}" for k, v in env.items())
    run(ssh, f"env {assigns} pm2 restart {q(WORKER)} --update-env >/dev/null")
    run(ssh, "pm2 save >/dev/null")


def main():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    evidence_dir = ROOT / "_ai_workbench" / "temp" / f"s6_disable_real_worker_{stamp}"
    evidence_dir.mkdir(parents=True, exist_ok=False)
    backup = f"/linhhoasu/_ai_workbench/backups/s6_disable_real_worker_{stamp}"
    ssh = connect()
    result = {"release": "s6_disable_real_worker_20260928", "backup": backup,
              "productionWrites": 0, "playerWrites": 0, "mongoWrites": 0, "redisWrites": 0}
    before = None
    try:
        rows = snapshot(ssh)
        result["beforePm2"] = rows
        game = row(rows, GAME)
        worker = row(rows, WORKER)
        if not game or game.get("status") != "online":
            raise RuntimeError(f"S6_GAME_NOT_ONLINE:{game}")
        if not worker or worker.get("status") != "online":
            raise RuntimeError(f"S6_WORKER_NOT_ONLINE:{worker}")
        if str((game.get("env") or {}).get("BOT_ENABLED")) != "0":
            raise RuntimeError(f"S6_VIRTUAL_BOTS_NOT_OFF:{game.get('env')}")
        if str((worker.get("env") or {}).get("BOT_WORKER_ENABLED")) != "1":
            raise RuntimeError(f"S6_WORKER_CAS_BASELINE_FAILED:{worker.get('env')}")
        before = worker
        result["beforeReady"] = probe(ssh, HTTP, "ready")
        result["beforeHealth"] = health(ssh)
        run(ssh, f"install -d -m 700 {q(backup)}")
        manifest = {"createdAt": datetime.now(timezone.utc).isoformat(), "scope": [WORKER], "game": game, "worker": worker,
                    "candidate": {"BOT_WORKER_ENABLED": "0"}}
        with ssh.open_sftp() as sftp:
            with sftp.open(f"{backup}/manifest.json", "wb") as h:
                h.write((json.dumps(manifest, indent=2) + "\n").encode())
            sftp.chmod(f"{backup}/manifest.json", 0o600)
        latest = snapshot(ssh)
        latest_worker = row(latest, WORKER)
        if not latest_worker or latest_worker.get("pid") != worker.get("pid") or latest_worker.get("env") != worker.get("env"):
            raise RuntimeError(f"S6_WORKER_CAS_DRIFT:{latest_worker}")
        assigns = " ".join(f"{k}={q(v)}" for k, v in (worker.get("env") or {}).items())
        assigns = assigns.replace("BOT_WORKER_ENABLED=1", "BOT_WORKER_ENABLED=0", 1)
        run(ssh, f"env {assigns} pm2 restart {q(WORKER)} --update-env >/dev/null")
        result["workerRestarted"] = True
        ok, samples = wait_ready(ssh)
        result["readySamples"] = samples
        if not ok:
            raise RuntimeError("S6_READY_NOT_RECOVERED")
        result["afterHealth"] = health(ssh)
        if result["afterHealth"].get("status") != "ok":
            raise RuntimeError(f"S6_HEALTH_NOT_OK:{result['afterHealth']}")
        run(ssh, "pm2 save >/dev/null")
        result["pm2Saved"] = True
        time.sleep(30)
        ok, samples = wait_ready(ssh, attempts=10)
        result["dwellReadySamples"] = samples
        result["dwellHealth"] = health(ssh)
        if not ok or result["dwellHealth"].get("status") != "ok":
            raise RuntimeError(f"S6_DWELL_UNSTABLE:{result['dwellHealth']}")
        result["afterPm2"] = snapshot(ssh)
        after_worker = row(result["afterPm2"], WORKER)
        if str((after_worker or {}).get("env", {}).get("BOT_WORKER_ENABLED")) != "0":
            raise RuntimeError(f"S6_WORKER_ENV_READBACK_FAILED:{after_worker}")
        if row(result["afterPm2"], GAME).get("pid") != game.get("pid"):
            raise RuntimeError("S6_GAME_CHANGED")
        result["result"] = "PASS"
        result["completedAt"] = datetime.now(timezone.utc).isoformat()
        (evidence_dir / "release.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"result": "PASS", "evidence": str(evidence_dir / "release.json"), "backup": backup}))
    except Exception as error:
        result["result"] = "ROLLBACK_REQUIRED"
        result["error"] = str(error)
        try:
            if before:
                restore_worker(ssh, before)
                result["rollback"] = "PASS"
                result["rollbackPm2"] = snapshot(ssh)
            else:
                result["rollback"] = "NOT_ATTEMPTED"
        except Exception as rollback_error:
            result["rollback"] = "FAILED"
            result["rollbackError"] = str(rollback_error)
        (evidence_dir / "release.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"result": result["result"], "evidence": str(evidence_dir / "release.json"), "error": result["error"], "rollback": result.get("rollback")}))
        raise
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
