"""Safely disable real workers on S1-S4 and lower virtual population.

This release intentionally leaves S5/S6 untouched.  It patches only the live
ecosystem file after a SHA-256 CAS check, keeps a remote byte-for-byte backup,
then changes the four old game processes and four worker processes one at a
time.  No player, account, Mongo or Redis data is modified.
"""

from __future__ import annotations

import hashlib
import json
import shlex
import stat
import time
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
REMOTE = "/linhhoasu/lhs/newServer/ecosystem.config.js"
EXPECTED_REMOTE_SHA256 = "846bef606ea3d2fb765ba6ea9c87db52d2cccd2bcbf95459b6160f76f151a616"
GAME_NAMES = {1001: "lhs-s1001", 1002: "lhs-s1002", 1003: "lhs-s1003", 1004: "lhs-s1004"}
WORKER_NAMES = {1001: "lhs-real-bots", 1002: "lhs-real-bots-s2", 1003: "lhs-real-bots-s3", 1004: "lhs-real-bots-s4"}
PORTS = {1001: 8080, 1002: 8083, 1003: 8084, 1004: 8085, 1005: 8086, 1006: 8087}
WS_PORTS = {1001: 9200, 1002: 9201, 1003: 9202, 1004: 9203, 1005: 9204, 1006: 9205}


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def replace_once(value: str, old: str, new: str, label: str) -> str:
    count = value.count(old)
    if count != 1:
        raise RuntimeError(f"PATCH_EXPECTED_ONE:{label}:{count}")
    return value.replace(old, new, 1)


def slice_block(value: str, start: str, end: str) -> tuple[str, int, int]:
    begin = value.find(start)
    if begin < 0:
        raise RuntimeError(f"PATCH_START_MISSING:{start}")
    finish = value.find(end, begin + len(start))
    if finish < 0:
        raise RuntimeError(f"PATCH_END_MISSING:{end}")
    return value[begin:finish], begin, finish


def patch_block(value: str, start: str, end: str, transform, label: str) -> str:
    block, begin, finish = slice_block(value, start, end)
    changed = transform(block)
    if changed == block:
        raise RuntimeError(f"PATCH_NO_CHANGE:{label}")
    return value[:begin] + changed + value[finish:]


def direct_game(block: str, label: str) -> str:
    block = replace_once(block, "BOT_COUNT_PER_MAP: 10", "BOT_COUNT_PER_MAP: 3", f"{label}:count")
    return replace_once(block, "BOT_MAX_TOTAL: 580", "BOT_MAX_TOTAL: 324", f"{label}:max")


def direct_worker(block: str, label: str) -> str:
    block = replace_once(block, "BOT_WORKER_ENABLED: 1", "BOT_WORKER_ENABLED: 0", f"{label}:enabled")
    return replace_once(block, "BOT_WORKER_COUNT: 580", "BOT_WORKER_COUNT: 0", f"{label}:count")


def generated_game(block: str, server_id: int, label: str) -> str:
    marker = f"    SERVER_ID: {server_id},\n"
    addition = marker + "    BOT_COUNT_PER_MAP: 3,\n    BOT_MAX_TOTAL: 324,\n"
    return replace_once(block, marker, addition, f"{label}:overrides")


def generated_worker(block: str, server_id: int, label: str) -> str:
    marker = f"    BOT_WORKER_SERVER_ID: {server_id},\n"
    addition = marker + "    BOT_WORKER_ENABLED: 0,\n    BOT_WORKER_COUNT: 0,\n"
    return replace_once(block, marker, addition, f"{label}:overrides")


def candidate_config(before: bytes) -> bytes:
    text = before.decode("utf-8")
    # S1/S2 are literal app blocks; S3/S4 inherit templates and therefore get
    # explicit narrow overrides.  S5/S6 are never touched by this function.
    text = patch_block(text, "name: 'lhs-s1001',", "name: 'lhs-real-bots',", lambda b: direct_game(b, "s1-game"), "s1-game")
    text = patch_block(text, "name: 'lhs-real-bots',", "name: 'lhs-s1002',", lambda b: direct_worker(b, "s1-worker"), "s1-worker")
    text = patch_block(text, "name: 'lhs-s1002',", "name: 'lhs-real-bots-s2',", lambda b: direct_game(b, "s2-game"), "s2-game")
    text = patch_block(text, "name: 'lhs-real-bots-s2',", "name: 'lhs-s2001',", lambda b: direct_worker(b, "s2-worker"), "s2-worker")
    text = patch_block(text, "name: 'lhs-s1003',", "name: 'lhs-real-bots-s3',", lambda b: generated_game(b, 1003, "s3-game"), "s3-game")
    text = patch_block(text, "name: 'lhs-real-bots-s3',", "// S4_LAUNCH_20260916", lambda b: generated_worker(b, 1003, "s3-worker"), "s3-worker")
    text = patch_block(text, "name: 'lhs-s1004',", "name: 'lhs-real-bots-s4',", lambda b: generated_game(b, 1004, "s4-game"), "s4-game")
    text = patch_block(text, "name: 'lhs-real-bots-s4',", "// Synchronized competition release", lambda b: generated_worker(b, 1004, "s4-worker"), "s4-worker")
    return text.encode("utf-8")


