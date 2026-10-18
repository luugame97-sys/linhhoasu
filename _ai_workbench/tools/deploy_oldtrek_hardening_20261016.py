"""Deploy the OldTrek hardening candidate to S1-S9 with backup, CAS and stop-gates."""
from __future__ import annotations

import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "_ai_workbench/temp/oldtrek_fix_20261016/candidate2"
APP = "/linhhoasu/lhs/newServer"
REMOTE = {
    "handler": f"{APP}/src/handlers/old-trek.js",
    "event": f"{APP}/src/services/OldTrekEventService.js",
    "arena": f"{APP}/src/services/OldTrekArenaService.js",
    "maintenance": f"{APP}/src/services/OldTrekMaintenanceService.js",
    "snapshot": f"{APP}/src/services/OldTrekSnapshotService.js",
    "ecosystem": f"{APP}/ecosystem.config.js",
}
LOCAL = {
    "handler": BASE / "src/handlers/old-trek.js",
    "event": BASE / "src/services/OldTrekEventService.js",
    "arena": BASE / "src/services/OldTrekArenaService.js",
    "maintenance": BASE / "src/services/OldTrekMaintenanceService.js",
    "snapshot": BASE / "src/services/OldTrekSnapshotService.js",
    "ecosystem": BASE / "ecosystem.config.js",
}
# CAS baseline: these are the exact live hashes read immediately before this
# hardening candidate was prepared. A concurrent production edit aborts rollout.
EXPECTED_BEFORE = {
    REMOTE["handler"]: "a656bddd25a8046ef71df76860e13a95e94251cbccb99fbd76ff1b50c45578e1",
    REMOTE["event"]: "d3b93372deb4d276426b63c38d5f4a7804e388a432dc8bb605f534c841cb8d0b",
    REMOTE["arena"]: "417b07005685bf148a7c9e1a4302bd5456f3f6db93e4abf4e84c8f77c804c686",
    REMOTE["maintenance"]: "d4583122ee85a2a1a2fd0d53d8b97ee7dd295b852b262cee2d3bc208e5ccc8db",
    REMOTE["snapshot"]: "d6b6281240105278116fa5c9ba559ad9402dc5f303b9507c63c734cdd7dafb8c",
    REMOTE["ecosystem"]: "63cdb0da06f255ecbef86fda548cafded953ee288af1de583628d33c88a76f7a",
}
NODES = [(f"lhs-s{sid}", port) for sid, port in zip(range(1001, 1010), [8080, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090])]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory(client):
    names = [name for name, _ in NODES]
    js = r'''const wanted=new Set(%s),ps=JSON.parse(require('child_process').execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8*1024*1024}));const o={};for(const p of ps)if(wanted.has(p.name)){const e=p.pm2_env||{},v={...(e.env||{}),...e};o[p.name]={pid:p.pid,status:e.status,port:Number(v.HTTP_PORT||0),flags:Object.fromEntries(['OLD_TREK_EVENT_ENGINE_ENABLED','OLD_TREK_SETTLEMENT_ENABLED','OLD_TREK_RECONCILE_ENABLED','OLD_TREK_RECONCILE_INTERVAL_MS','OLD_TREK_RECONCILE_BATCH_SIZE','OLD_TREK_SCOPED_CAS'].map(k=>[k,v[k]??null]))};}console.log(JSON.stringify(o));''' % json.dumps(names)
    return json.loads(run(client, "node -e " + shlex.quote(js)))


