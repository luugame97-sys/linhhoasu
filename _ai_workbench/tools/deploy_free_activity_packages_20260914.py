"""Deploy generic free activity-shop guards to S1/S2/S3 with CAS rollback."""

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
LOCAL = WB / "temp/free_activity_packages_20260914"
FILES = {
    "src/handlers/item.js": ROOT / "src/handlers/item.js",
    "src/handlers/activity.js": ROOT / "src/handlers/activity.js",
    "src/handlers/commerce-compat.js": ROOT / "src/handlers/commerce-compat.js",
}
TESTS = {
    "test_free_activity_packages_contract.js": WB / "tools/test_free_activity_packages_contract.js",
    "test_p0_item_commerce_contract.js": WB / "tools/test_p0_item_commerce_contract.js",
}
EXPECTED = {
    "src/handlers/item.js": "8dc37c6d2e79bf003f9018690b1f53a3958d5f1e4d7b5dcab95cc138d88a040e",
    "src/handlers/activity.js": "b86cf3f81b81427c60ef8c3c7b1044295ad3e9feb6be35b9c254451331eca0dd",
    "src/handlers/commerce-compat.js": "70a47791d727ba17e55fb1935b5991d8454781d0dae88e7553a24d965444055f",
}
PROCS = ["lhs-s1001", "lhs-s1002", "lhs-s1003"]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def wait_ready(ssh) -> dict[str, str]:
    last: dict[str, str] = {}
    for _ in range(20):
        last = {}
        for port in (8080, 8083, 8084):
            try:
                last[str(port)] = run(
                    ssh,
                    f"curl -fsS --max-time 5 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready",
                ).strip()
            except RuntimeError:
                last[str(port)] = "000"
        if set(last.values()) == {"200"}:
            return last
        time.sleep(2)
    return last


def pm2_snapshot(ssh) -> list[dict]:
    output = run(
        ssh,
        "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if(%s.includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,status:e.status,pid:p.pid,restarts:e.restart_time}))}}})'"
        % json.dumps(PROCS),
    )
    return [json.loads(line) for line in output.splitlines() if line.strip().startswith("{")]


