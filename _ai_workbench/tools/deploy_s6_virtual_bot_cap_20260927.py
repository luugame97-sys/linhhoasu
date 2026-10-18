"""Lower only S6's display-only virtual population after a live lag audit.

The change is an effective PM2 environment update (10/map, 580 -> 3/map,
324) and a restart of lhs-s1006 only.  Real lazy workers, player state,
Mongo, Redis, and reward data are outside the mutation scope.
"""

from __future__ import annotations

import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
GAME_NAMES = [f"lhs-s{sid}" for sid in range(1001, 1007)]
S6 = "lhs-s1006"
S6_WORKER = "lhs-real-bots-s6"
S6_HTTP = 8087
S6_WS = 9205
TARGET = {"BOT_ENABLED": "1", "BOT_COUNT_PER_MAP": "3", "BOT_MAX_TOTAL": "324"}
BASELINE = {"BOT_ENABLED": "1", "BOT_COUNT_PER_MAP": "10", "BOT_MAX_TOTAL": "580"}


def q(value: str) -> str:
    return shlex.quote(str(value))


def pm2_snapshot(ssh):
    names = GAME_NAMES + [S6_WORKER]
    expr = (
        "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{"
        "const n=new Set(" + json.dumps(names) + ");"
        "console.log(JSON.stringify(JSON.parse(s).filter(p=>n.has(p.name)).map(p=>{const e=p.pm2_env||{},v={...(e.env||{}),...e};"
        "return {name:p.name,pid:p.pid,status:e.status,restarts:e.restart_time,"
        "cpu:p.monit&&p.monit.cpu,rss:p.monit&&p.monit.memory,"
        "env:Object.fromEntries(Object.entries(v).filter(([k])=>['BOT_ENABLED','BOT_COUNT_PER_MAP','BOT_MAX_TOTAL','BOT_WORKER_LAZY_MAP_ACTIVATION','BOT_WORKER_LAZY_BOTS_PER_MAP','BOT_WORKER_LAZY_MAX_ACTIVE'].includes(k)))};})));})"
    )
    return json.loads(run(ssh, "pm2 jlist | node -e " + q(expr)))


def row(rows, name):
    return next((item for item in rows if item.get("name") == name), None)


def ready_probe(ssh):
    raw = run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}} %{{time_total}}' --connect-timeout 2 --max-time 8 http://127.0.0.1:{S6_HTTP}/ready || true").strip()
    code, _, elapsed = raw.partition(" ")
    return {"code": code, "seconds": elapsed}


def wait_ready(ssh, attempts=30):
    samples = []
    for _ in range(attempts):
        sample = ready_probe(ssh)
        samples.append(sample)
        if sample.get("code") == "200":
            return True, samples
        time.sleep(1)
    return False, samples


def health(ssh):
    data = json.loads(run(ssh, f"curl -fsS --connect-timeout 2 --max-time 15 http://127.0.0.1:{S6_WS}/health"))
    runtime = data.get("runtime") or {}
    bots = runtime.get("bots") or {}
    real = bots.get("real") or {}
    return {
        "status": data.get("status"),
        "clients": runtime.get("clients"),
        "botCount": bots.get("botCount"),
        "realCount": real.get("count"),
        "humanMaps": (data.get("humanMaps") or {}).get("totalHumans"),
    }


def issue_tail(ssh):
    text = run(ssh, "pm2 logs lhs-s1006 --lines 120 --nostream 2>&1 | tail -n 120 | grep -Ei 'queue backlog|queue wait|MongoDB operation timeout|handler stuck|Opening handshake has timed out' | tail -n 30 || true")
    return [line.encode("ascii", "ignore").decode("ascii") for line in text.splitlines() if line.strip()]


