"""Deploy the narrow daily paid-shop limit overlay with CAS and runtime read-back."""
from __future__ import annotations

import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / "linhhoasu/lhs/newServer/src/config/petPackageUnlimited.js"
REMOTE = "/linhhoasu/lhs/newServer/src/config/petPackageUnlimited.js"
CREDS = ROOT / "_ai_workbench/VPS103.116.104.165.txt"
OUT = ROOT / "_ai_workbench/temp/shop_package_limits_20261014"
NODES = [
    ("lhs-s1001", 8080), ("lhs-s1002", 8083), ("lhs-s1003", 8084),
    ("lhs-s1004", 8085), ("lhs-s1005", 8086), ("lhs-s1006", 8087),
    ("lhs-s1007", 8088), ("lhs-s1008", 8089),
]
PAID_IDS = [4000002, 4000003, 4000004, 4000005, 4000006]
FREE_ID = 4000001
UNCHANGED_IDS = [4000007, 4000008]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def q(value: str) -> str:
    return shlex.quote(value)


def connect() -> paramiko.SSHClient:
    host, user, password = CREDS.read_text(encoding="utf-8-sig").splitlines()
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    client.connect(host, username=user, password=password, look_for_keys=False,
                   allow_agent=False, timeout=20)
    return client


def run(client: paramiko.SSHClient, command: str, timeout: int = 120) -> str:
    _, stdout, stderr = client.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(f"REMOTE_RC{code}:{error[-1200:]}:{output[-600:]}")
    return output


def remote_hash(client: paramiko.SSHClient, path: str) -> str:
    return run(client, f"sha256sum -- {q(path)} | awk '{{print $1}}'").strip()


def readiness(client: paramiko.SSHClient, port: int) -> dict:
    raw = run(client, f"curl -fsS --max-time 10 http://127.0.0.1:{port}/ready", 20)
    body = json.loads(raw)
    if body.get("status") != "ok" or body.get("checks", {}).get("mongo") is not True \
            or body.get("checks", {}).get("redis") is not True:
        raise RuntimeError(f"READINESS_BAD:{port}:{raw[-500:]}")
    return body


def process_snapshot(client: paramiko.SSHClient) -> list[dict]:
    code = (
        "const a=JSON.parse(require('child_process').execFileSync('pm2',['jlist'],{encoding:'utf8'}));"
        "console.log(JSON.stringify(a.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status," 
        "restart_time:p.pm2_env.restart_time}))))"
    )
    return json.loads(run(client, "node -e " + q(code)))


