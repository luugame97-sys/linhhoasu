"""CAS rollout for the read-only appearance preview release.

The VPS has a newer index than this checkout, so the deploy is intentionally
additive: upload only the new addon, insert one manifest entry after the
existing fashion addon, and replace only the tag3210 ownership block in the
remote mount handler.  No player, reward, database, nginx or unrelated PM2
process is touched.
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
ADDON = GAME / "js" / "lhs-appearance-preview-v1.js"
INDEX = GAME / "index.html"
MOUNT = ROOT / "linhhoasu" / "lhs" / "newServer" / "src" / "handlers" / "mount.js"

REMOTE_INDEX = "/linhhoasu/webgame/game/index.html"
REMOTE_ADDON = "/linhhoasu/webgame/game/js/lhs-appearance-preview-v1.js"
REMOTE_MOUNT = "/linhhoasu/lhs/newServer/src/handlers/mount.js"

EXPECTED_REMOTE_INDEX = "30067a6198f85ee0bcc16f4f89218ccd8e85b8abb0433ef96966a103a00452d3"
EXPECTED_REMOTE_MOUNT = "650706923e59bf0323a2816d00e220c5cd2cc1040e94c62f861379bfee088031"
VERSION = "20260926_appearance_preview_v1"
MOUNT_REASON = "MOUNT_SKIN_NOT_OWNED"

NODES = [
    ("lhs-s1001", 8080),
    ("lhs-s1002", 8083),
    ("lhs-s1003", 8084),
    ("lhs-s1004", 8085),
    ("lhs-s1005", 8086),
    ("lhs-s1006", 8087),
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
    parent = posixpath.dirname(path)
    # Parent directories are known, fixed release paths; create only the
    # scoped staging/backup trees through the remote command below.
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


def patch_index(remote: bytes) -> bytes:
    anchor = b'\t\t"js/lhs-fashion-box-v1.js?v=20260909_fashion_box_v3",'
    addon_marker = b"lhs-appearance-preview-v1.js"
    if remote.count(anchor) != 1:
        raise RuntimeError("INDEX_ANCHOR_COUNT")
    if remote.count(addon_marker) != 0 or VERSION.encode() in remote:
        raise RuntimeError("INDEX_ADDON_ALREADY_PRESENT")
    at = remote.index(anchor) + len(anchor)
    eol = b"\r\n" if remote[at:at + 2] == b"\r\n" else b"\n"
    line = b'\t\t"js/lhs-appearance-preview-v1.js?v=' + VERSION.encode() + b'",'
    return remote[:at] + eol + line + remote[at:]


def patch_mount(remote: bytes, local: bytes) -> bytes:
    tag = remote.index(b"async function handleMountEquipSkin")
    old = (
        b"  const info = ensureMountInfo(player);\n"
        b"  const skinId = toSafeInt(params && params.id, 0);\n"
        b"  info.skinId = skinId > 0 && isValidSwordId(skinId) ? skinId : 0;\n\r\n"
    )
    if remote.count(old) != 1:
        raise RuntimeError("MOUNT_OWNERSHIP_ANCHOR_COUNT")
    local_start = local.index(b"  const skinId = toSafeInt(params && params.id, 0);", local.index(b"async function handleMountEquipSkin"))
    local_end = local.index(b"  await playerService.savePlayer", local_start)
    replacement = local[local_start:local_end]
    if MOUNT_REASON.encode() not in replacement:
        raise RuntimeError("LOCAL_MOUNT_MARKER_MISSING")
    return remote.replace(old, replacement, 1)


def contract_source():
    # The local contract test uses relative requires.  This copy is executed
    # on the VPS with absolute paths and only stubs savePlayer in memory.
    source = (WB / "tools" / "test_mount_preview_ownership_20260926.js").read_text(encoding="utf-8")
    source = source.replace(
        "require('../../linhhoasu/lhs/newServer/src/handlers/mount')",
        "require('/linhhoasu/lhs/newServer/src/handlers/mount')",
    ).replace(
        "require('../../linhhoasu/lhs/newServer/src/services/PlayerService')",
        "require('/linhhoasu/lhs/newServer/src/services/PlayerService')",
    )
    return source.encode("utf-8")


def main():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/appearance_preview_20260926_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/appearance_preview_20260926_{stamp}"
    evidence_path = WB / "temp" / "appearance_preview_20260926" / f"deploy_{stamp}.json"
    evidence_path.parent.mkdir(parents=True, exist_ok=True)

    addon = ADDON.read_bytes()
    local_index = INDEX.read_bytes()
    local_mount = MOUNT.read_bytes()
    if VERSION.encode() not in addon:
        raise RuntimeError("LOCAL_ADDON_VERSION_MISSING")
    if MOUNT_REASON.encode() not in local_mount:
        raise RuntimeError("LOCAL_MOUNT_OWNERSHIP_MARKER_MISSING")
    contract = contract_source()

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
            remote_mount = read_remote(sftp, REMOTE_MOUNT)
            remote_addon = read_remote(sftp, REMOTE_ADDON)
            if remote_index is None or remote_mount is None:
                raise RuntimeError("REMOTE_REQUIRED_FILE_MISSING")
            before_hashes = {
                REMOTE_INDEX: sha(remote_index),
                REMOTE_MOUNT: sha(remote_mount),
                REMOTE_ADDON: sha(remote_addon) if remote_addon is not None else None,
            }
            index_is_partial_release = False
            if before_hashes[REMOTE_INDEX] == EXPECTED_REMOTE_INDEX:
                pass
            elif (
                before_hashes[REMOTE_INDEX] == sha(local_index)
                and remote_index == local_index
                and remote_index.count(b"lhs-appearance-preview-v1.js") == 1
                and VERSION.encode() in remote_index
            ):
                # A previous interrupted attempt inserted only the manifest
                # line.  Preserve the byte-identical index and finish the
                # missing addon/handler instead of overwriting it.
                index_is_partial_release = True
                evidence["preexistingPartialIndex"] = True
            else:
                raise RuntimeError("REMOTE_INDEX_CAS_DRIFT:" + before_hashes[REMOTE_INDEX])
            if before_hashes[REMOTE_MOUNT] != EXPECTED_REMOTE_MOUNT:
                raise RuntimeError("REMOTE_MOUNT_CAS_DRIFT:" + before_hashes[REMOTE_MOUNT])
            if remote_addon is not None:
                raise RuntimeError("REMOTE_ADDON_ALREADY_EXISTS")

            patched_index = remote_index if index_is_partial_release else patch_index(remote_index)
            patched_mount = patch_mount(remote_mount, local_mount)
            candidate_files = {
                REMOTE_INDEX: patched_index,
                REMOTE_MOUNT: patched_mount,
                REMOTE_ADDON: addon,
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
            # Keep a byte-identical backup plus an explicit absent marker for
            # the new addon so rollback cannot delete an unrelated file.
            for index, path in enumerate((REMOTE_INDEX, REMOTE_MOUNT, REMOTE_ADDON), 1):
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
                REMOTE_MOUNT: stage + "/mount.js",
                REMOTE_ADDON: stage + "/lhs-appearance-preview-v1.js",
            }
            for path, data in candidate_files.items():
                write_remote(sftp, stage_paths[path], data)
                if remote_sha(sftp, stage_paths[path]) != candidate_hashes[path]:
                    raise RuntimeError("STAGE_HASH_MISMATCH:" + path)
            run(ssh, "node --check " + shlex.quote(stage_paths[REMOTE_ADDON]))
            run(ssh, "node --check " + shlex.quote(stage_paths[REMOTE_MOUNT]))

            # Refresh CAS immediately before any live write.
            for path in (REMOTE_INDEX, REMOTE_MOUNT, REMOTE_ADDON):
                actual = remote_sha(sftp, path)
                if actual != before_hashes[path]:
                    raise RuntimeError("LIVE_CAS_DRIFT:" + path)

            # Install via same-filesystem temporary names and rename.  The
            # target directory is fixed; no broad copy or cleanup is used.
            install_paths = (REMOTE_MOUNT, REMOTE_ADDON) if index_is_partial_release else (REMOTE_INDEX, REMOTE_MOUNT, REMOTE_ADDON)
            for path in install_paths:
                temp_target = path + ".appearance-preview-" + stamp + ".next"
                run(ssh, "cp -p -- " + shlex.quote(stage_paths[path]) + " " + shlex.quote(temp_target))
                run(ssh, "mv -f -- " + shlex.quote(temp_target) + " " + shlex.quote(path))
                if remote_sha(sftp, path) != candidate_hashes[path]:
                    raise RuntimeError("INSTALL_HASH_MISMATCH:" + path)
                installed.append(path)

        evidence["status"] = "FILES_INSTALLED"

        # Mount handler needs a rolling process reload; the static addon does
        # not require a broad web/nginx restart.  Readiness is checked after
        # every individual game node.
        for name, port in NODES:
            run(ssh, "pm2 restart " + shlex.quote(name) + " --update-env")
            restarted.append(name)
            health = ready(ssh, port)
            evidence.setdefault("rollingReady", {})[name] = health
            if health != "200":
                raise RuntimeError("READY_NOT_200_AFTER_RESTART:" + name + ":" + health)
        evidence["restarts"] = restarted[:]

        with ssh.open_sftp() as sftp:
            after_hashes = {path: remote_sha(sftp, path) for path in (REMOTE_INDEX, REMOTE_MOUNT, REMOTE_ADDON)}
        if after_hashes != {path: evidence["files"][path]["candidate"] for path in after_hashes}:
            raise RuntimeError("REMOTE_READBACK_HASH_MISMATCH")
        evidence["afterHashes"] = after_hashes

        served_index = run(ssh, "curl -fsS --max-time 15 http://127.0.0.1:81/index.html")
        served_addon = run(ssh, "curl -fsS --max-time 15 'http://127.0.0.1:81/js/lhs-appearance-preview-v1.js?v=" + VERSION + "'")
        served_index_bytes = served_index.encode("utf-8")
        served_addon_bytes = served_addon.encode("utf-8")
        evidence["served"] = {
            "indexSha256": sha(served_index_bytes),
            "addonSha256": sha(served_addon_bytes),
            "indexCacheKey": VERSION in served_index,
            "addonVersion": VERSION in served_addon,
        }
        if sha(served_index_bytes) != evidence["files"][REMOTE_INDEX]["candidate"]:
            raise RuntimeError("SERVED_INDEX_HASH_MISMATCH")
        if sha(served_addon_bytes) != evidence["files"][REMOTE_ADDON]["candidate"]:
            raise RuntimeError("SERVED_ADDON_HASH_MISMATCH")
        if not evidence["served"]["indexCacheKey"] or not evidence["served"]["addonVersion"]:
            raise RuntimeError("SERVED_PREVIEW_MARKER_MISSING")

        # Execute the ownership contract against the deployed handler with a
        # stubbed save service.  No account, player or database is touched.
        remote_test = stage + "/test_mount_preview_ownership_20260926.js"
        with ssh.open_sftp() as sftp:
            write_remote(sftp, remote_test, contract)
        contract_output = run(ssh, "NODE_ENV=test node " + shlex.quote(remote_test))
        evidence["mountContract"] = contract_output.strip()
        if '"result":"PASS"' not in contract_output.replace(" ", ""):
            raise RuntimeError("REMOTE_MOUNT_CONTRACT_FAILED")

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
        # Keep backup/evidence; remove only known stage files and the empty
        # stage directory.  If rollback needs investigation, the stage remains
        # available when this cleanup itself fails.
        try:
            run(ssh, "find " + shlex.quote(stage) + " -maxdepth 1 -type f -delete")
            run(ssh, "rmdir -- " + shlex.quote(stage))
        except Exception:
            pass
        ssh.close()


if __name__ == "__main__":
    main()