def inventory(ssh):
    script = (
        "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(" 
        "JSON.parse(s).filter(p=>/^lhs-(s100[1-6]|real-bots)/.test(p.name)).map(p=>({" 
        "name:p.name,pid:p.pid,status:p.pm2_env&&p.pm2_env.status,restarts:p.pm2_env&&p.pm2_env.restart_time," 
        "env:(()=>{const e=p.pm2_env||{},v={...(e.env||{}),...e};return Object.fromEntries(Object.entries(v).filter(([k])=>" 
        "/^(BOT_ENABLED|BOT_COUNT_PER_MAP|BOT_MAX_TOTAL|BOT_WORKER_ENABLED|BOT_WORKER_COUNT|SERVER_ID|HTTP_PORT)$/.test(k)))})()" 
        "})))));"
    )
    return json.loads(run(ssh, "pm2 jlist | node -e " + shlex.quote(script)))


def assert_untouched(before_rows, after_rows, names):
    before = {row["name"]: row for row in before_rows}
    after = {row["name"]: row for row in after_rows}
    for name in names:
        if name not in before or name not in after:
            raise RuntimeError(f"UNTOUCHED_PROCESS_MISSING:{name}")
        left = before[name]
        right = after[name]
        # PID and PM2 restart counter are stronger evidence than status alone:
        # a stop/start cycle can leave the process online while still touching
        # S5/S6.  The allow-listed runtime env must also remain byte-equivalent.
        if right.get("status") != "online":
            raise RuntimeError(f"UNTOUCHED_PROCESS_NOT_ONLINE:{name}")
        if right.get("pid") != left.get("pid"):
            raise RuntimeError(f"UNTOUCHED_PROCESS_PID_CHANGED:{name}")
        if right.get("restarts") != left.get("restarts"):
            raise RuntimeError(f"UNTOUCHED_PROCESS_RESTARTED:{name}")
        if right.get("env") != left.get("env"):
            raise RuntimeError(f"UNTOUCHED_PROCESS_ENV_CHANGED:{name}")


def ready(ssh, port: int) -> bool:
    code = run(
        ssh,
        f"curl -sS -o /dev/null -w '%{{http_code}}' --connect-timeout 2 --max-time 12 "
        f"http://127.0.0.1:{port}/ready || true",
    ).strip()
    return code == "200"


def require_readiness(ssh, attempts: int = 15):
    latest = {}
    for _ in range(attempts):
        latest = {str(sid): ready(ssh, port) for sid, port in PORTS.items()}
        if all(latest.values()):
            return latest
        time.sleep(2)
    raise RuntimeError(f"READINESS_PRECONDITION_FAILED:{latest}")


def health_summary(ssh):
    result = {}
    for sid, port in WS_PORTS.items():
        raw = run(
            ssh,
            f"curl -sS --connect-timeout 2 --max-time 20 http://127.0.0.1:{port}/health || true",
        ).strip()
        try:
            body = json.loads(raw)
            bots = ((body.get("runtime") or {}).get("bots") or {})
            real = bots.get("real") or {}
            result[str(sid)] = {
                "status": body.get("status"),
                "virtualCount": bots.get("botCount"),
                "realCount": real.get("count"),
            }
        except json.JSONDecodeError:
            result[str(sid)] = {"status": "unreadable"}
    return result


def require_bot_policy(ssh, attempts: int = 20):
    """Wait for the authoritative health counters to reflect the rollout."""
    latest = {}
    for _ in range(attempts):
        latest = health_summary(ssh)
        old_ok = all(
            latest.get(str(sid), {}).get("status") == "ok"
            and latest.get(str(sid), {}).get("realCount") == 0
            and 0 < int(latest.get(str(sid), {}).get("virtualCount") or 0) <= 324
            for sid in GAME_NAMES
        )
        new_ok = all(
            latest.get(str(sid), {}).get("status") == "ok"
            and latest.get(str(sid), {}).get("realCount") == 580
            and latest.get(str(sid), {}).get("virtualCount") == 580
            for sid in (1005, 1006)
        )
        if old_ok and new_ok:
            return latest
        time.sleep(2)
    raise RuntimeError(f"BOT_POLICY_READBACK_FAILED:{latest}")


