"""Disable only S6's server-native virtual population after residual lag.

S6 remains on the lazy real-bot worker.  This is a reversible PM2 env canary;
it does not touch player, Mongo, Redis, reward, or real-bot worker state.
"""

from __future__ import annotations

import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
S6 = "lhs-s1006"
S6_WORKER = "lhs-real-bots-s6"
HTTP = 8087
WS = 9205
GAME_NAMES = [f"lhs-s{sid}" for sid in range(1001, 1007)]
BASELINE = {"BOT_ENABLED": "1", "BOT_COUNT_PER_MAP": "3", "BOT_MAX_TOTAL": "324"}
TARGET = {"BOT_ENABLED": "0", "BOT_COUNT_PER_MAP": "3", "BOT_MAX_TOTAL": "324"}


def q(value: str) -> str:
    return shlex.quote(str(value))


def pm2_snapshot(ssh):
    names = GAME_NAMES + [S6_WORKER]
    expr = (
        "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{"
        "const n=new Set(" + json.dumps(names) + ");"
        "console.log(JSON.stringify(JSON.parse(s).filter(p=>n.has(p.name)).map(p=>{const e=p.pm2_env||{},v={...(e.env||{}),...e};"
        "return {name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time,cpu:p.monit&&p.monit.cpu,rss:p.monit&&p.monit.memory,"
        "env:Object.fromEntries(Object.entries(v).filter(([k])=>['BOT_ENABLED','BOT_COUNT_PER_MAP','BOT_MAX_TOTAL','BOT_WORKER_LAZY_MAP_ACTIVATION','BOT_WORKER_LAZY_BOTS_PER_MAP','BOT_WORKER_LAZY_MAX_ACTIVE'].includes(k)))};})));})"
    )
    return json.loads(run(ssh, "pm2 jlist | node -e " + q(expr)))


def row(rows, name):
    return next((item for item in rows if item.get("name") == name), None)


def probe(ssh, port, path, timeout=8):
    raw = run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}} %{{time_total}}' --connect-timeout 2 --max-time {timeout} http://127.0.0.1:{port}/{path} || true").strip()
    code, _, elapsed = raw.partition(" ")
    return {"code": code, "seconds": elapsed}


def wait_ready(ssh, attempts=45):
    samples = []
    for _ in range(attempts):
        sample = probe(ssh, HTTP, "ready")
        samples.append(sample)
        if sample.get("code") == "200":
            return True, samples
        time.sleep(1)
    return False, samples


def health(ssh):
    data = json.loads(run(ssh, f"curl -fsS --connect-timeout 2 --max-time 15 http://127.0.0.1:{WS}/health"))
    runtime = data.get("runtime") or {}
    bots = runtime.get("bots") or {}
    real = bots.get("real") or {}
    return {"status": data.get("status"), "clients": runtime.get("clients"),
            "botCount": bots.get("botCount"), "realCount": real.get("count")}


def local_ws_probe(ssh):
    command = (
        "curl -sS -o /dev/null -w '%{http_code} %{time_total}' --connect-timeout 2 --max-time 8 "
        "-H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' "
        "-H 'Sec-WebSocket-Key: SGVsbG9XU0tleTEyMzQ1Njc=' http://127.0.0.1:9205/ 2>/dev/null || true"
    )
    raw = run(ssh, command).strip()
    code, _, elapsed = raw.partition(" ")
    return {"code": code, "seconds": elapsed}


def issues(ssh):
    text = run(ssh, "pm2 logs lhs-s1006 --lines 90 --nostream 2>&1 | tail -n 95 | grep -Ei 'queue backlog|queue wait|MongoDB operation timeout|handler stuck|Opening handshake has timed out' | tail -n 25 || true")
    return [line.encode("ascii", "ignore").decode("ascii") for line in text.splitlines() if line.strip()]


