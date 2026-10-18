"""Scoped production rollout for hidden-fashion preview and personal avatars.

The script patches existing live source bytes instead of replacing whole files,
so unrelated production changes are preserved. It uses the pinned SSH config
already used by the VPS-104.165 rollout tools; credentials are never printed.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import posixpath
import re
import shlex
import sys
from pathlib import Path

import paramiko

from rollback_role_lian_manifest_20260930 import ssh_config


ROOT = Path(__file__).resolve().parents[2]
REMOTE_ROOT = "/linhhoasu"
LOCAL = {
    "AvatarUploadService.js": ROOT / "linhhoasu/lhs/newServer/src/services/AvatarUploadService.js",
    "avatar.js": ROOT / "linhhoasu/lhs/newServer/src/handlers/avatar.js",
    "fashion-hidden-preview.js": ROOT / "linhhoasu/webgame/game/js/lhs-fashion-hidden-preview-v1.js",
    "avatar-upload.js": ROOT / "linhhoasu/webgame/game/js/lhs-avatar-upload-v1.js",
}
REMOTE_NEW = {
    "/linhhoasu/lhs/newServer/src/services/AvatarUploadService.js": LOCAL["AvatarUploadService.js"],
    "/linhhoasu/lhs/newServer/src/handlers/avatar.js": LOCAL["avatar.js"],
    "/linhhoasu/webgame/game/js/lhs-fashion-hidden-preview-v1.js": LOCAL["fashion-hidden-preview.js"],
    "/linhhoasu/webgame/game/js/lhs-avatar-upload-v1.js": LOCAL["avatar-upload.js"],
}
REMOTE_EXISTING = {
    "/linhhoasu/lhs/newServer/src/handlers/index.js",
    "/linhhoasu/lhs/newServer/src/db/models/Player.js",
    "/linhhoasu/lhs/newServer/src/handlers/playerPayload.js",
    "/linhhoasu/lhs/newServer/src/handlers/basic.js",
    "/linhhoasu/webgame/game/index.html",
}
PORTS = {
    "lhs-s1001": 8080,
    "lhs-s1002": 8083,
    "lhs-s1003": 8084,
    "lhs-s1004": 8085,
    "lhs-s1005": 8086,
    "lhs-s1006": 8087,
}
SERVERS = tuple(reversed(tuple(PORTS)))
TOKEN = "20261003_fashion_hidden_avatar_v1"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def q(value: str) -> str:
    return shlex.quote(value)


def patch_text(remote: str, raw: bytes) -> bytes:
    text = raw.decode("utf-8")
    nl = "\r\n" if "\r\n" in text else "\n"

    def insert_once(value: str, anchor: str, addition: str) -> str:
        if addition.strip() in value:
            return value
        if anchor not in value:
            raise RuntimeError(f"PATCH_ANCHOR_MISSING:{remote}:{anchor}")
        return value.replace(anchor, anchor + addition, 1)

    if remote.endswith("/handlers/index.js"):
        text = insert_once(text, "const fashion = require('./fashion');", nl + "const avatar = require('./avatar');")
        text = insert_once(text, "router.register(1806, fashion.handleFashionRenameSet);", nl + "  router.register(1807, avatar.handleUploadAvatar);")
    elif remote.endswith("/db/models/Player.js"):
        text = insert_once(text, "    avatar: { type: Number, default: 11305 },", nl + "    avatarUrl: { type: String, default: '' }," + nl + "    avatarUploadAt: { type: Number, default: 0 },")
    elif remote.endswith("/handlers/playerPayload.js"):
        text = insert_once(text, "    avatar: player.avatar || 0,", nl + "    avatarUrl: String(player.avatarUrl || ''),")
    elif remote.endswith("/handlers/basic.js"):
        text = insert_once(text, "    equipMap: buildEquippedIdMap(player),", nl + "    avatarUrl: String(player.avatarUrl || ''),")
    elif remote.endswith("/game/index.html"):
        hidden = '"js/lhs-fashion-hidden-preview-v1.js?v=20261003_fashion_hidden_preview_v1",'
        upload = '"js/lhs-avatar-upload-v1.js?v=20261003_avatar_upload_v1",'
        if hidden not in text:
            pattern = r'(?m)^([ \t]*"js/lhs-fashion-day1-v1\.js[^"]*",?)[ \t]*$'
            match = re.search(pattern, text)
            if not match:
                raise RuntimeError(f"PATCH_ANCHOR_MISSING:{remote}:fashion-day1")
            text = text[: match.end()] + nl + "\t\t" + hidden + text[match.end() :]
        if upload not in text:
            anchor = '"js/lhs-fashion-box-v1.js?v=20260927_fashion_box_v4",'
            if anchor not in text:
                raise RuntimeError(f"PATCH_ANCHOR_MISSING:{remote}:fashion-box")
            text = text.replace(anchor, anchor + nl + "\t\t" + upload, 1)
    return text.encode("utf-8")


def node_check_needed(path: str) -> bool:
    return path.endswith(".js")


def wait_ready(run, port: int, attempts: int = 90) -> dict:
    """Wait up to 90 seconds for one node; restart can be slow under S6 load."""
    import time

    last = ""
    for _ in range(attempts):
        try:
            raw = run(f"curl -fsS --max-time 5 http://127.0.0.1:{port}/ready", 15)
            parsed = json.loads(raw)
            if parsed.get("status") == "ok" and parsed.get("checks", {}).get("mongo") and parsed.get("checks", {}).get("redis"):
                return parsed
            last = raw[-300:]
        except Exception as error:
            last = str(error)[-300:]
        time.sleep(1)
    raise RuntimeError(f"READY_TIMEOUT:{port}:{last}")


def main() -> None:
    args, kwargs = ssh_config()
    if args[0] != "103.116.104.165":
        raise RuntimeError("SSH_HOST_MISMATCH")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()
    stamp = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/fashion_hidden_avatar_{stamp}"
    stage_root = f"/linhhoasu/_ai_workbench/temp/fashion_hidden_avatar_stage_{stamp}"
    receipt = {
        "at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "host": args[0],
        "backupDir": backup,
        "stageDir": stage_root,
        "directPlayerWrites": 0,
        "remotePlayerWrites": 0,
        "pm2Restart": True,
        "result": "STARTED",
        "files": {},
        "restarts": [],
    }
    swapped: list[str] = []
    existing_before: dict[str, bytes] = {}
    target_bytes: dict[str, bytes] = {}

    def run(command: str, timeout: int = 60) -> str:
        _stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError(f"COMMAND_FAILED:{code}:{err[-1200:] or out[-1200:]}")
        return out

    def read_remote(path: str) -> bytes:
        with sftp.open(path, "rb") as handle:
            return handle.read()

    def remote_sha(path: str) -> str:
        return sha(read_remote(path))

    def ready_snapshot() -> dict:
        result = {}
        for name, port in PORTS.items():
            raw = run(f"curl -fsS --max-time 12 http://127.0.0.1:{port}/ready", 30)
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError as error:
                raise RuntimeError(f"READY_NOT_JSON:{name}") from error
            if parsed.get("status") != "ok" or not parsed.get("checks", {}).get("mongo") or not parsed.get("checks", {}).get("redis"):
                raise RuntimeError(f"READY_FAILED:{name}")
            result[name] = parsed
        return result

    def pm2_snapshot() -> dict:
        rows = json.loads(run("pm2 jlist", 30))
        wanted = {}
        for row in rows:
            name = row.get("name")
            if name in PORTS:
                env = row.get("pm2_env") or {}
                wanted[name] = {
                    "name": name,
                    "pid": row.get("pid"),
                    "restart_time": env.get("restart_time"),
                    "status": env.get("status"),
                    "pm_id": row.get("pm_id"),
                }
        if set(wanted) != set(PORTS):
            raise RuntimeError("PM2_GAME_FLEET_INCOMPLETE")
        return wanted

    def backup_file(remote: str) -> None:
        relative = remote.lstrip("/")
        destination = posixpath.join(backup, relative)
        run(f"mkdir -p -- {q(posixpath.dirname(destination))}")
        run(f"cp -p -- {q(remote)} {q(destination)}")
        if remote_sha(destination) != sha(existing_before[remote]):
            raise RuntimeError(f"BACKUP_HASH:{remote}")

    def stage_write(remote: str, data: bytes, mode: int) -> str:
        relative = remote.lstrip("/")
        staged = posixpath.join(stage_root, relative)
        run(f"mkdir -p -- {q(posixpath.dirname(staged))}")
        with sftp.open(staged, "wb") as handle:
            handle.write(data)
        sftp.chmod(staged, mode)
        if remote_sha(staged) != sha(data):
            raise RuntimeError(f"STAGE_HASH:{remote}")
        if node_check_needed(remote):
            run(f"node --check {q(staged)}", 30)
        return staged

    try:
        receipt["preReady"] = ready_snapshot()
        receipt["preProcesses"] = pm2_snapshot()

        # Read current live bytes and create an exact candidate from them.
        for remote in sorted(REMOTE_EXISTING):
            existing_before[remote] = read_remote(remote)
            target_bytes[remote] = patch_text(remote, existing_before[remote])
        for remote, local in REMOTE_NEW.items():
            data = local.read_bytes()
            try:
                current = read_remote(remote)
            except IOError:
                current = None
            if current is not None and current != data:
                raise RuntimeError(f"NEW_TARGET_EXISTS:{remote}")
            if current is not None:
                existing_before[remote] = current
            target_bytes[remote] = data

        receipt["files"] = {
            remote: {
                "before": sha(existing_before[remote]) if remote in existing_before else None,
                "after": sha(data),
                "existed": remote in existing_before,
            }
            for remote, data in target_bytes.items()
        }

        # Avatar directory is private to the service but public-readable files
        # are mode 640 and group-owned by the web server.
        run("install -d -o root -g www -m 750 /linhhoasu/webgame/game/uploads/avatars")
        run(f"mkdir -m 700 -- {q(backup)}")
        for remote in sorted(existing_before):
            backup_file(remote)

        stages: dict[str, str] = {}
        for remote, data in target_bytes.items():
            mode = 0o644 if remote.endswith(".html") or "/webgame/" in remote else 0o640
            stages[remote] = stage_write(remote, data, mode)

        # CAS immediately before every swap. New files must still be absent;
        # existing files must be unchanged since the preflight read.
        for remote in target_bytes:
            if remote in existing_before:
                if remote_sha(remote) != sha(existing_before[remote]):
                    raise RuntimeError(f"CAS_BEFORE_SWAP:{remote}")
            else:
                try:
                    read_remote(remote)
                except IOError:
                    pass
                else:
                    raise RuntimeError(f"CAS_NEW_TARGET_APPEARED:{remote}")

        # Static assets first; source remains old until all new files are staged.
        for remote in sorted(target_bytes):
            sftp.posix_rename(stages[remote], remote)
            swapped.append(remote)
            if remote_sha(remote) != sha(target_bytes[remote]):
                raise RuntimeError(f"POST_SWAP_HASH:{remote}")

        # Reload each game process one at a time and wait for Mongo/Redis ready.
        for name in SERVERS:
            run(f"pm2 restart {q(name)} --update-env >/dev/null", 120)
            port = PORTS[name]
            parsed = wait_ready(run, port)
            receipt["restarts"].append({"name": name, "ready": parsed})

        receipt["postReady"] = ready_snapshot()
        receipt["postProcesses"] = pm2_snapshot()
        receipt["served"] = {}
        for label, base in (("loopback", "http://127.0.0.1:81"), ("public", "https://linhhoasu.lol")):
            index = run(f"curl --compressed -fsS --max-time 25 {q(base + '/index.html?v=' + TOKEN)}", 40)
            if "20261003_fashion_hidden_preview_v1" not in index or "20261003_avatar_upload_v1" not in index:
                raise RuntimeError(f"INDEX_MARKER_MISSING:{label}")
            served = {}
            for remote in ("/linhhoasu/webgame/game/js/lhs-fashion-hidden-preview-v1.js", "/linhhoasu/webgame/game/js/lhs-avatar-upload-v1.js"):
                rel = remote.removeprefix("/linhhoasu/webgame/game")
                data = run(f"curl --compressed -fsS --max-time 25 {q(base + rel + '?v=' + TOKEN)}", 40).encode("utf-8")
                # curl output is binary-safe in the actual remote command only
                # for these UTF-8 JS assets; compare exact text hash after decode.
                served_hash = sha(data)
                expected_hash = sha(target_bytes[remote])
                if served_hash != expected_hash:
                    raise RuntimeError(f"SERVED_ASSET_HASH:{label}:{rel}:{served_hash}:{expected_hash}")
                served[rel] = served_hash
            receipt["served"][label] = {"indexMarkers": True, "assets": served}
        receipt["result"] = "DEPLOYED_VERIFIED"
        receipt["completedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
    except Exception as error:
        receipt["result"] = "FAILED"
        receipt["error"] = str(error)
        # Restore every swapped file from its exact backup. New files are removed.
        for remote in reversed(swapped):
            try:
                if remote in existing_before:
                    backup_path = posixpath.join(backup, remote.lstrip("/"))
                    restore_stage = remote + f".rollback_{stamp}"
                    run(f"cp -p -- {q(backup_path)} {q(restore_stage)}", 30)
                    run(f"mv -f -- {q(restore_stage)} {q(remote)}", 30)
                else:
                    run(f"rm -f -- {q(remote)}", 30)
            except Exception:
                pass
        for name in SERVERS:
            try:
                run(f"pm2 restart {q(name)} --update-env >/dev/null", 120)
            except Exception:
                pass
        raise
    finally:
        try:
            run(f"rm -rf -- {q(stage_root)}", 30)
        except Exception:
            pass
        out = ROOT / "_ai_workbench/temp/fashion_hidden_avatar_20261003"
        out.mkdir(parents=True, exist_ok=True)
        (out / "deployment.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        try:
            sftp.close()
            client.close()
        except Exception:
            pass
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
