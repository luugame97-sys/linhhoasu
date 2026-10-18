from __future__ import annotations

import datetime as dt
import json
import posixpath
import shlex
import sys
from pathlib import Path

import paramiko

from rollback_role_lian_manifest_20260930 import ssh_config

ROOT = Path(__file__).resolve().parents[2]
BACKUP_SOURCE = "/linhhoasu/_ai_workbench/backups/fashion_hidden_avatar_20261003_072601"
FILES = {
    "/linhhoasu/lhs/newServer/src/handlers/index.js": "linhhoasu/lhs/newServer/src/handlers/index.js",
    "/linhhoasu/lhs/newServer/src/db/models/Player.js": "linhhoasu/lhs/newServer/src/db/models/Player.js",
    "/linhhoasu/lhs/newServer/src/handlers/playerPayload.js": "linhhoasu/lhs/newServer/src/handlers/playerPayload.js",
    "/linhhoasu/lhs/newServer/src/handlers/basic.js": "linhhoasu/lhs/newServer/src/handlers/basic.js",
    "/linhhoasu/webgame/game/index.html": "linhhoasu/webgame/game/index.html",
}
NEW_FILES = (
    "/linhhoasu/lhs/newServer/src/services/AvatarUploadService.js",
    "/linhhoasu/lhs/newServer/src/handlers/avatar.js",
    "/linhhoasu/webgame/game/js/lhs-avatar-upload-v1.js",
    "/linhhoasu/webgame/game/js/lhs-fashion-hidden-preview-v1.js",
)
EXPECTED_CURRENT = {
    "/linhhoasu/lhs/newServer/src/handlers/index.js": "ab73f6ae2c53c5d57ace937aae0460573128daadfd0d98e2692b8a79862b165f",
    "/linhhoasu/lhs/newServer/src/db/models/Player.js": "4aa98909a5cc58355bdaf0ffdf3aad93361baf744eb22198932f6c64ffa0e57d",
    "/linhhoasu/lhs/newServer/src/handlers/playerPayload.js": "0380992eb762251dde67d8898ac01a89457ffb8e496787d5ea7f475d8e745332",
    "/linhhoasu/lhs/newServer/src/handlers/basic.js": "73a59dca0d905b5700fba2aed9fdeed9e874de59fe63435cda3c1955723417ea",
    "/linhhoasu/webgame/game/index.html": "4da526e7f1d1a911342df656e7d5003c1cd20f85c97de02d78c29ca5e0e8200f",
    "/linhhoasu/lhs/newServer/src/services/AvatarUploadService.js": "50706d67ddac0b859aeaf93a37ae8c2c94b96865e76bfa6b7bd4afde519e333c",
    "/linhhoasu/lhs/newServer/src/handlers/avatar.js": "c6098b7159b1f5490d351c38dea0e7f1082e333198f9996d00fe84e16d9195cc",
    "/linhhoasu/webgame/game/js/lhs-avatar-upload-v1.js": "f8d6d20ef05637cb4b0e853d425c4f8aeaf2e98d4bc5e1c295ca44e2d1417112",
    "/linhhoasu/webgame/game/js/lhs-fashion-hidden-preview-v1.js": None,
}
PORTS = {"lhs-s1001": 8080, "lhs-s1002": 8083, "lhs-s1003": 8084, "lhs-s1004": 8085, "lhs-s1005": 8086, "lhs-s1006": 8087}
SERVERS = tuple(reversed(tuple(PORTS)))


def q(value: str) -> str:
    return shlex.quote(value)