def main():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    evidence_dir = ROOT / "_ai_workbench/temp" / f"s6_virtual_bot_cap_{stamp}"
    evidence_dir.mkdir(parents=True, exist_ok=False)
    backup = f"/linhhoasu/_ai_workbench/backups/s6_virtual_bot_cap_{stamp}"
    ssh = connect()
    result = {"release": "s6_virtual_bot_cap_20260927", "backup": backup,
              "productionWrites": 0, "playerWrites": 0, "mongoWrites": 0, "redisWrites": 0}
    try:
        before = pm2_snapshot(ssh)
        result["beforePm2"] = before
        s6_before = row(before, S6)
        worker_before = row(before, S6_WORKER)
        if not s6_before or s6_before.get("status") != "online":
            raise RuntimeError(f"S6_GAME_NOT_ONLINE:{s6_before}")
        if not worker_before or worker_before.get("status") != "online":
            raise RuntimeError(f"S6_WORKER_NOT_ONLINE:{worker_before}")
        current_env = s6_before.get("env") or {}
        if any(str(current_env.get(key)) != value for key, value in BASELINE.items()):
            raise RuntimeError(f"S6_VIRTUAL_CAP_CAS_BASELINE_FAILED:{current_env}")
        result["beforeReady"] = ready_probe(ssh)
        result["beforeHealth"] = health(ssh)
        # Store only allow-listed PM2 state remotely; never copy the PM2 dump,
        # which contains unrelated credentials.
        manifest = {
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "scope": [S6], "before": s6_before,
            "workerBefore": worker_before,
            "baseline": BASELINE, "candidate": TARGET,
        }
        run(ssh, f"install -d -m 700 {q(backup)}")
        with ssh.open_sftp() as sftp:
            with sftp.open(f"{backup}/manifest.json", "wb") as handle:
                handle.write((json.dumps(manifest, indent=2) + "\n").encode())
            sftp.chmod(f"{backup}/manifest.json", 0o600)
        # Exact pre-mutation CAS on PM2's effective S6 env and PID.
        latest = pm2_snapshot(ssh)
        latest_s6 = row(latest, S6)
        latest_env = (latest_s6 or {}).get("env") or {}
        if not latest_s6 or latest_s6.get("pid") != s6_before.get("pid") \
                or any(str(latest_env.get(key)) != value for key, value in BASELINE.items()):
            raise RuntimeError(f"S6_PM2_CAS_DRIFT:{latest_s6}")
        run(ssh, "env BOT_ENABLED=1 BOT_COUNT_PER_MAP=3 BOT_MAX_TOTAL=324 pm2 restart lhs-s1006 --update-env >/dev/null")
        result["s6Restarted"] = True
        ok, samples = wait_ready(ssh, attempts=45)
        result["readySamples"] = samples
        if not ok:
            raise RuntimeError("S6_READY_NOT_RECOVERED")
        result["afterHealth"] = health(ssh)
        if result["afterHealth"].get("status") != "ok" \
                or result["afterHealth"].get("botCount") != 324 \
                or result["afterHealth"].get("realCount") is None \
                or int(result["afterHealth"].get("realCount") or 0) > 30:
            raise RuntimeError(f"S6_HEALTH_CONTRACT_FAILED:{result['afterHealth']}")
        run(ssh, "pm2 save >/dev/null")
        result["pm2Saved"] = True
        # A short dwell catches the previous queue/timeout pattern rather than
        # treating one successful readiness response as enough.
        time.sleep(25)
        dwell_ok, dwell_samples = wait_ready(ssh, attempts=8)
        result["dwellReadySamples"] = dwell_samples
        if not dwell_ok:
            raise RuntimeError("S6_DWELL_READY_UNSTABLE")
        result["dwellHealth"] = health(ssh)
        if result["dwellHealth"].get("status") != "ok" \
                or result["dwellHealth"].get("botCount") != 324 \
                or int(result["dwellHealth"].get("realCount") or 0) > 30:
            raise RuntimeError(f"S6_DWELL_HEALTH_FAILED:{result['dwellHealth']}")
        result["afterPm2"] = pm2_snapshot(ssh)
        result["recentIssueTail"] = issue_tail(ssh)
        after_s6 = row(result["afterPm2"], S6)
        after_worker = row(result["afterPm2"], S6_WORKER)
        after_env = (after_s6 or {}).get("env") or {}
        if any(str(after_env.get(key)) != value for key, value in TARGET.items()):
            raise RuntimeError(f"S6_ENV_READBACK_FAILED:{after_env}")
        if not after_worker or after_worker.get("pid") != worker_before.get("pid"):
            raise RuntimeError(f"S6_WORKER_CHANGED:{worker_before}->{after_worker}")
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
            current_s6 = row(current, S6)
            env = (current_s6 or {}).get("env") or {}
            if current_s6 and current_s6.get("status") == "online" \
                    and all(str(env.get(key)) == value for key, value in TARGET.items()):
                run(ssh, "env BOT_ENABLED=1 BOT_COUNT_PER_MAP=10 BOT_MAX_TOTAL=580 pm2 restart lhs-s1006 --update-env >/dev/null")
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
