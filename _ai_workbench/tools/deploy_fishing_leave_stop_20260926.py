"""CAS rollout for the fishing-room leave/auto-stop fix.

Uploads only the fishing client addon/index and the two fishing server source
files.  It backs up the exact remote bytes, installs via same-filesystem
rename, reloads only lhs-s1001..lhs-s1006 one at a time, and rolls back on any
hash/readiness/contract failure.  No player, reward, database or nginx state
is touched.
"""
from __future__ import annotations

import hashlib
import json
import posixpath
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
ROOT = WB.parent
sys.path.insert(0, str(WB / "tools"))
from snapshot_web_multiserver_20260906 import connect, run  # noqa: E402


GAME = ROOT / "linhhoasu" / "webgame" / "game"
ADDON = GAME / "js" / "lhs-fishing-leave-stop-v1.js"
INDEX = GAME / "index.html"
FISH = ROOT / "linhhoasu" / "lhs" / "newServer" / "src" / "handlers" / "fish.js"
ROOM = ROOT / "linhhoasu" / "lhs" / "newServer" / "src" / "services" / "FishingRoomService.js"
TEST = WB / "tools" / "test_fishing_leave_stop_remote_contract_20260926.js"

REMOTE_INDEX = "/linhhoasu/webgame/game/index.html"
REMOTE_ADDON = "/linhhoasu/webgame/game/js/lhs-fishing-leave-stop-v1.js"
REMOTE_FISH = "/linhhoasu/lhs/newServer/src/handlers/fish.js"
REMOTE_ROOM = "/linhhoasu/lhs/newServer/src/services/FishingRoomService.js"

# Read-only preflight at 2026-09-26 confirmed these exact bytes.  If another
# operator changes any target before this run reaches the CAS check, abort.
EXPECTED_REMOTE = {
    REMOTE_INDEX: "386428820615f13fc9528ba855e3eb550bf277385fb61a6887416af4cd330e45",
    REMOTE_FISH: "8f888d2c330ef120dc09b1e549d8604e392b518690e234ffff32cc8f5a1a296c",
    REMOTE_ROOM: "01fdc148b1315eba4e8908decc2e6c1852dff2c88fbcac616451b9a263019760",
    REMOTE_ADDON: None,
}
VERSION = "20260926_fishing_leave_stop_v2"
NODES = [
    ("lhs-s1006", 8087),
    ("lhs-s1005", 8086),
    ("lhs-s1004", 8085),
    ("lhs-s1003", 8084),
    ("lhs-s1002", 8083),
    ("lhs-s1001", 8080),
]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def remote_sha(sftp, path: str):
    try:
        with sftp.open(path, "rb") as handle:
            return sha(handle.read())
    except FileNotFoundError:
        return None


def read_remote(sftp, path: str):
    try:
        with sftp.open(path, "rb") as handle:
            return handle.read()
    except FileNotFoundError:
        return None


def write_remote(sftp, path: str, data: bytes, mode: int = 0o644):
    with sftp.open(path, "wb") as handle:
        handle.write(data)
    sftp.chmod(path, mode)


def pm2_state(ssh):
    rows = json.loads(run(ssh, "pm2 jlist"))
    return {row["name"]: row for row in rows}


def summarize_nodes(rows):
    return {
        name: {
            "pid": rows[name].get("pid"),
            "status": rows[name].get("pm2_env", {}).get("status"),
            "restarts": rows[name].get("pm2_env", {}).get("restart_time"),
        }
        for name, _port in NODES
        if name in rows
    }


def ready(ssh, port: int) -> str:
    command = (
        "last=000; for i in $(seq 1 45); do "
        "last=$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "
        + shlex.quote(f"http://127.0.0.1:{port}/ready")
        + " || true); "
        "if [ \"$last\" = 200 ]; then echo 200; exit 0; fi; sleep 1; "
        "done; echo \"$last\"; exit 1"
    )
    return run(ssh, command).strip()


def patch_index(remote: bytes, local: bytes) -> bytes:
    anchor = b'\t\t"js/main.min_drop100.js?v=20260924_pet_result_guard_v2",'
    marker = b"lhs-fishing-leave-stop-v1.js"
    if remote.count(anchor) != 1:
        raise RuntimeError("INDEX_ANCHOR_COUNT")
    if remote.count(marker) != 0:
        raise RuntimeError("INDEX_ADDON_ALREADY_PRESENT")
    at = remote.index(anchor) + len(anchor)
    eol = b"\r\n" if remote[at:at + 2] == b"\r\n" else b"\n"
    line = b'\t\t"js/lhs-fishing-leave-stop-v1.js?v=' + VERSION.encode() + b'",'
    candidate = remote[:at] + eol + line + remote[at:]
    if candidate != local:
        raise RuntimeError("LOCAL_INDEX_NOT_REMOTE_PLUS_FISHING_ADDON")
    return candidate


def contract_source() -> bytes:
    return TEST.read_bytes()


