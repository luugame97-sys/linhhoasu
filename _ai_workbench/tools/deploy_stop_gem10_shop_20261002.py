"""Disable the level-10 gem bag shop row without touching the bag/use route."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import shlex
import time
from pathlib import Path

import paramiko

from rollback_role_lian_manifest_20260930 import ssh_config


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "_ai_workbench" / "temp" / "gem10_stop_shop_release_20261002"
APP = "/linhhoasu/lhs/newServer"
NODES = {
    "lhs-s1001": 8080,
    "lhs-s1002": 8083,
    "lhs-s1003": 8084,
    "lhs-s1004": 8085,
    "lhs-s1005": 8086,
    "lhs-s1006": 8087,
}
FILES = {
    "/linhhoasu/lhs/newServer/src/config/gemLevel10Choice.js": (
        ROOT / "_ai_workbench" / "temp" / "gem10_stop_shop_candidate_20261002" / "server" / "config" / "gemLevel10Choice.js",
        "4e4f040f5e40993145fd1fcd1f00ae00656b4bef278e36865c62d33112961eaf",
    ),
    "/linhhoasu/webgame/game/js/lhs-gem10-box-v1.js": (
        ROOT / "_ai_workbench" / "temp" / "gem10_stop_shop_candidate_20261002" / "client" / "lhs-gem10-box-v1.js",
        "07c77ff549b74032b01fc0dd5ef3e890769467ae94a6694d876325bf7854ea20",
    ),
    "/linhhoasu/webgame/game/index.html": (
        ROOT / "_ai_workbench" / "temp" / "gem10_stop_shop_candidate_20261002" / "client" / "index.html",
        "0388d7dad6206d939849dc9b5b97f7880c12044c5eaf7750b402f03ec8a9098d",
    ),
}


def sha_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def q(value: str) -> str:
    return shlex.quote(value)


CONFIG_SNAPSHOT = r'''
const crypto = require('node:crypto');
const C = require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const table = C.get('ShopConfig') || {};
const levels = C.get('GemLevelConfig') || {};
const bag = (C.get('AssetsConfig') || {})[100097] || null;
const use = (C.get('AssetsUseConfig') || {})[100097] || null;
const sorted = Object.values(table).filter(row => Number(row && row.id) !== 10000007).sort((a, b) => Number(a.id) - Number(b.id));
const gemRows = Object.values(table).filter(row => Array.isArray(row && row.rewards) && row.rewards.some(x => [100091,100093,100095].includes(Number(x.id)))).sort((a,b) => Number(a.id)-Number(b.id));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
process.stdout.write(JSON.stringify({
  shopTarget: table[10000007] || table['10000007'] || null,
  shopCount: Object.keys(table).length,
  shopWithoutTargetHash: digest(sorted),
  gemShopHash: digest(gemRows),
  bag: bag && {id: bag.id, type: bag.type, useType: bag.useType, icon: bag.icon},
  use: use && {id: use.id, type: use.type, rewards: use.rewards},
  fieldMax: (C.get('GemBaseConfig') || {}).fieldMax,
  maxQuickLevel: (C.get('GemBaseConfig') || {}).maxQuickLevel,
  gemMaxLevel: Object.values(levels).reduce((n, row) => Math.max(n, Number(row && row.level) || 0), 0)
}));
'''


def main() -> None:
    local = {remote: data.read_bytes() for remote, (data, _) in FILES.items()}
    after = {remote: sha_bytes(data) for remote, data in local.items()}
    assert b"SHOP_ENABLED = false" in local[next(path for path in FILES if path.endswith("gemLevel10Choice.js"))]
    assert b"SHOP_ENABLED = false" in local[next(path for path in FILES if path.endswith("lhs-gem10-box-v1.js"))]
    assert b"20261002_gem10_selectable_box_v2" in local[next(path for path in FILES if path.endswith("index.html"))]

    args, kwargs = ssh_config()
    assert args[0] == "103.116.104.165"
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()
    stamp = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/gem10_stop_shop_{stamp}"
    stages = {
        remote: f"{remote}.stopgem10_{stamp}{'.js' if remote.endswith('.js') else '.html'}"
        for remote in FILES
    }
    swapped: list[str] = []
    receipt = {
        "at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "backupDir": backup,
        "directPlayerWrites": 0,
        "pm2Restarts": [],
        "files": {},
        "result": "STARTED",
    }

    def run(command: str, timeout: int = 50) -> bytes:
        _, stdout, stderr = client.exec_command(command, timeout=timeout)
        output = stdout.read()
        error = stderr.read()
        code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError(f"COMMAND_FAILED:{code}:{error.decode('utf-8', 'replace')[-900:]}")
        return output

    def remote_hash(path: str) -> str | None:
        try:
            with sftp.open(path, "rb") as handle:
                return sha_bytes(handle.read())
        except FileNotFoundError:
            return None

    def processes() -> dict:
        rows = json.loads(run("pm2 jlist").decode("utf-8"))
        return {
            row["name"]: {
                "pid": row["pid"],
                "restarts": row["pm2_env"]["restart_time"],
                "status": row["pm2_env"]["status"],
                "watch": row["pm2_env"].get("watch", False),
            }
            for row in rows
        }

    def ready(name: str, wait: bool = True) -> dict:
        end = time.monotonic() + (60 if wait else 0)
        while True:
            try:
                value = json.loads(run(f"curl --max-time 5 -fsS http://127.0.0.1:{NODES[name]}/ready", 8).decode("utf-8"))
                checks = value.get("checks", {})
                if value.get("status") == "ok" and checks.get("mongo") is True and checks.get("redis") is True:
                    return value
            except Exception:
                pass
            if time.monotonic() >= end:
                raise RuntimeError(f"READY_FAILED:{name}")
            time.sleep(1)

    def config_snapshot() -> dict:
        raw = run(f"cd {q(APP)} && node -e {q(CONFIG_SNAPSHOT)}", 50).decode("utf-8", "replace")
        line = next((line for line in reversed(raw.splitlines()) if line.strip().startswith("{")), "")
        if not line:
            raise RuntimeError(f"CONFIG_SNAPSHOT_EMPTY:{raw[-500:]}")
        return json.loads(line)

    def write_receipt() -> None:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / "deployment.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    try:
        pre_hashes = {remote: remote_hash(remote) for remote in FILES}
        for remote, (_, expected) in FILES.items():
            if pre_hashes[remote] != expected:
                raise RuntimeError(f"CAS_MISMATCH:{remote}:{pre_hashes[remote]}:{expected}")
        receipt["preProcesses"] = processes()
        for name in NODES:
            row = receipt["preProcesses"].get(name)
            if not row or row["status"] != "online" or row["watch"]:
                raise RuntimeError(f"PROCESS_PRECONDITION:{name}:{row}")
        receipt["preReady"] = {name: ready(name, False) for name in NODES}
        receipt["preConfig"] = config_snapshot()
        if receipt["preConfig"]["shopTarget"] is None:
            raise RuntimeError("SHOP_TARGET_NOT_PRESENT_BEFORE_STOP")
        if receipt["preConfig"]["bag"] is None or receipt["preConfig"]["use"] is None:
            raise RuntimeError("BAG_ROUTE_MISSING_BEFORE_STOP")

        run(f"mkdir -m 700 -- {q(backup)}")
        for remote in FILES:
            backup_file = f"{backup}/{Path(remote).name}"
            run(f"cp -p -- {q(remote)} {q(backup_file)}")
            if remote_hash(backup_file) != pre_hashes[remote]:
                raise RuntimeError(f"BACKUP_VERIFY_FAILED:{remote}")

        for remote, data in local.items():
            with sftp.open(stages[remote], "wb") as handle:
                handle.write(data)
            sftp.chmod(stages[remote], 0o644)
            if remote.endswith(".js"):
                run(f"node --check {q(stages[remote])}")
            if remote_hash(stages[remote]) != after[remote]:
                raise RuntimeError(f"STAGE_VERIFY_FAILED:{remote}")
            receipt["files"][remote] = {"before": pre_hashes[remote], "after": after[remote]}
        write_receipt()

        for remote in FILES:
            if remote_hash(remote) != receipt["files"][remote]["before"]:
                raise RuntimeError(f"CAS_BEFORE_SWAP:{remote}")

        # Server config first, then rolling restart; static files follow after
        # the authoritative shop row is gone from every game node.
        server_file = next(remote for remote in FILES if remote.endswith("gemLevel10Choice.js"))
        sftp.posix_rename(stages[server_file], server_file)
        swapped.append(server_file)
        if remote_hash(server_file) != after[server_file]:
            raise RuntimeError(f"POST_SWAP_VERIFY_FAILED:{server_file}")
        receipt["serverSwapped"] = [server_file]
        write_receipt()

        for name in NODES:
            before = receipt["preProcesses"][name]
            run(f"pm2 restart {q(name)} --update-env", 50)
            health = ready(name, True)
            after_proc = processes()[name]
            if after_proc["status"] != "online" or after_proc["pid"] == before["pid"] or after_proc["restarts"] != before["restarts"] + 1:
                raise RuntimeError(f"PROCESS_RESTART_VERIFY_FAILED:{name}:{after_proc}")
            receipt["pm2Restarts"].append({"name": name, "ready": health, "process": after_proc})
            write_receipt()

        receipt["postConfig"] = config_snapshot()
        if receipt["postConfig"]["shopTarget"] is not None:
            raise RuntimeError("SHOP_TARGET_STILL_PRESENT_AFTER_STOP")
        if receipt["postConfig"]["bag"] is None or receipt["postConfig"]["use"] is None:
            raise RuntimeError("BAG_ROUTE_MISSING_AFTER_STOP")
        if receipt["postConfig"]["shopWithoutTargetHash"] != receipt["preConfig"]["shopWithoutTargetHash"]:
            raise RuntimeError("NON_TARGET_SHOP_CONFIG_CHANGED")
        if receipt["postConfig"]["gemShopHash"] != receipt["preConfig"]["gemShopHash"]:
            raise RuntimeError("EXISTING_GEM_SHOP_ROWS_CHANGED")

        for remote in FILES:
            if remote.endswith("gemLevel10Choice.js"):
                continue
            if remote_hash(remote) != receipt["files"][remote]["before"]:
                raise RuntimeError(f"STATIC_CAS_BEFORE_SWAP:{remote}")
            sftp.posix_rename(stages[remote], remote)
            swapped.append(remote)
            if remote_hash(remote) != after[remote]:
                raise RuntimeError(f"POST_SWAP_VERIFY_FAILED:{remote}")
        receipt["staticSwapped"] = [remote for remote in FILES if not remote.endswith("gemLevel10Choice.js")]
        receipt["postFiles"] = {remote: remote_hash(remote) for remote in FILES}
        receipt["postProcesses"] = processes()
        receipt["result"] = "DEPLOYED_VERIFIED"
        receipt["completedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
        write_receipt()
    except Exception as exc:
        receipt["result"] = "FAILED"
        receipt["error"] = str(exc)
        write_receipt()
        # Rollback only files already swapped in this operation. Do not touch
        # player data or restart unrelated services on a failed gate.
        rollback_errors = []
        for remote in reversed(swapped):
            try:
                backup_file = f"{backup}/{Path(remote).name}"
                rollback_stage = f"{remote}.rollback_{stamp}"
                run(f"cp -p -- {q(backup_file)} {q(rollback_stage)}")
                sftp.posix_rename(rollback_stage, remote)
            except Exception:
                rollback_errors.append(remote)
        receipt["rollback"] = "restored" if not rollback_errors else "needs_attention"
        if rollback_errors:
            receipt["rollbackErrors"] = rollback_errors
        write_receipt()
        raise
    finally:
        for stage in stages.values():
            try:
                sftp.remove(stage)
            except FileNotFoundError:
                pass
        sftp.close()
        client.close()
        print(json.dumps(receipt, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
