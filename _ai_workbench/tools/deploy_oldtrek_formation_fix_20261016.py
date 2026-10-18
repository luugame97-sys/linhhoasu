"""Deploy the OldTrek unplayable-battle recovery fix with a fleet stop-gate."""
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
FILES = {
    "src/services/OldTrekEventService.js": {
        "local": ROOT / "_ai_workbench/temp/oldtrek_fix_20261016/candidate2/src/services/OldTrekEventService.js",
        "before": "e5be5237b0436f84241fe60cb7141b3aa4ac3f793d91081dc88b50c46f907ca1",
    },
    "src/handlers/old-trek.js": {
        "local": ROOT / "_ai_workbench/temp/oldtrek_fix_20261016/candidate2/src/handlers/old-trek.js",
        "before": "6900077f656921a777ab4631189e99b8203c4a666963c0d953b4b13dc64f9488",
    },
}
NODES = [(f"lhs-s{sid}", port) for sid, port in zip(range(1001, 1010), [8080, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090])]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory(client):
    names = [name for name, _ in NODES]
    js = r'''const wanted=new Set(%s),ps=JSON.parse(require('child_process').execFileSync('pm2',['jlist'],{encoding:'utf8'}));const o={};for(const p of ps)if(wanted.has(p.name)){const e=p.pm2_env||{},v={...(e.env||{}),...e};o[p.name]={pid:p.pid,status:e.status,port:Number(v.HTTP_PORT||0),flags:Object.fromEntries(['OLD_TREK_EVENT_ENGINE_ENABLED','OLD_TREK_SETTLEMENT_ENABLED','OLD_TREK_RECONCILE_ENABLED','OLD_TREK_RECONCILE_INTERVAL_MS','OLD_TREK_RECONCILE_BATCH_SIZE','OLD_TREK_SCOPED_CAS'].map(k=>[k,v[k]??null]))};}console.log(JSON.stringify(o));''' % json.dumps(names)
    return json.loads(run(client, "node -e " + shlex.quote(js)))


def ready(client, port: int) -> str:
    return run(client, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{port}/ready || true").strip()


def main() -> None:
    for rel, spec in FILES.items():
        if not spec["local"].exists():
            raise SystemExit(f"missing candidate: {spec['local']}")
        spec["candidate"] = sha(spec["local"])
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/oldtrek_formation_fix_20261016_{stamp}"
    receipt_path = ROOT / "_ai_workbench/temp/oldtrek_fix_20261016/formation_fix_deployment.json"
    receipt = {
        "at": datetime.now(timezone.utc).isoformat(),
        "stage": "oldtrek_unplayable_formation_fix_S1-S9",
        "directPlayerWrites": 0,
        "backup": backup,
        "files": {rel: {"candidateHash": spec["candidate"], "expectedBefore": spec["before"]} for rel, spec in FILES.items()},
        "restartOrder": [],
        "readiness": {},
    }
    touched = False
    with connect() as client:
        live = {}
        for rel, spec in FILES.items():
            remote = f"{APP}/{rel}"
            live[rel] = run(client, f"sha256sum {shlex.quote(remote)}").strip().split()[0].lower()
            if live[rel] != spec["before"]:
                raise RuntimeError(f"CAS mismatch for {rel}: {live[rel]}")
        receipt["hashBefore"] = live
        before = inventory(client)
        receipt["before"] = before
        if set(before) != {name for name, _ in NODES} or any(row["status"] != "online" for row in before.values()):
            raise RuntimeError("PM2 preflight failed")
        for name, port in NODES:
            if ready(client, port) != "200":
                raise RuntimeError(f"readiness preflight failed: {name}")
        backup_files = [f"cp -p {shlex.quote(APP + '/' + rel)} {shlex.quote(backup + '/' + Path(rel).name)}" for rel in FILES]
        run(client, "set -eu; " + " && ".join([
            f"mkdir -p {shlex.quote(backup)}",
            *backup_files,
            f"pm2 jlist > {shlex.quote(backup + '/pm2_before.json')}",
            f"cp -p /root/.pm2/dump.pm2 {shlex.quote(backup + '/dump.pm2')}",
        ]))
        temps = {}
        sftp = client.open_sftp()
        try:
            for rel, spec in FILES.items():
                remote = f"{APP}/{rel}"
                temp = f"{remote}.codex-formation-{stamp}.tmp.js"
                sftp.put(str(spec["local"]), temp)
                temps[rel] = temp
        finally:
            sftp.close()
        try:
            checks = "; ".join(f"node --check {shlex.quote(temp)} && mv {shlex.quote(temp)} {shlex.quote(APP + '/' + rel)} && chmod 644 {shlex.quote(APP + '/' + rel)}" for rel, temp in temps.items())
            run(client, "set -eu; " + checks)
            touched = True
            for name, port in NODES:
                old_pid = before[name]["pid"]
                if name == "lhs-s1005":
                    cmd = "OLD_TREK_EVENT_ENGINE_ENABLED=1 OLD_TREK_SETTLEMENT_ENABLED=1 OLD_TREK_RECONCILE_ENABLED=1 OLD_TREK_RECONCILE_INTERVAL_MS=30000 OLD_TREK_RECONCILE_BATCH_SIZE=100 OLD_TREK_SCOPED_CAS=1 pm2 restart lhs-s1005 --update-env"
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
            receipt["hashAfter"] = {rel: run(client, f"sha256sum {shlex.quote(APP + '/' + rel)}").strip().split()[0].lower() for rel in FILES}
            receipt["after"] = inventory(client)
            if any(receipt["hashAfter"][rel] != spec["candidate"] for rel, spec in FILES.items()):
                raise RuntimeError("hash read-back mismatch")
            receipt["status"] = "deployed"
        except Exception as exc:
            receipt["status"] = "failed"
            receipt["error"] = str(exc)
            receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            if touched:
                try:
                    for rel in FILES:
                        remote = APP + "/" + rel
                        backup_file = backup + "/" + Path(rel).name
                        run(client, f"set -eu; test \"$(sha256sum {shlex.quote(remote)} | cut -d' ' -f1)\" = {shlex.quote(FILES[rel]['candidate'])}; cp -p {shlex.quote(backup_file)} {shlex.quote(remote)}")
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
