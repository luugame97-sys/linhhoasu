"""Deploy the guarded client power sync and additive BidKing payload field."""
from __future__ import annotations

import hashlib
import json
import shlex
import time
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / "linhhoasu" / "webgame" / "game"
LOCAL_POWER = GAME / "js" / "lhs-power-relogin-v1.js"
LOCAL_BIDKING = GAME / "js" / "lhs-bidking-compat-v1.js"
LOCAL_INDEX = GAME / "index.html"
LOCAL_SERVER = ROOT / "linhhoasu" / "lhs" / "newServer" / "src" / "handlers" / "bid-king.js"
EVIDENCE_DIR = ROOT / "_ai_workbench" / "temp" / "power_bidking_fix_20260921"
EVIDENCE = EVIDENCE_DIR / "release.json"
REMOTE_POWER = "/linhhoasu/webgame/game/js/lhs-power-relogin-v1.js"
REMOTE_BIDKING = "/linhhoasu/webgame/game/js/lhs-bidking-compat-v1.js"
REMOTE_INDEX = "/linhhoasu/webgame/game/index.html"
REMOTE_SERVER = "/linhhoasu/lhs/newServer/src/handlers/bid-king.js"
REMOTE_BACKUP = "/linhhoasu/_ai_workbench/backups/power_bidking_fix_20260921"
REMOTE_STAGE_ROOT = "/linhhoasu/_ai_workbench/temp/power_bidking_fix_20260921"
STATIC_KEY = "20260921_power_relogin_v3"
CLIENT_KEY = "20260921_bidking_compat_v1"
PORTS = [("lhs-s1002", 8083), ("lhs-s1001", 8080), ("lhs-s1003", 8084), ("lhs-s1004", 8085), ("lhs-s1005", 8086)]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_sftp(sftp, path: str) -> bytes:
    with sftp.open(path, "rb") as handle:
        return handle.read()


def write_sftp(sftp, path: str, data: bytes, attrs=None) -> None:
    with sftp.open(path, "wb") as handle:
        handle.write(data)
    if attrs is not None:
        sftp.chmod(path, attrs.st_mode & 0o777)
        try:
            sftp.chown(path, attrs.st_uid, attrs.st_gid)
        except OSError:
            pass


def wait_ready(ssh, port: int) -> str:
    command = (
        f"for i in $(seq 1 90); do c=$(curl -fsS -o /dev/null -w '%{{http_code}}' "
        f"--max-time 5 http://127.0.0.1:{port}/ready || true); "
        f"[ \"$c\" = 200 ] && echo 200 && exit 0; sleep 1; done; exit 1"
    )
    return run(ssh, command).strip()


def patch_server_bytes(data: bytes) -> bytes:
    text = data.decode("utf-8")
    nl = "\r\n" if "\r\n" in text else "\n"
    old_ensure = nl.join([
        "  info.illusRewardList = arr(info.illusRewardList).map((v) => int(v, 0)).filter((v) => v > 0);",
        "  info.bidKingReceipts = arr(info.bidKingReceipts).slice(-32);",
    ])
    new_ensure = nl.join([
        "  info.illusRewardList = arr(info.illusRewardList).map((v) => int(v, 0)).filter((v) => v > 0);",
        "  // Client BidKingModel.isCanGetIllusReward reads the claimed-character",
        "  // ledger separately from pending item reward IDs. Keep the field additive",
        "  // and never alias illusRewardList: the two arrays have different contracts.",
        "  info.characterReward = arr(info.characterReward).map((v) => int(v, 0)).filter((v) => v > 0);",
        "  info.bidKingReceipts = arr(info.bidKingReceipts).slice(-32);",
    ])
    old_payload = nl.join([
        "    characters: info.characters.slice(),",
        "    sets: JSON.parse(JSON.stringify(info.sets)),",
    ])
    new_payload = nl.join([
        "    characters: info.characters.slice(),",
        "    characterReward: info.characterReward.slice(),",
        "    sets: JSON.parse(JSON.stringify(info.sets)),",
    ])
    if text.count(old_ensure) != 1 or text.count(old_payload) != 1:
        raise RuntimeError(f"SERVER_PATCH_MARKER_COUNT ensure={text.count(old_ensure)} payload={text.count(old_payload)}")
    if "characterReward: info.characterReward.slice()" in text:
        raise RuntimeError("SERVER_ALREADY_PATCHED")
    text = text.replace(old_ensure, new_ensure, 1).replace(old_payload, new_payload, 1)
    return text.encode("utf-8")


