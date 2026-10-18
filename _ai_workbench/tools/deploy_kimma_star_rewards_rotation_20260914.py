"""Deploy promotional diamond rewards and Kim-Ma recurring cycles."""

from __future__ import annotations

import hashlib
import json
import shlex
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run


WB = Path(__file__).resolve().parents[1]
ROOT = WB.parent / "linhhoasu/lhs/newServer"
LOCAL = WB / "temp/kimma_star_rewards_rotation_20260914"
APP = "/linhhoasu/lhs/newServer"
FILES = {
    "src/services/RechargeRewardResolver.js": ROOT / "src/services/RechargeRewardResolver.js",
    "src/services/ActivityCycleSchedule.js": ROOT / "src/services/ActivityCycleSchedule.js",
    "src/services/NewYearEventSchedule.js": ROOT / "src/services/NewYearEventSchedule.js",
    "src/services/EventRewardSettlementService.js": ROOT / "src/services/EventRewardSettlementService.js",
    "src/handlers/account.js": ROOT / "src/handlers/account.js",
    "src/config/eventRotation.json": ROOT / "src/config/eventRotation.json",
    "../webgame/game/update/resource/assets/excel/config_e5ac72c2.bin": WB / "temp/promotional_rewards_20260914/live_now/client.bin",
    "../lhs/update/resource/assets/excel/config_e5ac72c2.bin": WB / "temp/promotional_rewards_20260914/live_now/server.bin",
    "../webgame/game/index.html": WB.parent / "linhhoasu/webgame/game/index.html",
}
REMOTE_MAP = {
    "../webgame/game/update/resource/assets/excel/config_e5ac72c2.bin": "/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin",
    "../lhs/update/resource/assets/excel/config_e5ac72c2.bin": "/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin",
    "../webgame/game/index.html": "/linhhoasu/webgame/game/index.html",
}
EXPECTED = {
    # Read from live VPS immediately before this deploy.
    "src/services/RechargeRewardResolver.js": "6f6e6f2b1d730190c09bc03d1914b58828286b7b0bfb6301b8b6febeb7b3dbc3",
    "src/services/ActivityCycleSchedule.js": "255b88651c3b4a1d4c17b06cf54f616da71d048a42298311df8f1108aed48ba5",
    "src/services/NewYearEventSchedule.js": "af0d31c4f33dfb3289aa1f519b770f049227d202a8322b9e9da442187f46095d",
    "src/services/EventRewardSettlementService.js": "e984e4a4589d920564879b2c2f4f9d2046fdf7dc316fd1949465169a1f14f40d",
    "src/handlers/account.js": "461060a579d440de2d4f85562850db12b4d4c869c6d95d2cfc2808d35431313e",
    "src/config/eventRotation.json": "bfaa48490e554e117c3dd6ca0ffb2d8377de2b3719d2016c0b67ce158a4be47c",
    "../webgame/game/update/resource/assets/excel/config_e5ac72c2.bin": "32789554f25db0a06ee614e45b47356f8e800a23b0955386029ff0e6630a3e46",
    "../lhs/update/resource/assets/excel/config_e5ac72c2.bin": "de15f1b74b310012cafc6ca2dfad84687800eb4375b2e901026ee5c41b8e5992",
    "../webgame/game/index.html": "f2a19f7f14352e3d8a655194717f4fc0be9e61c2c0cf25ad9949bf2d3507a42d",
}
PROCS = ["lhs-s1001", "lhs-s1002", "lhs-s1003"]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def local_check() -> None:
    subprocess.run(["node", str(WB / "tools/test_promotional_diamond_rewards_contract.js")], cwd=WB.parent, check=True, timeout=180)
    subprocess.run(["node", str(WB / "tools/test_event_rotation_20260914.js")], cwd=WB.parent, check=True, timeout=180)
    subprocess.run(["node", str(WB / "tools/test_p0_item_commerce_contract.js")], cwd=WB.parent, env={**__import__('os').environ, "P0_ONLY_CHAIN": "1"}, check=True, timeout=180)


def wait_ready(ssh):
    last = {}
    for _ in range(20):
        last = {}
        for port in (8080, 8083, 8084):
            try:
                last[str(port)] = run(ssh, f"curl -fsS --max-time 5 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip()
            except RuntimeError:
                last[str(port)] = "000"
        if set(last.values()) == {"200"}:
            return last
        time.sleep(2)
    return last


def pm2_snapshot(ssh):
    raw = run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{for(const p of JSON.parse(s)){if(%s.includes(p.name)){const e=p.pm2_env||{};console.log(JSON.stringify({name:p.name,status:e.status,pid:p.pid,restarts:e.restart_time}))}}})'" % json.dumps(PROCS))
    return [json.loads(line) for line in raw.splitlines() if line.strip().startswith("{")]