def set_worker_disabled(ssh, name: str):
    run(ssh, f"BOT_WORKER_ENABLED=0 BOT_WORKER_COUNT=0 pm2 restart {shlex.quote(name)} --update-env")
    run(ssh, f"pm2 stop {shlex.quote(name)}")


def set_game_virtual(ssh, name: str):
    run(
        ssh,
        f"BOT_ENABLED=1 BOT_COUNT_PER_MAP=3 BOT_MAX_TOTAL=324 "
        f"pm2 restart {shlex.quote(name)} --update-env",
    )


def rollback_runtime(ssh, restarted_workers, restarted_games):
    # Best effort only; the caller reports the original failure.  These values
    # match the verified pre-change runtime and never touch S5/S6.
    for name in reversed(restarted_games):
        run(ssh, f"BOT_ENABLED=1 BOT_COUNT_PER_MAP=10 BOT_MAX_TOTAL=580 pm2 restart {shlex.quote(name)} --update-env")
    for name in reversed(restarted_workers):
        run(ssh, f"BOT_WORKER_ENABLED=1 BOT_WORKER_COUNT=580 pm2 restart {shlex.quote(name)} --update-env")
    run(ssh, "pm2 save")


def main():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    local_evidence = ROOT / "_ai_workbench" / "temp" / f"bot_policy_s1_s4_{stamp}"
    local_evidence.mkdir(parents=True, exist_ok=False)
    backup = f"/linhhoasu/_ai_workbench/backups/bot_policy_s1_s4_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/bot_policy_s1_s4_{stamp}"
    ssh = connect()
    swapped = False
    restarted_workers = []
    restarted_games = []
    try:
        before_inventory = inventory(ssh)
        required = set(GAME_NAMES.values()) | set(WORKER_NAMES.values()) | {"lhs-s1005", "lhs-s1006", "lhs-real-bots-s5", "lhs-real-bots-s6"}
        seen = {row["name"] for row in before_inventory}
        if not required.issubset(seen):
            raise RuntimeError(f"PROCESS_INVENTORY_INCOMPLETE:{sorted(required - seen)}")
        if any(row["status"] != "online" for row in before_inventory if row["name"] in required):
            raise RuntimeError("PROCESS_PRECONDITION_NOT_ONLINE")
        before_ready = require_readiness(ssh)
        before_health = health_summary(ssh)
        if any(
            before_health.get(str(sid), {}).get("status") != "ok"
            or before_health.get(str(sid), {}).get("realCount") != 580
            or before_health.get(str(sid), {}).get("virtualCount") != 580
            for sid in (1001, 1002, 1003, 1004, 1005, 1006)
        ):
            raise RuntimeError(f"BOT_POLICY_PRECONDITION_FAILED:{before_health}")
        with ssh.open_sftp() as sftp:
            before = sftp.open(REMOTE, "rb").read()
            before_hash = sha_bytes(before)
            if before_hash != EXPECTED_REMOTE_SHA256:
                raise RuntimeError(f"REMOTE_CAS_DRIFT:{before_hash}:{EXPECTED_REMOTE_SHA256}")
            candidate = candidate_config(before)
            candidate_hash = sha_bytes(candidate)
            original_mode = stat.S_IMODE(sftp.stat(REMOTE).st_mode)
            run(ssh, f"install -d -m 700 {shlex.quote(backup)} {shlex.quote(stage)}")
            with sftp.open(f"{backup}/ecosystem.config.js.before", "wb") as backup_file:
                backup_file.write(before)
            with sftp.open(f"{stage}/ecosystem.config.js", "wb") as candidate_file:
                candidate_file.write(candidate)
            sftp.chmod(f"{backup}/ecosystem.config.js.before", original_mode)
            sftp.chmod(f"{stage}/ecosystem.config.js", original_mode)
            with sftp.open(f"{backup}/ecosystem.config.js.before", "rb") as backup_file:
                if sha_bytes(backup_file.read()) != before_hash:
                    raise RuntimeError("BACKUP_HASH_MISMATCH")
            with sftp.open(f"{backup}/ecosystem.config.js.before", "rb") as backup_file:
                if sha_bytes(backup_file.read()) != before_hash:
                    raise RuntimeError("REMOTE_BACKUP_HASH_MISMATCH")
        run(ssh, f"node --check {shlex.quote(stage + '/ecosystem.config.js')}")
        with ssh.open_sftp() as sftp:
            if sftp.open(REMOTE, "rb").read() != before:
                raise RuntimeError("PRE_SWAP_CAS_DRIFT")
            sftp.posix_rename(f"{stage}/ecosystem.config.js", REMOTE)
            with sftp.open(REMOTE, "rb") as live_file:
                if sha_bytes(live_file.read()) != candidate_hash:
                    raise RuntimeError("POST_SWAP_HASH_MISMATCH")
            swapped = True
            with sftp.open(REMOTE, "rb") as live_file:
                if sha_bytes(live_file.read()) != candidate_hash:
                    raise RuntimeError("REMOTE_SWAP_HASH_MISMATCH")
            manifest = {
                "release": "bot_policy_s1_s4_20260927",
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "beforeSha256": before_hash,
                "candidateSha256": candidate_hash,
                "changedServers": [1001, 1002, 1003, 1004],
                "virtualBotCountPerMap": 3,
                "virtualBotMaxTotal": 324,
                "realWorkersDisabled": sorted(WORKER_NAMES.values()),
                "untouchedServers": [1005, 1006],
                "playerDataWrites": 0,
                "mongoWrites": 0,
                "redisWrites": 0,
            }
            with sftp.open(f"{backup}/manifest.json", "wb") as manifest_file:
                manifest_file.write((json.dumps(manifest, indent=2) + "\n").encode())

        for sid in sorted(WORKER_NAMES, reverse=True):
            # Track before the command so a partial PM2 failure is still
            # eligible for best-effort rollback of the process environment.
            restarted_workers.append(WORKER_NAMES[sid])
            set_worker_disabled(ssh, WORKER_NAMES[sid])
        for sid in sorted(GAME_NAMES, reverse=True):
            restarted_games.append(GAME_NAMES[sid])
            set_game_virtual(ssh, GAME_NAMES[sid])
            code = False
            for _ in range(20):
                if ready(ssh, PORTS[sid]):
                    code = True
                    break
                time.sleep(2)
            if not code:
                raise RuntimeError(f"READY_FAILED:{GAME_NAMES[sid]}")
        run(ssh, "pm2 save")
        after_inventory = inventory(ssh)
        after_ready = require_readiness(ssh)
        changed = {row["name"]: row for row in after_inventory}
        for sid, name in GAME_NAMES.items():
            row = changed[name]
            if row["status"] != "online" or row["env"].get("BOT_COUNT_PER_MAP") not in (3, "3") or row["env"].get("BOT_MAX_TOTAL") not in (324, "324"):
                raise RuntimeError(f"GAME_READBACK_FAILED:{name}:{row}")
        for sid, name in WORKER_NAMES.items():
            row = changed[name]
            if row["status"] != "stopped" or row["env"].get("BOT_WORKER_ENABLED") not in (0, "0") or row["env"].get("BOT_WORKER_COUNT") not in (0, "0"):
                raise RuntimeError(f"WORKER_READBACK_FAILED:{name}:{row}")
        # S5/S6 must retain PID, restart counter, status, and allow-listed env;
        # this proves the script did not touch either the game or real-worker
        # process while changing S1-S4.
        assert_untouched(
            before_inventory,
            after_inventory,
            ("lhs-s1005", "lhs-s1006", "lhs-real-bots-s5", "lhs-real-bots-s6"),
        )
        after_health = require_bot_policy(ssh)
        result = {
            "release": "bot_policy_s1_s4_20260927",
            "backup": backup,
            "beforeReady": before_ready,
            "afterReady": after_ready,
            "beforeInventory": before_inventory,
            "afterInventory": after_inventory,
            "beforeHealth": before_health,
            "health": after_health,
            "playerDataWrites": 0,
            "mongoWrites": 0,
            "redisWrites": 0,
            "processesRestarted": restarted_workers + restarted_games,
            "s5s6Touched": False,
        }
        (local_evidence / "release.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"result": "PASS", "evidence": str(local_evidence / 'release.json'), "backup": backup}, ensure_ascii=False))
    except Exception:
        if swapped:
            try:
                with ssh.open_sftp() as sftp:
                    old = sftp.open(f"{backup}/ecosystem.config.js.before", "rb").read()
                    sftp.open(f"{stage}/ecosystem.config.js.rollback", "wb").write(old)
                    sftp.posix_rename(f"{stage}/ecosystem.config.js.rollback", REMOTE)
                rollback_runtime(ssh, restarted_workers, restarted_games)
            except Exception:
                pass
        raise
    finally:
        ssh.close()


if __name__ == "__main__":
    main()