def main() -> None:
    args, kwargs = ssh_config()
    if args[0] != "103.116.104.165":
        raise RuntimeError("SSH_HOST_MISMATCH")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()
    stamp = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/avatar_custom_rollback_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/avatar_custom_rollback_{stamp}"
    receipt = {"at": dt.datetime.now(dt.timezone.utc).isoformat(), "host": args[0], "backupDir": backup, "processRestarts": True, "directPlayerWrites": 0, "remotePlayerWrites": 0, "result": "STARTED", "files": {}, "restarts": []}
    swapped = []

    def run(command: str, timeout: int = 60) -> str:
        _stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError(f"COMMAND_FAILED:{code}:{err[-1000:] or out[-1000:]}")
        return out

    def sha(path: str) -> str | None:
        try:
            with sftp.open(path, "rb") as handle:
                import hashlib
                return hashlib.sha256(handle.read()).hexdigest()
        except IOError:
            return None

    def ready(port: int) -> dict:
        import time
        last = ""
        for _ in range(90):
            try:
                raw = run(f"curl -fsS --max-time 5 http://127.0.0.1:{port}/ready", 15)
                data = json.loads(raw)
                if data.get("status") == "ok" and data.get("checks", {}).get("mongo") and data.get("checks", {}).get("redis"):
                    return data
                last = raw[-300:]
            except Exception as error:
                last = str(error)[-300:]
            time.sleep(1)
        raise RuntimeError(f"READY_TIMEOUT:{port}:{last}")

    try:
        current = {path: sha(path) for path in list(FILES) + list(NEW_FILES)}
        for path, expected in EXPECTED_CURRENT.items():
            if current.get(path) != expected:
                raise RuntimeError(f"CAS_DRIFT:{path}:{current.get(path)}:{expected}")
        for path in NEW_FILES:
            if current.get(path) != EXPECTED_CURRENT[path]:
                raise RuntimeError(f"NEW_FILE_DRIFT:{path}")

        run(f"install -d -m 700 -- {q(backup)} {q(stage)}")
        # Back up exact current bytes, including files about to be removed.
        for path in list(FILES) + list(NEW_FILES):
            if current[path] is None:
                receipt["files"][path] = {"before": None}
                continue
            target = posixpath.join(backup, path.lstrip("/"))
            run(f"mkdir -p -- {q(posixpath.dirname(target))}")
            run(f"cp -p -- {q(path)} {q(target)}")
            receipt["files"][path] = {"before": current[path]}
            if sha(target) != current[path]:
                raise RuntimeError(f"BACKUP_HASH:{path}")

        # Stage exact preimage files from the first deployment backup.
        stages = {}
        for remote, relative in FILES.items():
            source = posixpath.join(BACKUP_SOURCE, relative)
            staged = posixpath.join(stage, remote.lstrip("/"))
            run(f"mkdir -p -- {q(posixpath.dirname(staged))}")
            run(f"cp -p -- {q(source)} {q(staged)}")
            stages[remote] = staged
            receipt["files"][remote]["after"] = sha(staged)

        # CAS once more before mutation.
        for path, expected in EXPECTED_CURRENT.items():
            if sha(path) != expected:
                raise RuntimeError(f"CAS_BEFORE_SWAP:{path}")

        for remote, staged in stages.items():
            run(f"mv -f -- {q(staged)} {q(remote)}")
            swapped.append(remote)
            if sha(remote) != receipt["files"][remote]["after"]:
                raise RuntimeError(f"RESTORE_HASH:{remote}")
        for path in NEW_FILES:
            run(f"rm -f -- {q(path)}")
            swapped.append(path)
            if sha(path) is not None:
                raise RuntimeError(f"REMOVE_FAILED:{path}")
            receipt["files"][path]["after"] = None

        # Restart only after all source files are restored.
        for name in SERVERS:
            run(f"pm2 restart {q(name)} --update-env >/dev/null", 120)
            data = ready(PORTS[name])
            receipt["restarts"].append({"name": name, "ready": data})
        for name, port in PORTS.items():
            receipt.setdefault("postReady", {})[name] = ready(port)

        index = run("curl --compressed -fsS --max-time 20 'http://127.0.0.1:81/index.html?v=20261003_avatar_rollback'")
        if "lhs-avatar-upload-v1.js" in index or "lhs-fashion-hidden-preview-v1.js" in index or "20261003_avatar_upload" in index:
            raise RuntimeError("CUSTOM_INDEX_MARKER_REMAINS")
        receipt["served"] = {"indexNoCustomMarkers": True, "avatarAddonHttp": run("curl -sS --max-time 15 -o /dev/null -w '%{http_code}' 'http://127.0.0.1:81/js/lhs-avatar-upload-v1.js?v=rollback'").strip(), "previewAddonHttp": run("curl -sS --max-time 15 -o /dev/null -w '%{http_code}' 'http://127.0.0.1:81/js/lhs-fashion-hidden-preview-v1.js?v=rollback'").strip()}
        receipt["result"] = "ROLLED_BACK_VERIFIED"
        receipt["completedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
    except Exception as error:
        receipt["result"] = "FAILED"
        receipt["error"] = str(error)
        # Recovery is deliberately conservative: restore only paths swapped by this run.
        for path in reversed(swapped):
            try:
                source = posixpath.join(backup, path.lstrip("/"))
                if path in FILES:
                    run(f"cp -p -- {q(source)} {q(path)}")
                elif path in NEW_FILES:
                    run(f"cp -p -- {q(source)} {q(path)}")
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
            run(f"rm -rf -- {q(stage)}")
        except Exception:
            pass
        output = ROOT / "_ai_workbench/temp/avatar_custom_rollback_20261003"
        output.mkdir(parents=True, exist_ok=True)
        (output / "rollback.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        sftp.close()
        client.close()
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
