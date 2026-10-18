"""Deploy the legacy expired-event recovery fix with backup/CAS and 9-node readiness gates."""
from __future__ import annotations

import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
CANDIDATE = ROOT / "_ai_workbench/temp/oldtrek_fix_20261016/remote/OldTrekEventService.js"
APP = "/linhhoasu/lhs/newServer"
REMOTE = f"{APP}/src/services/OldTrekEventService.js"
EXPECTED = "cc64402efc18842dfbfa3eab894116d645b5a854eecf65473cd034602aa8baaa".lower()
NODES = [(f"lhs-s{sid}", port) for sid, port in zip(range(1001, 1010), [8080, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090])]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory(client):
    js = r'''const wanted=new Set(%s),ps=JSON.parse(require('child_process').execFileSync('pm2',['jlist'],{encoding:'utf8'}));const o={};for(const p of ps)if(wanted.has(p.name)){const e=p.pm2_env||{},v={...(e.env||{}),...e};o[p.name]={pid:p.pid,status:e.status,port:Number(v.HTTP_PORT||0),flags:Object.fromEntries(['OLD_TREK_RECONCILE_ENABLED','OLD_TREK_RECONCILE_INTERVAL_MS','OLD_TREK_RECONCILE_BATCH_SIZE','OLD_TREK_SCOPED_CAS'].map(k=>[k,v[k]??null]))};}console.log(JSON.stringify(o));''' % json.dumps([n for n, _ in NODES])
    return json.loads(run(client, "node -e " + shlex.quote(js)))


def main() -> None:
    if not CANDIDATE.exists():
        raise SystemExit(f"missing candidate: {CANDIDATE}")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/oldtrek_expired_event_20261016_{stamp}"
    receipt_path = ROOT / "_ai_workbench/temp/oldtrek_fix_20261016/expired_event_deployment.json"
    receipt = {"at": datetime.now(timezone.utc).isoformat(), "stage": "expired_event_9node",
               "directPlayerWrites": 0, "backup": backup, "restartOrder": [], "readiness": {},
               "candidateHash": sha(CANDIDATE)}
    with connect() as client:
        live = run(client, f"sha256sum {shlex.quote(REMOTE)}").strip().split()[0].lower()
        receipt["liveHashBefore"] = live
        if live != EXPECTED:
            raise RuntimeError(f"CAS mismatch: {live}")
        before = inventory(client)
        receipt["before"] = before
        if set(before) != {n for n, _ in NODES} or any(x["status"] != "online" for x in before.values()):
            raise RuntimeError("PM2 preflight failed")
        for name, port in NODES:
            code = run(client, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{port}/ready || true").strip()
            if code != "200":
                raise RuntimeError(f"preflight readiness failed: {name}:{code}")
        run(client, "set -eu; " + " && ".join([
            f"mkdir -p {shlex.quote(backup)}",
            f"cp -p {shlex.quote(REMOTE)} {shlex.quote(backup + '/OldTrekEventService.js')}",
            f"pm2 jlist > {shlex.quote(backup + '/pm2_before.json')}",
            f"cp -p /root/.pm2/dump.pm2 {shlex.quote(backup + '/dump.pm2')}",
        ]))
        sftp = client.open_sftp()
        temp = f"{REMOTE}.codex-expired-{stamp}.js"
        try:
            sftp.put(str(CANDIDATE), temp)
            run(client, f"set -eu; node --check {shlex.quote(temp)}; mv {shlex.quote(temp)} {shlex.quote(REMOTE)}; chmod 644 {shlex.quote(REMOTE)}")
        finally:
            sftp.close()
        try:
            run(client, f"node --check {shlex.quote(REMOTE)}")
            for name, port in NODES:
                old_pid = before[name]["pid"]
                if name == "lhs-s1005":
                    command = "OLD_TREK_RECONCILE_ENABLED=1 OLD_TREK_RECONCILE_INTERVAL_MS=30000 OLD_TREK_RECONCILE_BATCH_SIZE=100 OLD_TREK_SCOPED_CAS=1 pm2 restart lhs-s1005 --update-env"
                else:
                    command = f"cd {APP} && pm2 restart ecosystem.config.js --only {shlex.quote(name)} --update-env"
                run(client, command)
                receipt["restartOrder"].append(name)
                stable = False
                last = ""
                for _ in range(60):
                    last = run(client, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{port}/ready || true").strip()
                    state = inventory(client).get(name, {})
                    if last == "200" and state.get("status") == "online" and state.get("pid") and state.get("pid") != old_pid:
                        time.sleep(1)
                        if run(client, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{port}/ready || true").strip() == "200":
                            receipt["readiness"][name] = {"http": "200", "pid": state["pid"], "flags": state["flags"]}
                            stable = True
                            break
                    time.sleep(1)
                if not stable:
                    raise RuntimeError(f"readiness failed: {name}:{last}")
            run(client, "pm2 save")
            receipt["liveHashAfter"] = run(client, f"sha256sum {shlex.quote(REMOTE)}").strip().split()[0]
            receipt["after"] = inventory(client)
            receipt["status"] = "deployed"
        except Exception as exc:
            receipt["status"] = "failed"
            receipt["error"] = str(exc)
            receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            rollback = "set -eu; " + " && ".join([
                f"test \"$(sha256sum {shlex.quote(REMOTE)} | cut -d' ' -f1)\" = {shlex.quote(sha(CANDIDATE))}",
                f"cp -p {shlex.quote(backup + '/OldTrekEventService.js')} {shlex.quote(REMOTE)}",
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
