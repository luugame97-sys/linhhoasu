"""Deploy the OldTrek scoped-CAS false-conflict fix with a fleet stop-gate."""
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
LOCAL = ROOT / "_ai_workbench/temp/oldtrek_fix_20261016/candidate2/src/services/OldTrekSnapshotService.js"
REMOTE = f"{APP}/src/services/OldTrekSnapshotService.js"
EXPECTED_BEFORE = "d6b6281240105278116fa5c9ba559ad9402dc5f303b9507c63c734cdd7dafb8c"
NODES = [(f"lhs-s{sid}", port) for sid, port in zip(range(1001, 1010), [8080, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090])]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory(client):
    names = [name for name, _ in NODES]
    js = r'''const wanted=new Set(%s),ps=JSON.parse(require('child_process').execFileSync('pm2',['jlist'],{encoding:'utf8'}));const o={};for(const p of ps)if(wanted.has(p.name)){const e=p.pm2_env||{},v={...(e.env||{}),...e};o[p.name]={pid:p.pid,status:e.status,port:Number(v.HTTP_PORT||0),flags:Object.fromEntries(['OLD_TREK_RECONCILE_ENABLED','OLD_TREK_RECONCILE_INTERVAL_MS','OLD_TREK_RECONCILE_BATCH_SIZE','OLD_TREK_SCOPED_CAS'].map(k=>[k,v[k]??null]))};}console.log(JSON.stringify(o));''' % json.dumps(names)
    return json.loads(run(client, "node -e " + shlex.quote(js)))


def ready(client, port: int) -> str:
    return run(client, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{port}/ready || true").strip()


def main() -> None:
    if not LOCAL.exists():
        raise SystemExit(f"missing candidate: {LOCAL}")
    candidate = sha(LOCAL)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/oldtrek_cas_guard_20261016_{stamp}"
    receipt_path = ROOT / "_ai_workbench/temp/oldtrek_fix_20261016/cas_guard_deployment.json"
    receipt = {"at": datetime.now(timezone.utc).isoformat(), "stage": "oldtrek_snapshot_cas_guard_S1-S9", "directPlayerWrites": 0, "backup": backup, "candidateHash": candidate, "restartOrder": [], "readiness": {}}
    touched = False
    with connect() as client:
        live = run(client, f"sha256sum {shlex.quote(REMOTE)}").strip().split()[0].lower()
        receipt["hashBefore"] = live
        if live != EXPECTED_BEFORE:
            raise RuntimeError(f"CAS mismatch: {live}")
        before = inventory(client)
        receipt["before"] = before
        if set(before) != {name for name, _ in NODES} or any(row["status"] != "online" for row in before.values()):
            raise RuntimeError("PM2 preflight failed")
        for name, port in NODES:
            if ready(client, port) != "200":
                raise RuntimeError(f"readiness preflight failed: {name}")
        run(client, "set -eu; " + " && ".join([
            f"mkdir -p {shlex.quote(backup)}",
            f"cp -p {shlex.quote(REMOTE)} {shlex.quote(backup + '/OldTrekSnapshotService.js')}",
            f"pm2 jlist > {shlex.quote(backup + '/pm2_before.json')}",
            f"cp -p /root/.pm2/dump.pm2 {shlex.quote(backup + '/dump.pm2')}",
        ]))
        temp = f"{REMOTE}.codex-cas-{stamp}.tmp.js"
        sftp = client.open_sftp()
        try:
            sftp.put(str(LOCAL), temp)
        finally:
            sftp.close()
        try:
            run(client, f"set -eu; node --check {shlex.quote(temp)}; mv {shlex.quote(temp)} {shlex.quote(REMOTE)}; chmod 644 {shlex.quote(REMOTE)}")
            touched = True
            for name, port in NODES:
                old_pid = before[name]["pid"]
                if name == "lhs-s1005":
                    cmd = "OLD_TREK_RECONCILE_ENABLED=1 OLD_TREK_RECONCILE_INTERVAL_MS=30000 OLD_TREK_RECONCILE_BATCH_SIZE=100 OLD_TREK_SCOPED_CAS=1 pm2 restart lhs-s1005 --update-env"
                else:
                    cmd = f"cd {APP} && pm2 restart ecosystem.config.js --only {shlex.quote(name)} --update-env"
                run(client, cmd)
                receipt["restartOrder"].append(name)
                ok = False
                for _ in range(60):
                    state = inventory(client).get(name, {})
                    if ready(client, port) == "200" and state.get("status") == "online" and state.get("pid") and state.get("pid") != old_pid:
                        time.sleep(1)
                        if ready(client, port) == "200":
                            receipt["readiness"][name] = {"http": "200", "pid": state["pid"], "flags": state["flags"]}
                            ok = True
                            break
                    time.sleep(1)
                if not ok:
                    raise RuntimeError(f"readiness failed: {name}")
            run(client, "pm2 save")
            receipt["hashAfter"] = run(client, f"sha256sum {shlex.quote(REMOTE)}").strip().split()[0].lower()
            receipt["after"] = inventory(client)
            if receipt["hashAfter"] != candidate:
                raise RuntimeError("hash read-back mismatch")
            receipt["status"] = "deployed"
        except Exception as exc:
            receipt["status"] = "failed"
            receipt["error"] = str(exc)
            receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            if touched:
                try:
                    run(client, f"set -eu; test \"$(sha256sum {shlex.quote(REMOTE)} | cut -d' ' -f1)\" = {shlex.quote(candidate)}; cp -p {shlex.quote(backup + '/OldTrekSnapshotService.js')} {shlex.quote(REMOTE)}")
                except Exception as rollback_error:
                    receipt["rollbackError"] = str(rollback_error)
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
