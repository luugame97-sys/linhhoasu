"""Stop the disabled S6 worker to prevent PM2 restart-loop CPU churn."""
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


def q(v):
    return shlex.quote(str(v))


def snapshot(ssh):
    js = """let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const names=new Set(['lhs-s1006','lhs-real-bots-s6']);console.log(JSON.stringify(JSON.parse(s).filter(p=>names.has(p.name)).map(p=>{const e=p.pm2_env||{},v={...(e.env||{}),...e};return {name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time,cpu:p.monit&&p.monit.cpu,rss:p.monit&&p.monit.memory,env:Object.fromEntries(Object.entries(v).filter(([k])=>['BOT_ENABLED','BOT_COUNT_PER_MAP','BOT_MAX_TOTAL','BOT_WORKER_ENABLED','BOT_WORKER_COUNT','BOT_WORKER_SERVER_ID','BOT_WORKER_LAZY_MAP_ACTIVATION','BOT_WORKER_LAZY_BOTS_PER_MAP','BOT_WORKER_LAZY_MAX_ACTIVE'].includes(k)))};})));});"""
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


def wait_stopped(ssh, attempts=20):
    for _ in range(attempts):
        item = row(snapshot(ssh), WORKER)
        if item and item.get("status") in {"stopped", "stopping", "errored"}:
            return item
        time.sleep(1)
    return row(snapshot(ssh), WORKER)


def restore_enabled(ssh, worker):
    env = dict(worker.get("env") or {})
    env["BOT_WORKER_ENABLED"] = "1"
    assigns = " ".join(f"{k}={q(v)}" for k, v in env.items())
    run(ssh, f"env {assigns} pm2 restart {q(WORKER)} --update-env >/dev/null")
    run(ssh, "pm2 save >/dev/null")


def main():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    evidence_dir = ROOT / "_ai_workbench" / "temp" / f"s6_stop_disabled_worker_{stamp}"
    evidence_dir.mkdir(parents=True, exist_ok=False)
    backup = f"/linhhoasu/_ai_workbench/backups/s6_stop_disabled_worker_{stamp}"
    ssh = connect()
    before_worker = None
    result = {"release": "s6_stop_disabled_worker_20260928", "backup": backup,
              "productionWrites": 0, "playerWrites": 0, "mongoWrites": 0, "redisWrites": 0}
    try:
        before = snapshot(ssh)
        result["beforePm2"] = before
        game = row(before, GAME)
        before_worker = row(before, WORKER)
        if not game or game.get("status") != "online":
            raise RuntimeError(f"S6_GAME_NOT_ONLINE:{game}")
        if not before_worker or before_worker.get("status") not in {"online", "restarting"}:
            raise RuntimeError(f"S6_WORKER_NOT_ACTIVE:{before_worker}")
        if str((game.get("env") or {}).get("BOT_ENABLED")) != "0":
            raise RuntimeError(f"S6_VIRTUAL_BOTS_NOT_OFF:{game.get('env')}")
        if str((before_worker.get("env") or {}).get("BOT_WORKER_ENABLED")) != "0":
            raise RuntimeError(f"S6_WORKER_NOT_DISABLED:{before_worker.get('env')}")
        run(ssh, f"install -d -m 700 {q(backup)}")
        with ssh.open_sftp() as sftp:
            with sftp.open(f"{backup}/manifest.json", "wb") as h:
                h.write((json.dumps({"createdAt": datetime.now(timezone.utc).isoformat(), "scope": [WORKER], "before": before}, indent=2) + "\n").encode())
            sftp.chmod(f"{backup}/manifest.json", 0o600)
        latest = snapshot(ssh)
        latest_worker = row(latest, WORKER)
        if not latest_worker or latest_worker.get("pid") != before_worker.get("pid") or latest_worker.get("env") != before_worker.get("env"):
            raise RuntimeError(f"S6_WORKER_CAS_DRIFT:{latest_worker}")
        run(ssh, f"pm2 stop {q(WORKER)} >/dev/null")
        result["workerStopped"] = True
        run(ssh, "pm2 save >/dev/null")
        result["pm2Saved"] = True
        result["stoppedReadback"] = wait_stopped(ssh)
        result["ready"] = probe(ssh, HTTP, "ready")
        result["health"] = health(ssh)
        time.sleep(30)
        result["dwellWorker"] = wait_stopped(ssh, attempts=3)
        result["dwellReady"] = probe(ssh, HTTP, "ready")
        result["dwellHealth"] = health(ssh)
        result["afterPm2"] = snapshot(ssh)
        if result["dwellWorker"].get("status") not in {"stopped", "stopping", "errored"}:
            raise RuntimeError(f"S6_WORKER_RESTARTED_UNEXPECTEDLY:{result['dwellWorker']}")
        if result["dwellReady"].get("code") != "200" or result["dwellHealth"].get("status") != "ok":
            raise RuntimeError(f"S6_GAME_UNHEALTHY:{result['dwellReady']}:{result['dwellHealth']}")
        if int(result["dwellHealth"].get("realCount") or 0) != 0:
            raise RuntimeError(f"S6_REAL_BOTS_REMAIN:{result['dwellHealth']}")
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
            if before_worker:
                restore_enabled(ssh, before_worker)
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