def main() -> None:
    LOCAL.mkdir(parents=True, exist_ok=True)
    candidate_hashes = {rel: sha(path) for rel, path in FILES.items()}
    for rel, expected in candidate_hashes.items():
        if not FILES[rel].is_file():
            raise FileNotFoundError(FILES[rel])
    for path in TESTS.values():
        if not path.is_file():
            raise FileNotFoundError(path)

    ssh = connect()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    stage = f"/linhhoasu/_ai_workbench/temp/free_activity_packages_{stamp}"
    backup = f"/linhhoasu/_ai_workbench/backups/free_activity_packages_pre_{stamp}"
    swapped = False
    result: dict = {}
    try:
        remote_hash_text = run(
            ssh,
            "sha256sum -- %s" % " ".join(shlex.quote(APP + "/" + rel) for rel in FILES),
        )
        remote_hashes = {}
        for line in remote_hash_text.splitlines():
            bits = line.split()
            if len(bits) >= 2:
                remote_hashes[bits[-1].replace(APP + "/", "")] = bits[0]
        for rel, expected in EXPECTED.items():
            if remote_hashes.get(rel) != expected:
                raise RuntimeError(f"BASELINE_MISMATCH:{rel}:{remote_hashes.get(rel)}")
        if run(ssh, f"test -e {shlex.quote(backup)} && echo yes || echo no").strip() != "no":
            raise RuntimeError("BACKUP_ALREADY_EXISTS")

        run(ssh, f"mkdir -p -- {shlex.quote(stage)} {shlex.quote(backup)}")
        run(ssh, f"pm2 jlist > {shlex.quote(backup + '/pm2-before.json')}")
        for rel in FILES:
            remote = APP + "/" + rel
            dst = backup + "/" + rel
            run(ssh, f"mkdir -p -- {shlex.quote(dst.rsplit('/', 1)[0])} && cp -p -- {shlex.quote(remote)} {shlex.quote(dst)}")

        with ssh.open_sftp() as sftp:
            for rel, path in FILES.items():
                staged = stage + "/" + rel
                run(ssh, f"mkdir -p -- {shlex.quote(staged.rsplit('/', 1)[0])}")
                sftp.put(str(path), staged)
                if run(ssh, f"sha256sum -- {shlex.quote(staged)} | awk '{{print $1}}'").strip() != candidate_hashes[rel]:
                    raise RuntimeError(f"STAGE_HASH_MISMATCH:{rel}")
            for name, path in TESTS.items():
                sftp.put(str(path), stage + "/" + name)

        for rel in FILES:
            run(ssh, f"node --check {shlex.quote(stage + '/' + rel)}")
        for rel in FILES:
            remote = APP + "/" + rel
            staged = stage + "/" + rel
            temp = remote + ".free-activity-stage"
            run(ssh, f"cp -- {shlex.quote(staged)} {shlex.quote(temp)} && mv -- {shlex.quote(temp)} {shlex.quote(remote)}")
        swapped = True
        deployed_hash_text = run(
            ssh,
            "sha256sum -- %s" % " ".join(shlex.quote(APP + "/" + rel) for rel in FILES),
        )
        if any(candidate_hashes[rel] not in deployed_hash_text for rel in FILES):
            raise RuntimeError("DEPLOYED_HASH_MISMATCH")

        before_pm2 = pm2_snapshot(ssh)
        for proc in PROCS:
            run(ssh, f"pm2 reload {shlex.quote(proc)} --update-env")
        ready = wait_ready(ssh)
        after_pm2 = pm2_snapshot(ssh)
        if set(ready.values()) != {"200"} or len(after_pm2) != len(PROCS) or any(row.get("status") != "online" for row in after_pm2):
            raise RuntimeError("POST_DEPLOY_HEALTH_FAILED")

        node_path = shlex.quote(APP + "/node_modules")
        generic_test = run(
            ssh,
            f"NODE_PATH={node_path} FREE_ACTIVITY_APP_ROOT={shlex.quote(APP)} node {shlex.quote(stage + '/test_free_activity_packages_contract.js')}",
        )
        if '"result": "PASS"' not in generic_test or '"checks": 12' not in generic_test:
            raise RuntimeError("REMOTE_FREE_ACTIVITY_CONTRACT_FAILED")
        p0_test = run(
            ssh,
            f"NODE_PATH={node_path} APP_ROOT={shlex.quote(APP)} P0_ONLY_CHAIN=1 node {shlex.quote(stage + '/test_p0_item_commerce_contract.js')}",
        )
        if '"result":"ok"' not in p0_test:
            raise RuntimeError("REMOTE_P0_CONTRACT_FAILED")
        run(ssh, "pm2 save")
        result = {
            "result": "DEPLOY_VERIFIED",
            "deployedAt": datetime.now(timezone.utc).isoformat(),
            "backup": backup,
            "stage": stage,
            "candidateHashes": candidate_hashes,
            "remoteBeforeHashes": remote_hashes,
            "remoteAfterHashes": deployed_hash_text.strip(),
            "ready": ready,
            "pm2Before": before_pm2,
            "pm2After": after_pm2,
            "genericContract": generic_test[-3000:],
            "p0Contract": p0_test[-3000:],
            "playerDataMutation": False,
        }
        (LOCAL / f"deploy_{stamp}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception:
        if swapped:
            try:
                for rel in FILES:
                    remote = APP + "/" + rel
                    backup_file = backup + "/" + rel
                    temp = remote + ".free-activity-rollback"
                    run(ssh, f"cp -- {shlex.quote(backup_file)} {shlex.quote(temp)} && mv -- {shlex.quote(temp)} {shlex.quote(remote)}")
                for proc in PROCS:
                    run(ssh, f"pm2 reload {shlex.quote(proc)} --update-env")
                wait_ready(ssh)
            except Exception as rollback_error:
                raise RuntimeError(f"DEPLOY_FAILED_ROLLBACK_FAILED:{rollback_error}") from rollback_error
        raise
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
