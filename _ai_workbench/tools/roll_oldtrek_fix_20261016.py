"""Roll the already-canaried OldTrek release through S2-S9 with stop-gates."""
from __future__ import annotations

import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
APP = "/linhhoasu/lhs/newServer"
BACKUP_ROOT = "/linhhoasu/_ai_workbench/backups"
REMOTE_FILES = {
    "app.js": f"{APP}/src/app.js",
    "ecosystem.config.js": f"{APP}/ecosystem.config.js",
    "OldTrekArenaService.js": f"{APP}/src/services/OldTrekArenaService.js",
    "OldTrekMaintenanceService.js": f"{APP}/src/services/OldTrekMaintenanceService.js",
}
EXPECTED = {
    REMOTE_FILES["app.js"]: "8704740aa205d0bc66df70c692dfd0e1e57fdb95f72310356c316153339a9efe",
    REMOTE_FILES["ecosystem.config.js"]: "63cdb0da06f255ecbef86fda548cafded953ee288af1de583628d33c88a76f7a",
    REMOTE_FILES["OldTrekArenaService.js"]: "417b07005685bf148a7c9e1a4302bd5456f3f6db93e4abf4e84c8f77c804c686",
    REMOTE_FILES["OldTrekMaintenanceService.js"]: "d4583122ee85a2a1a2fd0d53d8b97ee7dd295b852b262cee2d3bc208e5ccc8db",
}
NODES = [(f"lhs-s{sid}", port) for sid, port in zip(range(1002, 1010), [8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090])]
ALL_NAMES = ["lhs-s1001", *[name for name, _ in NODES]]