def main() -> None:
    local_check()
    candidate = {rel: sha(path) for rel, path in FILES.items()}
    ssh = connect()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    stage = f"/linhhoasu/_ai_workbench/temp/kimma_star_rewards_rotation_{stamp}"
    backup = f"/linhhoasu/_ai_workbench/backups/kimma_star_rewards_rotation_pre_{stamp}"
    swapped = False
    try:
        remotes = {rel: REMOTE_MAP.get(rel, APP + "/" + rel) for rel in FILES}
        remote_hash_text = run(ssh, "sha256sum -- " + " ".join(shlex.quote(remotes[rel]) for rel in FILES))
        remote_hashes = {}
        for line in remote_hash_text.splitlines():
            bits = line.split()
            if len(bits) >= 2:
                remote_hashes[next((rel for rel, remote in remotes.items() if remote == bits[-1]), bits[-1])] = bits[0]
        for rel, expected in EXPECTED.items():
            if remote_hashes.get(rel) != expected:
                raise RuntimeError(f"BASELINE_MISMATCH:{rel}:{remote_hashes.get(rel)}")
        if run(ssh, f"test -e {shlex.quote(backup)} && echo yes || echo no").strip() != "no":
            raise RuntimeError("BACKUP_ALREADY_EXISTS")
        run(ssh, f"mkdir -p -- {shlex.quote(stage)} {shlex.quote(backup)}")
        run(ssh, f"pm2 jlist > {shlex.quote(backup + '/pm2-before.json')}")
        for rel in FILES:
            remote = remotes[rel]
            dst = backup + "/" + rel.replace("../", "parent__")
            run(ssh, f"mkdir -p -- {shlex.quote(dst.rsplit('/', 1)[0])} && cp -p -- {shlex.quote(remote)} {shlex.quote(dst)}")
        with ssh.open_sftp() as sftp:
            for rel, path in FILES.items():
                staged = stage + "/" + rel.replace("../", "parent__")
                run(ssh, f"mkdir -p -- {shlex.quote(staged.rsplit('/', 1)[0])}")
                sftp.put(str(path), staged)
                if run(ssh, f"sha256sum -- {shlex.quote(staged)} | awk '{{print $1}}'").strip() != candidate[rel]:
                    raise RuntimeError(f"STAGE_HASH_MISMATCH:{rel}")
            sftp.put(str(WB / "tools/test_promotional_diamond_rewards_contract.js"), stage + "/test_promotional_diamond_rewards_contract.js")
            sftp.put(str(WB / "tools/test_event_rotation_20260914.js"), stage + "/test_event_rotation_20260914.js")
            sftp.put(str(WB / "tools/test_p0_item_commerce_contract.js"), stage + "/test_p0_item_commerce_contract.js")
        for rel in FILES:
            if rel.endswith(".js"):
                run(ssh, f"node --check {shlex.quote(stage + '/' + rel.replace('../', 'parent__'))}")
        before_pm2 = pm2_snapshot(ssh)
        for rel in FILES:
            remote = remotes[rel]
            staged = stage + "/" + rel.replace("../", "parent__")
            temp = remote + ".kimma-stage"
            run(ssh, f"cp -- {shlex.quote(staged)} {shlex.quote(temp)} && mv -- {shlex.quote(temp)} {shlex.quote(remote)}")
        swapped = True
        for proc in PROCS:
            run(ssh, f"pm2 reload {shlex.quote(proc)} --update-env")
        ready = wait_ready(ssh)
        after_pm2 = pm2_snapshot(ssh)
        if set(ready.values()) != {"200"} or len(after_pm2) != 3 or any(row.get("status") != "online" for row in after_pm2):
            raise RuntimeError("POST_DEPLOY_HEALTH_FAILED")
        node = "NODE_PATH=/linhhoasu/lhs/newServer/node_modules CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin"
        promo = run(ssh, f"{node} PROMO_APP_ROOT={shlex.quote(APP)} PROMO_CONFIG_BIN=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin node {shlex.quote(stage + '/test_promotional_diamond_rewards_contract.js')}")
        if '"result":"PASS"' not in promo:
            raise RuntimeError("REMOTE_PROMO_CONTRACT_FAILED")
        rotation = run(ssh, f"EVENT_ROTATION_NATIVE_ENABLED=1 EVENT_TEST_APP={shlex.quote(APP)} NODE_PATH=/linhhoasu/lhs/newServer/node_modules CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin node {shlex.quote(stage + '/test_event_rotation_20260914.js')}")
        if '"result":"PASS"' not in rotation:
            raise RuntimeError("REMOTE_ROTATION_CONTRACT_FAILED")
        run(ssh, "pm2 save")
        result = {
            "result": "DEPLOY_VERIFIED",
            "deployedAt": datetime.now(timezone.utc).isoformat(),
            "timezone": "Asia/Ho_Chi_Minh (UTC+7)",
            "backup": backup,
            "stage": stage,
            "candidateHashes": candidate,
            "remoteBeforeHashes": remote_hashes,
            "ready": ready,
            "pm2Before": before_pm2,
            "pm2After": after_pm2,
            "promoContract": promo[-3000:],
            "rotationContract": rotation[-3000:],
            "playerDataMutation": False,
        }
        LOCAL.mkdir(parents=True, exist_ok=True)
        (LOCAL / f"deploy_{stamp}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=True, indent=2))
    except Exception:
        if swapped:
            try:
                for rel in FILES:
                    remote = remotes[rel]
                    backup_file = backup + "/" + rel.replace("../", "parent__")
                    temp = remote + ".kimma-rollback"
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