def main():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/fishing_leave_stop_20260926_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/fishing_leave_stop_20260926_{stamp}"
    evidence_path = WB / "temp" / "fishing_leave_stop_20260926" / f"deploy_{stamp}.json"
    evidence_path.parent.mkdir(parents=True, exist_ok=True)

    addon = ADDON.read_bytes()
    local_index = INDEX.read_bytes()
    fish = FISH.read_bytes()
    room = ROOM.read_bytes()
    contract = contract_source()
    if VERSION.encode() not in addon:
        raise RuntimeError("LOCAL_ADDON_VERSION_MISSING")
    if VERSION.encode() not in local_index or local_index.count(b"lhs-fishing-leave-stop-v1.js") != 1:
        raise RuntimeError("LOCAL_INDEX_MARKER_INVALID")
    if b"FISH_ROOM_REQUIRED" not in fish or b"async function handleFishDealMulti" not in fish:
        raise RuntimeError("LOCAL_FISH_GUARD_MARKER_MISSING")
    if b"isMember(session)" not in room:
        raise RuntimeError("LOCAL_ROOM_MEMBERSHIP_MARKER_MISSING")

    evidence = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "PREPARING",
        "backup": backup,
        "stage": stage,
        "productionWrites": 0,
        "playerWrites": 0,
        "dbWrites": 0,
        "files": {},
        "restarts": [],
    }
    ssh = connect()
    installed = []
    restarted = []
    before_hashes = {}
    backup_paths = {}
    try:
        processes = pm2_state(ssh)
        for name, _port in NODES:
            if name not in processes or processes[name].get("pm2_env", {}).get("status") != "online":
                raise RuntimeError("GAME_NODE_NOT_READY_BEFORE_DEPLOY:" + name)
        before_ready = {str(port): ready(ssh, port) for _name, port in NODES}
        if any(value != "200" for value in before_ready.values()):
            raise RuntimeError("READY_NOT_200_BEFORE_DEPLOY:" + json.dumps(before_ready))
        evidence["beforeNodes"] = summarize_nodes(processes)
        evidence["beforeReady"] = before_ready

        with ssh.open_sftp() as sftp:
            remote_index = read_remote(sftp, REMOTE_INDEX)
            remote_addon = read_remote(sftp, REMOTE_ADDON)
            remote_fish = read_remote(sftp, REMOTE_FISH)
            remote_room = read_remote(sftp, REMOTE_ROOM)
            remote_data = {
                REMOTE_INDEX: remote_index,
                REMOTE_ADDON: remote_addon,
                REMOTE_FISH: remote_fish,
                REMOTE_ROOM: remote_room,
            }
            before_hashes = {path: sha(data) if data is not None else None for path, data in remote_data.items()}
            for path, expected in EXPECTED_REMOTE.items():
                if before_hashes[path] != expected:
                    raise RuntimeError("REMOTE_CAS_DRIFT:" + path + ":" + str(before_hashes[path]))
            patched_index = patch_index(remote_index, local_index)
            candidate_files = {
                REMOTE_INDEX: patched_index,
                REMOTE_ADDON: addon,
                REMOTE_FISH: fish,
                REMOTE_ROOM: room,
            }
            candidate_hashes = {path: sha(data) for path, data in candidate_files.items()}
            evidence["files"] = {
                path: {
                    "before": before_hashes[path],
                    "candidate": candidate_hashes[path],
                    "bytes": len(candidate_files[path]),
                }
                for path in candidate_files
            }

            run(ssh, "install -d -m 700 " + shlex.quote(backup))
            run(ssh, "install -d -m 700 " + shlex.quote(stage))
            for index, path in enumerate((REMOTE_INDEX, REMOTE_ADDON, REMOTE_FISH, REMOTE_ROOM), 1):
                safe = f"{index:02d}_{path.strip('/').replace('/', '__')}"
                if before_hashes[path] is None:
                    marker = backup + "/" + safe + ".absent"
                    run(ssh, "touch -- " + shlex.quote(marker))
                    backup_paths[path] = {"path": marker, "absent": True}
                else:
                    dest = backup + "/" + safe + ".before"
                    run(ssh, "cp -p -- " + shlex.quote(path) + " " + shlex.quote(dest))
                    if remote_sha(sftp, dest) != before_hashes[path]:
                        raise RuntimeError("BACKUP_HASH_MISMATCH:" + path)
                    backup_paths[path] = {"path": dest, "absent": False}

            stage_paths = {
                REMOTE_INDEX: stage + "/index.html",
                REMOTE_ADDON: stage + "/lhs-fishing-leave-stop-v1.js",
                REMOTE_FISH: stage + "/fish.js",
                REMOTE_ROOM: stage + "/FishingRoomService.js",
            }
            for path, data in candidate_files.items():
                write_remote(sftp, stage_paths[path], data)
                if remote_sha(sftp, stage_paths[path]) != candidate_hashes[path]:
                    raise RuntimeError("STAGE_HASH_MISMATCH:" + path)
            for path in (REMOTE_ADDON, REMOTE_FISH, REMOTE_ROOM):
                run(ssh, "node --check " + shlex.quote(stage_paths[path]))

            # Refresh CAS immediately before any live write.
            for path in candidate_files:
                if remote_sha(sftp, path) != before_hashes[path]:
                    raise RuntimeError("LIVE_CAS_DRIFT:" + path)

            for path in (REMOTE_INDEX, REMOTE_ADDON, REMOTE_FISH, REMOTE_ROOM):
                temp_target = path + ".fishing-leave-stop-" + stamp + ".next"
                run(ssh, "cp -p -- " + shlex.quote(stage_paths[path]) + " " + shlex.quote(temp_target))
                run(ssh, "mv -f -- " + shlex.quote(temp_target) + " " + shlex.quote(path))
                if remote_sha(sftp, path) != candidate_hashes[path]:
                    raise RuntimeError("INSTALL_HASH_MISMATCH:" + path)
                installed.append(path)

        evidence["status"] = "FILES_INSTALLED"

        for name, port in NODES:
            run(ssh, "pm2 restart " + shlex.quote(name) + " --update-env")
            restarted.append(name)
            health = ready(ssh, port)
            evidence.setdefault("rollingReady", {})[name] = health
            if health != "200":
                raise RuntimeError("READY_NOT_200_AFTER_RESTART:" + name + ":" + health)
        evidence["restarts"] = restarted[:]

        with ssh.open_sftp() as sftp:
            after_hashes = {path: remote_sha(sftp, path) for path in candidate_files}
        if after_hashes != candidate_hashes:
            raise RuntimeError("REMOTE_READBACK_HASH_MISMATCH")
        evidence["afterHashes"] = after_hashes

        served_index = run(ssh, "curl -fsS --max-time 15 http://127.0.0.1:81/index.html")
        served_addon = run(ssh, "curl -fsS --max-time 15 'http://127.0.0.1:81/js/lhs-fishing-leave-stop-v1.js?v=" + VERSION + "'")
        evidence["served"] = {
            "indexSha256": sha(served_index.encode("utf-8")),
            "addonSha256": sha(served_addon.encode("utf-8")),
            "indexCacheKey": VERSION in served_index,
            "addonVersion": VERSION in served_addon,
        }
        if sha(served_index.encode("utf-8")) != candidate_hashes[REMOTE_INDEX]:
            raise RuntimeError("SERVED_INDEX_HASH_MISMATCH")
        if sha(served_addon.encode("utf-8")) != candidate_hashes[REMOTE_ADDON]:
            raise RuntimeError("SERVED_ADDON_HASH_MISMATCH")
        if not evidence["served"]["indexCacheKey"] or not evidence["served"]["addonVersion"]:
            raise RuntimeError("SERVED_FISHING_MARKER_MISSING")

        remote_test = stage + "/test_fishing_leave_stop_20260926.js"
        with ssh.open_sftp() as sftp:
            write_remote(sftp, remote_test, contract)
        contract_output = run(ssh, "NODE_ENV=test node " + shlex.quote(remote_test))
        evidence["contract"] = contract_output.strip()
        if '"result":"PASS"' not in contract_output.replace(" ", ""):
            raise RuntimeError("REMOTE_FISHING_LEAVE_CONTRACT_FAILED")

        after_nodes = pm2_state(ssh)
        evidence["afterNodes"] = summarize_nodes(after_nodes)
        evidence["status"] = "DEPLOYED"
        evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({
            "result": "DEPLOYED",
            "backup": backup,
            "evidence": str(evidence_path),
            "restarts": restarted,
            "served": evidence["served"],
            "productionWrites": 0,
            "playerWrites": 0,
        }, ensure_ascii=False, indent=2))
    except Exception as error:
        evidence["error"] = str(error)
        evidence["status"] = "ROLLING_BACK" if installed else "ABORTED_BEFORE_INSTALL"
        if installed:
            try:
                with ssh.open_sftp() as sftp:
                    for path in reversed(installed):
                        current = remote_sha(sftp, path)
                        candidate = evidence.get("files", {}).get(path, {}).get("candidate")
                        before = before_hashes.get(path)
                        if current not in (candidate, before):
                            raise RuntimeError("ROLLBACK_DRIFT:" + path)
                        backup_row = backup_paths[path]
                        if backup_row["absent"]:
                            run(ssh, "rm -f -- " + shlex.quote(path))
                        else:
                            run(ssh, "cp -p -- " + shlex.quote(backup_row["path"]) + " " + shlex.quote(path))
                        if remote_sha(sftp, path) != before:
                            raise RuntimeError("ROLLBACK_HASH_MISMATCH:" + path)
                for name, port in NODES:
                    run(ssh, "pm2 restart " + shlex.quote(name) + " --update-env")
                    ready(ssh, port)
                evidence["status"] = "ROLLED_BACK"
            except Exception as rollback_error:
                evidence["rollbackError"] = str(rollback_error)
                evidence["status"] = "ROLLBACK_NEEDS_MANUAL_CHECK"
        evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        raise
    finally:
        try:
            run(ssh, "find " + shlex.quote(stage) + " -maxdepth 1 -type f -delete")
            run(ssh, "rmdir -- " + shlex.quote(stage))
        except Exception:
            pass
        ssh.close()


if __name__ == "__main__":
    main()