def ensure_backup(sftp, ssh, backup_dir: str, before: dict[str, bytes], attrs: dict[str, object]) -> None:
    try:
        sftp.stat(backup_dir)
        exists = True
    except FileNotFoundError:
        exists = False
    if not exists:
        run(ssh, "install -d -m 700 " + shlex.quote(backup_dir))
    for remote, data in before.items():
        backup = backup_dir + "/" + Path(remote).name + ".before"
        try:
            old = read_sftp(sftp, backup)
        except FileNotFoundError:
            if exists:
                raise RuntimeError("BACKUP_MISSING:" + backup)
            write_sftp(sftp, backup, data, attrs.get(remote))
            sftp.chmod(backup, 0o600)
        else:
            if old != data:
                raise RuntimeError("BACKUP_DRIFT:" + backup)


def main() -> None:
    local_power = LOCAL_POWER.read_bytes()
    local_bidking = LOCAL_BIDKING.read_bytes()
    local_index = LOCAL_INDEX.read_bytes()
    local_server_candidate = LOCAL_SERVER.read_bytes()
    if b"20260921_power_relogin_v3" not in local_power:
        raise RuntimeError("LOCAL_POWER_V3_MISSING")
    if b"20260921_bidking_compat_v1" not in local_bidking:
        raise RuntimeError("LOCAL_BIDKING_COMPAT_MISSING")
    if STATIC_KEY.encode() not in local_index or CLIENT_KEY.encode() not in local_index:
        raise RuntimeError("LOCAL_INDEX_MARKER_MISSING")
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    ssh = connect()
    server_published = False
    touched_nodes: list[str] = []
    remote_server_before = None
    try:
        with ssh.open_sftp() as sftp:
            static_paths = {REMOTE_POWER: local_power, REMOTE_INDEX: local_index}
            static_before = {remote: read_sftp(sftp, remote) for remote in static_paths}
            static_attrs = {remote: sftp.stat(remote) for remote in static_paths}
            try:
                bidking_exists = read_sftp(sftp, REMOTE_BIDKING)
            except FileNotFoundError:
                bidking_exists = None
            if bidking_exists is not None and bidking_exists != local_bidking:
                raise RuntimeError("REMOTE_BIDKING_EXISTS_DIFFERENT")
            remote_index_text = static_before[REMOTE_INDEX].decode("utf-8")
            anchor_at = remote_index_text.index('\t\t"js/lhs-oldtrek-minigames-v1.js?v=20260921_v1",')
            anchor_end = anchor_at + len('\t\t"js/lhs-oldtrek-minigames-v1.js?v=20260921_v1",')
            index_nl = "\r\n" if remote_index_text.startswith("\r\n", anchor_end) else "\n"
            old_power_key = 'js/lhs-power-relogin-v1.js?v=20260921_power_relogin_v2'
            new_power_key = 'js/lhs-power-relogin-v1.js?v=20260921_power_relogin_v3'
            old_bidking_anchor = '\t\t"js/lhs-oldtrek-minigames-v1.js?v=20260921_v1",'
            new_bidking_line = old_bidking_anchor + index_nl + '\t\t"js/lhs-bidking-compat-v1.js?v=20260921_bidking_compat_v1",'
            if remote_index_text.count(old_power_key) != 1 or remote_index_text.count(new_power_key) != 0:
                raise RuntimeError("REMOTE_INDEX_POWER_KEY_MARKER_DRIFT")
            if remote_index_text.count(old_bidking_anchor) != 1 or CLIENT_KEY in remote_index_text:
                raise RuntimeError("REMOTE_INDEX_BIDKING_MARKER_DRIFT")
            candidate_index_remote = remote_index_text.replace(old_power_key, new_power_key, 1).replace(old_bidking_anchor, new_bidking_line, 1).encode("utf-8")
            if candidate_index_remote.replace(b"\r\n", b"\n") != local_index.replace(b"\r\n", b"\n"):
                raise RuntimeError("LOCAL_INDEX_CANDIDATE_DIFFERS_FROM_REMOTE_BASELINE")

            # Read server source and derive the candidate from the live byte
            # baseline, then require the local source to match that candidate.
            remote_server_before = read_sftp(sftp, REMOTE_SERVER)
            server_candidate = patch_server_bytes(remote_server_before)
            if server_candidate != local_server_candidate:
                raise RuntimeError("LOCAL_SERVER_CANDIDATE_DIFFERS_FROM_LIVE_BASELINE")
            server_attrs = sftp.stat(REMOTE_SERVER)
            before_all = {**static_before, REMOTE_SERVER: remote_server_before}
            attrs_all = {**static_attrs, REMOTE_SERVER: server_attrs}
            ensure_backup(sftp, ssh, REMOTE_BACKUP, before_all, attrs_all)

            # CAS all existing assets immediately before stage.
            for remote, data in static_before.items():
                if read_sftp(sftp, remote) != data:
                    raise RuntimeError("STATIC_CAS_DRIFT:" + remote)
            if read_sftp(sftp, REMOTE_SERVER) != remote_server_before:
                raise RuntimeError("SERVER_CAS_DRIFT")

            stage = REMOTE_STAGE_ROOT + "_" + str(int(time.time()))
            run(ssh, "install -d -m 700 " + shlex.quote(stage))
            stage_map = {
                REMOTE_POWER: stage + "/lhs-power-relogin-v1.js",
                REMOTE_INDEX: stage + "/index.html",
                REMOTE_BIDKING: stage + "/lhs-bidking-compat-v1.js",
                REMOTE_SERVER: stage + "/bid-king.js",
            }
            write_sftp(sftp, stage_map[REMOTE_POWER], local_power, static_attrs[REMOTE_POWER])
            write_sftp(sftp, stage_map[REMOTE_INDEX], candidate_index_remote, static_attrs[REMOTE_INDEX])
            write_sftp(sftp, stage_map[REMOTE_BIDKING], local_bidking, static_attrs[REMOTE_POWER])
            write_sftp(sftp, stage_map[REMOTE_SERVER], server_candidate, server_attrs)
            run(ssh, "node --check " + shlex.quote(stage_map[REMOTE_POWER]))
            run(ssh, "node --check " + shlex.quote(stage_map[REMOTE_BIDKING]))
            run(ssh, "node --check " + shlex.quote(stage_map[REMOTE_SERVER]))

            for remote in [REMOTE_POWER, REMOTE_INDEX, REMOTE_BIDKING]:
                sftp.posix_rename(stage_map[remote], remote)
            sftp.posix_rename(stage_map[REMOTE_SERVER], REMOTE_SERVER)
            server_published = True

        # Static served verification before any process restart.
        served_index = run(ssh, "curl -fsS http://127.0.0.1:81/index.html")
        if STATIC_KEY not in served_index or CLIENT_KEY not in served_index:
            raise RuntimeError("STATIC_INDEX_MARKER_FAILED")
        if run(ssh, "curl -fsS http://127.0.0.1:81/js/lhs-power-relogin-v1.js?v=" + STATIC_KEY).strip() != local_power.decode("utf-8").strip():
            raise RuntimeError("POWER_ADDON_SERVE_MISMATCH")
        if run(ssh, "curl -fsS http://127.0.0.1:81/js/lhs-bidking-compat-v1.js?v=" + CLIENT_KEY).strip() != local_bidking.decode("utf-8").strip():
            raise RuntimeError("BIDKING_ADDON_SERVE_MISMATCH")

        # Baseline readiness, then one affected PM2 node at a time.
        for _, port in PORTS:
            if run(ssh, f"curl -fsS -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip() != "200":
                raise RuntimeError(f"READY_NOT_200_BEFORE:{port}")
        for name, port in PORTS:
            run(ssh, "pm2 restart " + shlex.quote(name) + " --update-env")
            touched_nodes.append(name)
            if wait_ready(ssh, port) != "200":
                raise RuntimeError(f"READY_NOT_200_AFTER:{name}")

        readiness = {str(port): run(ssh, f"curl -fsS http://127.0.0.1:{port}/ready").strip() for _, port in PORTS}
        pm2 = run(ssh, "pm2 jlist | node -e " + shlex.quote("let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-s100[1-5]$/.test(p.name)).map(p=>({name:p.name,status:p.pm2_env.status,pid:p.pid,restarts:p.pm2_env.restart_time})))));"))
        release = {
            "result": "DEPLOYED_AND_READY",
            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "productionWrites": 0,
            "files": {
                "powerAddonSha256": sha(local_power),
                "bidkingAddonSha256": sha(local_bidking),
                "indexSha256": sha(local_index),
                "serverSha256": sha(server_candidate),
            },
            "remoteBackup": REMOTE_BACKUP,
            "staticCacheKeys": [STATIC_KEY, CLIENT_KEY],
            "restartOrder": touched_nodes,
            "readiness": readiness,
            "pm2": json.loads(pm2),
            "notes": "Static addons/index plus additive BidKing characterReward payload field; no reward settlement or player mutation.",
        }
        EVIDENCE.write_text(json.dumps(release, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(release, ensure_ascii=False, indent=2))
    except Exception:
        # Restore only the server source if it was published and a restart
        # gate failed. Static guards remain compatible with the old payload.
        if server_published and remote_server_before is not None:
            try:
                with ssh.open_sftp() as sftp:
                    restore = REMOTE_STAGE_ROOT + "_rollback_" + str(int(time.time()))
                    run(ssh, "install -d -m 700 " + shlex.quote(restore))
                    attrs = sftp.stat(REMOTE_SERVER)
                    restore_path = restore + "/bid-king.js"
                    write_sftp(sftp, restore_path, remote_server_before, attrs)
                    sftp.posix_rename(restore_path, REMOTE_SERVER)
                for name, port in PORTS:
                    if name in touched_nodes:
                        run(ssh, "pm2 restart " + shlex.quote(name) + " --update-env")
                        wait_ready(ssh, port)
            except Exception:
                pass
        raise
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