def main():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    evidence_dir = ROOT / "_ai_workbench/temp" / f"s6_disable_virtual_bots_{stamp}"
    evidence_dir.mkdir(parents=True, exist_ok=False)
    backup = f"/linhhoasu/_ai_workbench/backups/s6_disable_virtual_bots_{stamp}"
    ssh = connect()
    result = {"release": "s6_disable_virtual_bots_20260927", "backup": backup,
              "productionWrites": 0, "playerWrites": 0, "mongoWrites": 0, "redisWrites": 0}
    try:
        before = pm2_snapshot(ssh)
        result["beforePm2"] = before
        game = row(before, S6)
        worker = row(before, S6_WORKER)
        if not game or game.get("status") != "online":
            raise RuntimeError(f"S6_GAME_NOT_ONLINE:{game}")
        if not worker or worker.get("status") != "online":
            raise RuntimeError(f"S6_WORKER_NOT_ONLINE:{worker}")
        env = game.get("env") or {}
        if any(str(env.get(key)) != value for key, value in BASELINE.items()):
            raise RuntimeError(f"S6_VIRTUAL_DISABLE_CAS_BASELINE_FAILED:{env}")
        result["beforeReady"] = probe(ssh, HTTP, "ready")
        result["beforeHealth"] = health(ssh)
        result["beforeLocalWs"] = local_ws_probe(ssh)
        manifest = {"createdAt": datetime.now(timezone.utc).isoformat(),
                    "scope": [S6], "before": game, "workerBefore": worker,
                    "baseline": BASELINE, "candidate": TARGET}
        run(ssh, f"install -d -m 700 {q(backup)}")
        with ssh.open_sftp() as sftp:
            with sftp.open(f"{backup}/manifest.json", "wb") as handle:
                handle.write((json.dumps(manifest, indent=2) + "\n").encode())
            sftp.chmod(f"{backup}/manifest.json", 0o600)
        latest = pm2_snapshot(ssh)
        latest_game = row(latest, S6)
        latest_env = (latest_game or {}).get("env") or {}
        if not latest_game or latest_game.get("pid") != game.get("pid") \
                or any(str(latest_env.get(key)) != value for key, value in BASELINE.items()):
            raise RuntimeError(f"S6_PM2_CAS_DRIFT:{latest_game}")
        run(ssh, "env BOT_ENABLED=0 BOT_COUNT_PER_MAP=3 BOT_MAX_TOTAL=324 pm2 restart lhs-s1006 --update-env >/dev/null")
        result["s6Restarted"] = True
        ok, samples = wait_ready(ssh)
        result["readySamples"] = samples
        if not ok:
            raise RuntimeError("S6_READY_NOT_RECOVERED")
        result["afterHealth"] = health(ssh)
        result["afterLocalWs"] = local_ws_probe(ssh)
        if result["afterHealth"].get("status") != "ok" \
                or result["afterHealth"].get("botCount") != 0 \
                or int(result["afterHealth"].get("realCount") or 0) > 30 \
                or result["afterLocalWs"].get("code") == "000":
            raise RuntimeError(f"S6_VIRTUAL_OFF_CONTRACT_FAILED:{result['afterHealth']}:{result['afterLocalWs']}")
        run(ssh, "pm2 save >/dev/null")
        result["pm2Saved"] = True
        time.sleep(30)
        dwell_ok, dwell_samples = wait_ready(ssh, attempts=10)
        result["dwellReadySamples"] = dwell_samples
        if not dwell_ok:
            raise RuntimeError("S6_DWELL_READY_UNSTABLE")
        result["dwellHealth"] = health(ssh)
        result["dwellLocalWs"] = local_ws_probe(ssh)
        result["recentIssueTail"] = issues(ssh)
        if result["dwellHealth"].get("status") != "ok" \
                or result["dwellHealth"].get("botCount") != 0 \
                or int(result["dwellHealth"].get("realCount") or 0) > 30 \
                or result["dwellLocalWs"].get("code") == "000":
            raise RuntimeError(f"S6_DWELL_CONTRACT_FAILED:{result['dwellHealth']}:{result['dwellLocalWs']}")
        result["afterPm2"] = pm2_snapshot(ssh)
        after = row(result["afterPm2"], S6)
        after_env = (after or {}).get("env") or {}
        if any(str(after_env.get(key)) != value for key, value in TARGET.items()):
            raise RuntimeError(f"S6_ENV_READBACK_FAILED:{after_env}")
        if row(result["afterPm2"], S6_WORKER).get("pid") != worker.get("pid"):
            raise RuntimeError("S6_REAL_WORKER_CHANGED")
        for sid in range(1001, 1006):
            if row(result["afterPm2"], f"lhs-s{sid}").get("pid") != row(before, f"lhs-s{sid}").get("pid"):
                raise RuntimeError(f"OTHER_GAME_RESTARTED:S{sid - 1000}")
        result["result"] = "PASS"
        result["completedAt"] = datetime.now(timezone.utc).isoformat()
        (evidence_dir / "release.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"result": "PASS", "evidence": str(evidence_dir / "release.json"), "backup": backup}))
    except Exception as error:
        result["result"] = "ROLLBACK_REQUIRED"
        result["error"] = str(error)
        try:
            current = pm2_snapshot(ssh)
            current_game = row(current, S6)
            env = (current_game or {}).get("env") or {}
            if current_game and current_game.get("status") == "online" \
                    and all(str(env.get(key)) == value for key, value in TARGET.items()):
                run(ssh, "env BOT_ENABLED=1 BOT_COUNT_PER_MAP=3 BOT_MAX_TOTAL=324 pm2 restart lhs-s1006 --update-env >/dev/null")
                run(ssh, "pm2 save >/dev/null")
                result["rollback"] = "PASS"
            else:
                result["rollback"] = "REFUSED_CAS_DRIFT"
            result["rollbackPm2"] = pm2_snapshot(ssh)
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