def ready(client, port: int) -> str:
    return run(client, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{port}/ready || true").strip()


def main() -> None:
    missing = [str(path) for path in LOCAL.values() if not path.exists()]
    if missing:
        raise SystemExit("missing candidate files: " + ", ".join(missing))
    candidate_hashes = {REMOTE[key]: sha(path) for key, path in LOCAL.items()}
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/oldtrek_hardening_20261016_{stamp}"
    receipt_path = ROOT / "_ai_workbench/temp/oldtrek_fix_20261016/hardening_deployment.json"
    receipt = {
        "at": datetime.now(timezone.utc).isoformat(),
        "stage": "oldtrek_hardening_S1-S9",
        "directPlayerWrites": 0,
        "backup": backup,
        "candidateHashes": candidate_hashes,
        "hashesBefore": {},
        "restartOrder": [],
        "readiness": {},
    }
    touched = False
    with connect() as client:
        before = inventory(client)
        receipt["before"] = before
        if set(before) != {name for name, _ in NODES}:
            raise RuntimeError("PM2 preflight missing one or more S1-S9 processes")
        if any(row["status"] != "online" for row in before.values()):
            raise RuntimeError("PM2 preflight found an offline S1-S9 process")
        for name, port in NODES:
            code = ready(client, port)
            if code != "200":
                raise RuntimeError(f"preflight readiness failed: {name}:{code}")
        for path, expected in EXPECTED_BEFORE.items():
            live = run(client, f"sha256sum {shlex.quote(path)}").strip().split()[0].lower()
            receipt["hashesBefore"][path] = live
            if live != expected:
                raise RuntimeError(f"CAS mismatch {path}: {live}")
        run(client, "set -eu; " + " && ".join([
            f"mkdir -p {shlex.quote(backup)}",
            *[f"cp -p {shlex.quote(path)} {shlex.quote(backup + '/' + key)}" for key, path in REMOTE.items()],
            f"pm2 jlist > {shlex.quote(backup + '/pm2_before.json')}",
            f"cp -p /root/.pm2/dump.pm2 {shlex.quote(backup + '/dump.pm2')}",
        ]))
        sftp = client.open_sftp()
        temp_paths = {}
        try:
            for key, path in REMOTE.items():
                temp = f"{path}.codex-hardening-{stamp}.tmp.js"
                temp_paths[key] = temp
                sftp.put(str(LOCAL[key]), temp)
        finally:
            sftp.close()
        try:
            checks = [f"node --check {shlex.quote(temp_paths[key])}" for key in REMOTE]
            moves = [
                f"mv {shlex.quote(temp_paths[key])} {shlex.quote(path)}"
                for key, path in REMOTE.items()
            ]
            run(client, "set -eu; " + " && ".join(checks + moves + [
                *[f"chmod 644 {shlex.quote(path)}" for path in REMOTE.values()],
            ]))
            touched = True
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
                    last = ready(client, port)
                    state = inventory(client).get(name, {})
                    if last == "200" and state.get("status") == "online" and state.get("pid") and state.get("pid") != old_pid:
                        time.sleep(1)
                        if ready(client, port) == "200":
                            receipt["readiness"][name] = {"http": "200", "pid": state["pid"], "flags": state["flags"]}
                            stable = True
                            break
                    time.sleep(1)
                if not stable:
                    raise RuntimeError(f"readiness failed: {name}:{last}")
            run(client, "pm2 save")
            receipt["after"] = inventory(client)
            receipt["hashesAfter"] = {path: run(client, f"sha256sum {shlex.quote(path)}").strip().split()[0].lower() for path in REMOTE.values()}
            if receipt["hashesAfter"] != candidate_hashes:
                raise RuntimeError("post-deploy hash read-back mismatch")
            receipt["status"] = "deployed"
        except Exception as exc:
            receipt["status"] = "failed"
            receipt["error"] = str(exc)
            receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            if touched:
                # Restore only files that still equal this candidate. This is a
                # per-file CAS guard against overwriting a concurrent hotfix.
                clauses = []
                for key, path in REMOTE.items():
                    clauses.append(
                        f"if [ \"$(sha256sum {shlex.quote(path)} | cut -d' ' -f1)\" = {shlex.quote(candidate_hashes[path])} ]; then cp -p {shlex.quote(backup + '/' + key)} {shlex.quote(path)}; fi"
                    )
                try:
                    run(client, "set -eu; " + " ".join(clauses))
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
