"""Deploy player-mutation serialization hardening for shop and mount upgrade."""

from __future__ import annotations

import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

WB = Path(__file__).resolve().parents[1]
ROOT = WB.parent / "linhhoasu/lhs/newServer"
APP = "/linhhoasu/lhs/newServer"
FILES = {
    "src/handlers/item.js": ROOT / "src/handlers/item.js",
    "src/handlers/mount.js": ROOT / "src/handlers/mount.js",
}
EXPECTED = {
    "src/handlers/item.js": "8dc37c6d2e79bf003f9018690b1f53a3958d5f1e4d7b5dcab95cc138d88a040e",
    "src/handlers/mount.js": "6e936db9c9579acb384c0cb89083dfe4b50e8a58475552a35a7c6598ef975776",
}
PROCS = ["lhs-s1001", "lhs-s1002", "lhs-s1003"]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ready(ssh):
    out = {}
    for _ in range(20):
        out = {}
        for port in (8080, 8083, 8084):
            try:
                out[str(port)] = run(ssh, f"curl -fsS --max-time 8 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip()
            except RuntimeError:
                out[str(port)] = "000"
        if set(out.values()) == {"200"}:
            return out
        time.sleep(2)
    return out


def pm2(ssh):
    raw = run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if(%s.includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,status:e.status,pid:p.pid,restarts:e.restart_time}))}}})'" % json.dumps(PROCS))
    return [json.loads(x) for x in raw.splitlines() if x.strip().startswith("{")]


def main():
    for path in FILES.values():
        if not path.is_file():
            raise FileNotFoundError(path)
    subprocess_test = WB / "tools/test_mutation_lock_contract.js"
    import subprocess
    subprocess.run(["node", str(subprocess_test)], cwd=WB.parent, check=True, timeout=120)
    candidates = {rel: sha(path) for rel, path in FILES.items()}
    ssh = connect()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    stage = f"/linhhoasu/_ai_workbench/temp/mutation_lock_hardening_{stamp}"
    backup = f"/linhhoasu/_ai_workbench/backups/mutation_lock_hardening_pre_{stamp}"
    swapped = False
    try:
        remote = {rel: APP + "/" + rel for rel in FILES}
        raw = run(ssh, "sha256sum -- " + " ".join(shlex.quote(remote[x]) for x in FILES))
        current = {line.split()[-1].replace(APP + "/", ""): line.split()[0] for line in raw.splitlines() if len(line.split()) >= 2}
        for rel, expected in EXPECTED.items():
            if current.get(rel) != expected:
                raise RuntimeError(f"BASELINE_MISMATCH:{rel}:{current.get(rel)}")
        run(ssh, f"mkdir -p -- {shlex.quote(stage)} {shlex.quote(backup)}")
        run(ssh, f"pm2 jlist > {shlex.quote(backup + '/pm2-before.json')}")
        with ssh.open_sftp() as sftp:
            for rel, path in FILES.items():
                run(ssh, f"mkdir -p -- {shlex.quote((stage + '/' + rel).rsplit('/', 1)[0])} {shlex.quote((backup + '/' + rel).rsplit('/', 1)[0])}")
                sftp.put(str(path), stage + "/" + rel)
                run(ssh, f"cp -p -- {shlex.quote(remote[rel])} {shlex.quote(backup + '/' + rel)}")
                run(ssh, f"node --check {shlex.quote(stage + '/' + rel)}")
        for rel in FILES:
            tmp = remote[rel] + ".mutation-lock-stage"
            run(ssh, f"cp -- {shlex.quote(stage + '/' + rel)} {shlex.quote(tmp)} && mv -- {shlex.quote(tmp)} {shlex.quote(remote[rel])}")
        swapped = True
        before = pm2(ssh)
        for proc in PROCS:
            run(ssh, f"pm2 reload {proc} --update-env")
        health = ready(ssh)
        after = pm2(ssh)
        if set(health.values()) != {"200"} or len(after) != 3 or any(x.get("status") != "online" for x in after):
            raise RuntimeError("POST_DEPLOY_HEALTH_FAILED")
        remote_test = stage + "/test_mutation_lock_contract.js"
        with ssh.open_sftp() as sftp:
            sftp.put(str(subprocess_test), remote_test)
        test = run(ssh, f"NODE_PATH={APP}/node_modules MUTATION_APP_ROOT={APP} node {shlex.quote(remote_test)}")
        if '"result":"PASS"' not in test:
            raise RuntimeError("REMOTE_LOCK_CONTRACT_FAILED")
        run(ssh, "pm2 save")
        result = {"result":"DEPLOY_VERIFIED","deployedAt":datetime.now(timezone.utc).isoformat(),"timezone":"Asia/Ho_Chi_Minh (UTC+7)","backup":backup,"stage":stage,"candidateHashes":candidates,"remoteBeforeHashes":current,"health":health,"pm2Before":before,"pm2After":after,"contract":test.strip(),"playerDataMutation":False}
        out = WB / "temp/mutation_lock_hardening_20260914"
        out.mkdir(parents=True, exist_ok=True)
        (out / f"deploy_{stamp}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=True, indent=2))
    except Exception:
        if swapped:
            try:
                for rel in FILES:
                    tmp = remote[rel] + ".mutation-lock-rollback"
                    run(ssh, f"cp -- {shlex.quote(backup + '/' + rel)} {shlex.quote(tmp)} && mv -- {shlex.quote(tmp)} {shlex.quote(remote[rel])}")
                for proc in PROCS:
                    run(ssh, f"pm2 reload {proc} --update-env")
                ready(ssh)
            except Exception as rollback_error:
                raise RuntimeError(f"ROLLBACK_FAILED:{rollback_error}") from rollback_error
        raise
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