def main() -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"{BACKUP_ROOT}/oldtrek_roll_20261016_{stamp}"
    receipt_path = ROOT / "_ai_workbench/temp/oldtrek_fix_20261016/rolling_deployment.json"
    receipt = {
        "at": datetime.now(timezone.utc).isoformat(),
        "stage": "S2-S9_rolling",
        "directPlayerWrites": 0,
        "backup": backup,
        "restartOrder": [],
        "readiness": {},
    }
    with connect() as client:
        inventory_js = r'''const ps=JSON.parse(require('child_process').execFileSync('pm2',['jlist'],{encoding:'utf8'}));const names=new Set(%s);const out={};for(const p of ps)if(names.has(p.name)){const e=p.pm2_env||{},v={...(e.env||{}),...e};out[p.name]={pid:p.pid,status:e.status,port:Number(v.HTTP_PORT||0),flags:Object.fromEntries(['OLD_TREK_EVENT_ENGINE_ENABLED','OLD_TREK_SETTLEMENT_ENABLED','OLD_TREK_RECONCILE_ENABLED','OLD_TREK_RECONCILE_INTERVAL_MS','OLD_TREK_RECONCILE_BATCH_SIZE','OLD_TREK_SCOPED_CAS'].map(k=>[k,v[k]??null]))};}console.log(JSON.stringify(out));''' % json.dumps(ALL_NAMES)
        before = json.loads(run(client, "node -e " + shlex.quote(inventory_js)))
        receipt["before"] = before
        missing = [name for name in ALL_NAMES if name not in before]
        if missing:
            raise RuntimeError("PM2 process missing: " + ",".join(missing))
        for name in ALL_NAMES:
            if before[name]["status"] != "online":
                raise RuntimeError(f"process not online: {name}")
        for name in ALL_NAMES:
            port = 8080 if name == "lhs-s1001" else dict(NODES)[name]
            code = run(client, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{port}/ready || true").strip()
            if code != "200":
                raise RuntimeError(f"preflight readiness failed: {name}:{code}")
        for path in REMOTE_FILES.values():
            live = run(client, f"sha256sum {shlex.quote(path)}").strip().split()[0]
            receipt.setdefault("hashesBefore", {})[path] = live
            if live != EXPECTED[path]:
                raise RuntimeError(f"CAS mismatch {path}: {live}")
        run(client, "set -eu; " + " && ".join([
            f"mkdir -p {shlex.quote(backup)}",
            f"cp -p {shlex.quote(REMOTE_FILES['app.js'])} {shlex.quote(backup + '/app.js')}",
            f"cp -p {shlex.quote(REMOTE_FILES['ecosystem.config.js'])} {shlex.quote(backup + '/ecosystem.config.js')}",
            f"cp -p {shlex.quote(REMOTE_FILES['OldTrekArenaService.js'])} {shlex.quote(backup + '/OldTrekArenaService.js')}",
            f"cp -p {shlex.quote(REMOTE_FILES['OldTrekMaintenanceService.js'])} {shlex.quote(backup + '/OldTrekMaintenanceService.js')}",
            f"pm2 jlist > {shlex.quote(backup + '/pm2_before.json')}",
            f"cp -p /root/.pm2/dump.pm2 {shlex.quote(backup + '/dump.pm2')}",
        ]))
        try:
            for name, port in NODES:
                old_pid = before[name]["pid"]
                if name == "lhs-s1005":
                    cmd = "OLD_TREK_RECONCILE_ENABLED=1 OLD_TREK_RECONCILE_INTERVAL_MS=30000 OLD_TREK_RECONCILE_BATCH_SIZE=100 OLD_TREK_SCOPED_CAS=1 pm2 restart lhs-s1005 --update-env"
                else:
                    cmd = f"cd {APP} && pm2 restart ecosystem.config.js --only {shlex.quote(name)} --update-env"
                run(client, cmd)
                receipt["restartOrder"].append(name)
                code = ""
                stable = False
                for _ in range(60):
                    code = run(client, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{port}/ready || true").strip()
                    state = json.loads(run(client, "node -e " + shlex.quote(inventory_js)))
                    row = state.get(name, {})
                    if code == "200" and row.get("status") == "online" and row.get("pid") and row.get("pid") != old_pid:
                        time.sleep(1)
                        code2 = run(client, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{port}/ready || true").strip()
                        if code2 == "200":
                            stable = True
                            receipt["readiness"][name] = {"http": code2, "process": row}
                            break
                    time.sleep(1)
                if not stable:
                    raise RuntimeError(f"readiness failed: {name}:{code}")
            run(client, "pm2 save")
            after = json.loads(run(client, "node -e " + shlex.quote(inventory_js)))
            receipt["after"] = after
            receipt["hashesAfter"] = {path: run(client, f"sha256sum {shlex.quote(path)}").strip().split()[0] for path in REMOTE_FILES.values()}
            receipt["status"] = "deployed"
        except Exception as exc:
            receipt["status"] = "failed"
            receipt["error"] = str(exc)
            receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            # Restore source only if the live file still matches the expected candidate;
            # never overwrite a concurrent change. Restart already-touched nodes after restore.
            rollback = "set -eu; " + " && ".join([
                "test \"$(sha256sum " + shlex.quote(REMOTE_FILES["app.js"]) + " | cut -d' ' -f1)\" = " + shlex.quote(EXPECTED[REMOTE_FILES["app.js"]]),
                "test \"$(sha256sum " + shlex.quote(REMOTE_FILES["ecosystem.config.js"]) + " | cut -d' ' -f1)\" = " + shlex.quote(EXPECTED[REMOTE_FILES["ecosystem.config.js"]]),
                "test \"$(sha256sum " + shlex.quote(REMOTE_FILES["OldTrekArenaService.js"]) + " | cut -d' ' -f1)\" = " + shlex.quote(EXPECTED[REMOTE_FILES["OldTrekArenaService.js"]]),
                "test \"$(sha256sum " + shlex.quote(REMOTE_FILES["OldTrekMaintenanceService.js"]) + " | cut -d' ' -f1)\" = " + shlex.quote(EXPECTED[REMOTE_FILES["OldTrekMaintenanceService.js"]]),
                f"cp -p {shlex.quote(backup + '/app.js')} {shlex.quote(REMOTE_FILES['app.js'])}",
                f"cp -p {shlex.quote(backup + '/ecosystem.config.js')} {shlex.quote(REMOTE_FILES['ecosystem.config.js'])}",
                f"cp -p {shlex.quote(backup + '/OldTrekArenaService.js')} {shlex.quote(REMOTE_FILES['OldTrekArenaService.js'])}",
                f"cp -p {shlex.quote(backup + '/OldTrekMaintenanceService.js')} {shlex.quote(REMOTE_FILES['OldTrekMaintenanceService.js'])}",
            ])
            run(client, rollback)
            for name in receipt["restartOrder"]:
                try:
                    run(client, f"pm2 restart {shlex.quote(name)} --update-env")
                except Exception:
                    pass
            raise
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
