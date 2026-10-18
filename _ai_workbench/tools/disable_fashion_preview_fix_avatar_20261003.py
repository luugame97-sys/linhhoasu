from __future__ import annotations

import datetime as dt
import hashlib
import json
import posixpath
import shlex
import sys
from pathlib import Path

import paramiko

from rollback_role_lian_manifest_20260930 import ssh_config

ROOT = Path(__file__).resolve().parents[2]
INDEX = "/linhhoasu/webgame/game/index.html"
PREVIEW = "/linhhoasu/webgame/game/js/lhs-fashion-hidden-preview-v1.js"
AVATAR = "/linhhoasu/webgame/game/js/lhs-avatar-upload-v1.js"
EXPECTED_INDEX = "b2f769aa6aafcb4ed3437d8501158ea5d7cfa901b70cfd76fded4e4b3b182ece"
EXPECTED_PREVIEW = "3e24ab9fcb79659cc74af343c6368abd49dc1127b74f83ad8fd9f4ad1d8433cf"
EXPECTED_AVATAR = "a765c3280fd73b2a715882da44f2c0f0c60ed3503615b2bf83c560da35648695"
LOCAL_AVATAR = ROOT / "linhhoasu/webgame/game/js/lhs-avatar-upload-v1.js"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


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
    backup = f"/linhhoasu/_ai_workbench/backups/fashion_preview_disabled_avatar_v2_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/fashion_preview_disabled_avatar_v2_{stamp}"
    output = ROOT / "_ai_workbench/temp/fashion_preview_disabled_avatar_20261003"
    output.mkdir(parents=True, exist_ok=True)
    receipt = {
        "at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "host": args[0],
        "backupDir": backup,
        "directPlayerWrites": 0,
        "remotePlayerWrites": 0,
        "processRestarts": 0,
        "result": "STARTED",
    }

    def run(command: str, timeout: int = 60) -> str:
        _stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError(f"COMMAND_FAILED:{code}:{err[-1000:] or out[-1000:]}")
        return out

    def read(path: str) -> bytes:
        with sftp.open(path, "rb") as handle:
            return handle.read()

    def rsha(path: str) -> str | None:
        try:
            return sha(read(path))
        except IOError:
            return None

    swapped = []
    try:
        index0 = read(INDEX)
        preview0 = read(PREVIEW)
        avatar0 = read(AVATAR)
        before = {INDEX: sha(index0), PREVIEW: sha(preview0), AVATAR: sha(avatar0)}
        expected = {INDEX: EXPECTED_INDEX, PREVIEW: EXPECTED_PREVIEW, AVATAR: EXPECTED_AVATAR}
        if before != expected:
            raise RuntimeError("LIVE_BASELINE_DRIFT:" + json.dumps(before, sort_keys=True))

        marker = b'\t\t"js/lhs-fashion-hidden-preview-v1.js?v=20261003_fashion_hidden_preview_v1",\r\n'
        if marker not in index0:
            marker = b'\t\t"js/lhs-fashion-hidden-preview-v1.js?v=20261003_fashion_hidden_preview_v1",\n'
        if index0.count(marker) != 1:
            raise RuntimeError("PREVIEW_MARKER_NOT_UNIQUE")
        avatar_old = b'20261003_avatar_upload_v1'
        if index0.count(avatar_old) != 1:
            raise RuntimeError("AVATAR_V1_MARKER_NOT_UNIQUE")
        index1 = index0.replace(marker, b"", 1).replace(avatar_old, b"20261003_avatar_upload_v2", 1)
        avatar1 = LOCAL_AVATAR.read_bytes()
        after = {INDEX: sha(index1), AVATAR: sha(avatar1), PREVIEW: None}

        run(f"install -d -m 700 -- {q(backup)} {q(stage)}")
        for path, data in ((INDEX, index0), (PREVIEW, preview0), (AVATAR, avatar0)):
            bp = posixpath.join(backup, posixpath.basename(path) + ".before")
            run(f"cp -p -- {q(path)} {q(bp)}")
            if rsha(bp) != sha(data):
                raise RuntimeError("BACKUP_HASH:" + path)

        index_stage = posixpath.join(stage, "index.html")
        avatar_stage = posixpath.join(stage, "lhs-avatar-upload-v1.js")
        with sftp.open(index_stage, "wb") as handle:
            handle.write(index1)
        with sftp.open(avatar_stage, "wb") as handle:
            handle.write(avatar1)
        sftp.chmod(index_stage, 0o644)
        sftp.chmod(avatar_stage, 0o644)
        if rsha(index_stage) != after[INDEX] or rsha(avatar_stage) != after[AVATAR]:
            raise RuntimeError("STAGE_HASH")
        run(f"node --check {q(avatar_stage)}", 30)

        if {INDEX: rsha(INDEX), PREVIEW: rsha(PREVIEW), AVATAR: rsha(AVATAR)} != before:
            raise RuntimeError("LIVE_CAS_DRIFT")
        index_tmp = INDEX + ".preview-disabled-" + stamp + ".next"
        avatar_tmp = AVATAR + ".avatar-v2-" + stamp + ".next"
        run(f"cp -p -- {q(index_stage)} {q(index_tmp)} && mv -f -- {q(index_tmp)} {q(INDEX)}")
        swapped.append(INDEX)
        run(f"cp -p -- {q(avatar_stage)} {q(avatar_tmp)} && mv -f -- {q(avatar_tmp)} {q(AVATAR)}")
        swapped.append(AVATAR)
        run(f"rm -f -- {q(PREVIEW)}")
        swapped.append(PREVIEW)
        if rsha(INDEX) != after[INDEX] or rsha(AVATAR) != after[AVATAR] or rsha(PREVIEW) is not None:
            raise RuntimeError("POST_SWAP_HASH")

        index_loop = run("curl --compressed -fsS --max-time 20 'http://127.0.0.1:81/index.html?v=20261003_avatar_v2'")
        avatar_loop = run("curl --compressed -fsS --max-time 20 'http://127.0.0.1:81/js/lhs-avatar-upload-v1.js?v=20261003_avatar_v2'")
        preview_http = run("curl -sS --max-time 20 -o /dev/null -w '%{http_code}' 'http://127.0.0.1:81/js/lhs-fashion-hidden-preview-v1.js?v=20261003_disabled'").strip()
        index_public = run("curl --compressed -fsS --max-time 20 'https://linhhoasu.lol/index.html?v=20261003_avatar_v2'")
        avatar_public = run("curl --compressed -fsS --max-time 20 'https://linhhoasu.lol/js/lhs-avatar-upload-v1.js?v=20261003_avatar_v2'")
        preview_public = run("curl -sS --max-time 20 -o /dev/null -w '%{http_code}' 'https://linhhoasu.lol/js/lhs-fashion-hidden-preview-v1.js?v=20261003_disabled'").strip()
        served = {
            "loopback": {"index": sha(index_loop.encode()), "avatar": sha(avatar_loop.encode()), "previewHttp": preview_http},
            "public": {"index": sha(index_public.encode()), "avatar": sha(avatar_public.encode()), "previewHttp": preview_public},
        }
        if "lhs-fashion-hidden-preview-v1.js" in index_loop or "20261003_avatar_upload_v2" not in index_loop:
            raise RuntimeError("LOOPBACK_INDEX_MARKER")
        if "lhs-fashion-hidden-preview-v1.js" in index_public or "20261003_avatar_upload_v2" not in index_public:
            raise RuntimeError("PUBLIC_INDEX_MARKER")
        if preview_http != "404" or preview_public != "404":
            raise RuntimeError("PREVIEW_ADDON_NOT_404")
        if sha(avatar_loop.encode()) != after[AVATAR] or sha(avatar_public.encode()) != after[AVATAR]:
            raise RuntimeError("AVATAR_SERVED_HASH")
        receipt.update({"beforeHashes": before, "afterHashes": after, "served": served, "result": "DEPLOYED_VERIFIED", "completedAt": dt.datetime.now(dt.timezone.utc).isoformat()})
    except Exception as error:
        receipt["result"] = "FAILED"
        receipt["error"] = str(error)
        # Restore only files changed in this transaction; no PM2 restart.
        for path in reversed(swapped):
            try:
                if path == PREVIEW:
                    bp = posixpath.join(backup, posixpath.basename(path) + ".before")
                    run(f"cp -p -- {q(bp)} {q(path)}")
                else:
                    bp = posixpath.join(backup, posixpath.basename(path) + ".before")
                    tmp = path + ".rollback-" + stamp
                    run(f"cp -p -- {q(bp)} {q(tmp)} && mv -f -- {q(tmp)} {q(path)}")
            except Exception:
                pass
        raise
    finally:
        try:
            run(f"rm -rf -- {q(stage)}")
        except Exception:
            pass
        (output / "deployment.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        sftp.close()
        client.close()
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