def runtime_config_readback(client: paramiko.SSHClient) -> dict:
    code = (
        "const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');"
        "const t=c.loadAllTables(),s=t.ShopConfig||{};"
        "const ids=[4000001,4000002,4000003,4000004,4000005,4000006,4000007,4000008,4000103];"
        "const out=ids.map(id=>{const r=s[id]||s[String(id)];return {id,limit:Number(r&&r.limit),limitType:Number(r&&r.limitType),payId:Number(r&&r.payId),tab:Number(r&&r.tab)}});"
        "const paid=[4000002,4000003,4000004,4000005,4000006];"
        "if(!out.find(x=>x.id===4000001&&x.limit===1&&x.limitType===1))throw Error('FREE_CHANGED');"
        "for(const id of paid){const x=out.find(r=>r.id===id);if(!x||x.limit!==0||x.limitType!==0)throw Error('PAID_LIMIT_WRONG:'+id)}"
        "for(const id of [4000007,4000008]){const x=out.find(r=>r.id===id);if(!x||x.limit!==1||x.limitType!==1)throw Error('UNCHANGED_LIMIT_WRONG:'+id)}"
        "const weekly=out.find(x=>x.id===4000103);if(!weekly||weekly.limit!==0||weekly.limitType!==0)throw Error('WEEKLY_REGRESSED');"
        "console.log(JSON.stringify({packages:out}));"
    )
    lines = [line.strip() for line in run(client, "node -e " + q(code), 90).splitlines() if line.strip()]
    return json.loads(lines[-1])


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/shop_package_limits_20261014_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/shop_package_limits_20261014_{stamp}"
    candidate = LOCAL.read_bytes()
    candidate_hash = sha(candidate)
    event = {
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "result": "FAILED",
        "remote": REMOTE,
        "candidateHash": candidate_hash,
        "productionFileWrites": 0,
        "playerWrites": 0,
        "backup": backup,
        "stage": stage,
    }
    client = connect()
    swapped = False
    restarted: list[str] = []
    try:
        event["preProcesses"] = process_snapshot(client)
        game = {row["name"]: row for row in event["preProcesses"] if row["name"] in {n for n, _ in NODES}}
        if len(game) != len(NODES) or any(row["status"] != "online" for row in game.values()):
            raise RuntimeError("PROCESS_BASELINE")
        event["preReady"] = {str(port): readiness(client, port) for _, port in NODES}
        live_before = remote_hash(client, REMOTE)
        event["liveBeforeHash"] = live_before
        if live_before == candidate_hash:
            raise RuntimeError("ALREADY_DEPLOYED")

        run(client, f"install -d -m 700 -- {q(backup)} {q(stage)}")
        backup_target = f"{backup}/petPackageUnlimited.js"
        stage_target = f"{stage}/petPackageUnlimited.js"
        run(client, f"cp -p -- {q(REMOTE)} {q(backup_target)}")
        if remote_hash(client, backup_target) != live_before:
            raise RuntimeError("BACKUP_HASH_MISMATCH")
        with client.open_sftp() as sftp:
            with sftp.open(stage_target, "wb") as handle:
                handle.write(candidate)
        run(client, f"chmod 640 -- {q(stage_target)}")
        run(client, f"node --check {q(stage_target)}", 30)
        if remote_hash(client, stage_target) != candidate_hash:
            raise RuntimeError("STAGE_HASH_MISMATCH")
        if remote_hash(client, REMOTE) != live_before:
            raise RuntimeError("CAS_DRIFT_BEFORE_SWAP")
        temp_target = REMOTE + ".shop_package_limits.tmp"
        run(client, f"cp -- {q(stage_target)} {q(temp_target)} && chmod --reference={q(REMOTE)} {q(temp_target)} && chown --reference={q(REMOTE)} {q(temp_target)}")
        if remote_hash(client, temp_target) != candidate_hash:
            raise RuntimeError("TEMP_HASH_MISMATCH")
        run(client, f"mv -f -- {q(temp_target)} {q(REMOTE)}")
        swapped = True
        if remote_hash(client, REMOTE) != candidate_hash:
            raise RuntimeError("LIVE_HASH_MISMATCH")
        event["productionFileWrites"] = 1

        for name, port in NODES:
            run(client, f"pm2 restart {q(name)} --update-env", 120)
            restarted.append(name)
            readiness(client, port)
            event["restarts"] = restarted[:]
        event["runtimeConfig"] = runtime_config_readback(client)
        event["postReady"] = {str(port): readiness(client, port) for _, port in NODES}
        event["postProcesses"] = process_snapshot(client)
        event["liveAfterHash"] = remote_hash(client, REMOTE)
        if event["liveAfterHash"] != candidate_hash:
            raise RuntimeError("FINAL_HASH_MISMATCH")
        event["result"] = "PASS"
        event["completedAt"] = datetime.now(timezone.utc).isoformat()
        print(json.dumps(event, ensure_ascii=False, indent=2))
    except Exception as exc:
        event["error"] = str(exc)
        if swapped:
            try:
                rollback_tmp = REMOTE + ".shop_package_limits.rollback.tmp"
                run(client, f"cp -- {q(backup + '/petPackageUnlimited.js')} {q(rollback_tmp)} && chmod --reference={q(REMOTE)} {q(rollback_tmp)} && chown --reference={q(REMOTE)} {q(rollback_tmp)} && mv -f -- {q(rollback_tmp)} {q(REMOTE)}")
                event["rollback"] = "RESTORED"
                for name, port in NODES:
                    if name in restarted:
                        run(client, f"pm2 restart {q(name)} --update-env", 120)
                        readiness(client, port)
            except Exception as rollback_error:
                event["rollback"] = "FAILED"
                event["rollbackError"] = str(rollback_error)
        print(json.dumps(event, ensure_ascii=False, indent=2))
        raise
    finally:
        try:
            run(client, f"rm -rf -- {q(stage)}", 30)
        except Exception:
            pass
        client.close()
        (OUT / "deployment.json").write_text(json.dumps(event, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
