from __future__ import annotations

import ast
import datetime as dt
import hashlib
import json
import posixpath
import shlex
import sys
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[2]
BACKUP = "/linhhoasu/_ai_workbench/backups/role_lian_manifest_20260930_201244"
REMOTE_INDEX = "/linhhoasu/webgame/game/index.html"
REMOTE_OLD_MANIFEST = "/linhhoasu/webgame/game/update/resource/default.res_main_c669f2c0_pet_vusa_20260929.bin"
REMOTE_NEW_MANIFEST = "/linhhoasu/webgame/game/update/resource/default.res_main_c669f2c0_pet_vusa_lian_20260930.bin"
EXPECTED_LIVE_INDEX = "301542c5c6825fc734f1cd8b39969af5772e4692be477ca6db90257b4b3facc9"
EXPECTED_OLD_INDEX = "752aa9deeec50d4ca2c6c62f517929cfb24d4549eb527d6eab9ca4825b185c2d"
EXPECTED_OLD_MANIFEST = "c377de920cae08965e560d66003883b616c8c03ed71605d569284a708d8b40a2"
PORTS = [8080, 8083, 8084, 8085, 8086, 8087]
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def ssh_config():
    source = (ROOT / "_ai_workbench/tools/vps_exec.py").read_text(encoding="utf-8-sig")
    tree = ast.parse(source)
    call = next(node for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "connect")
    args = [ast.literal_eval(node) for node in call.args]
    kwargs = {node.arg: ast.literal_eval(node.value) for node in call.keywords}
    kwargs.update(timeout=20, banner_timeout=20, auth_timeout=20)
    return args, kwargs


def main() -> None:
    local_index = ROOT / "linhhoasu/webgame/game/index.html"
    if sha(local_index.read_bytes()) != EXPECTED_OLD_INDEX:
        raise RuntimeError("LOCAL_INDEX_NOT_ROLLED_BACK")
    args, kwargs = ssh_config()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()
    nonce = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    rollback_backup = f"/linhhoasu/_ai_workbench/backups/role_lian_rollback_{nonce}"
    stage = REMOTE_INDEX + f".rollback_{nonce}.tmp"
    receipt = ROOT / "_ai_workbench/temp/role_lian_manifest_20260930/rollback.json"

    def run(command: str) -> str:
        _, stdout, stderr = client.exec_command(command, timeout=45)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError(f"REMOTE_COMMAND_FAILED({code}): {err[:800]}")
        return out.strip()

    def read(path: str) -> bytes:
        with sftp.open(path, "rb") as stream:
            return stream.read()

    def hash_remote(path: str) -> str:
        return sha(read(path))

    def readiness():
        out = {}
        for port in PORTS:
            value = json.loads(run(f"curl --max-time 8 -fsS http://127.0.0.1:{port}/ready"))
            if value.get("status") != "ok" or value.get("checks", {}).get("mongo") is not True or value.get("checks", {}).get("redis") is not True:
                raise RuntimeError(f"READINESS_FAILED:{port}")
            out[str(port)] = value
        return out

    def served_hash(url: str) -> str:
        return run("bash -o pipefail -c " + shlex.quote("curl --max-time 25 -fsS " + shlex.quote(url) + " | sha256sum")).split()[0]

    try:
        if hash_remote(REMOTE_INDEX) != EXPECTED_LIVE_INDEX:
            raise RuntimeError("CAS_LIVE_INDEX_CHANGED")
        if hash_remote(BACKUP + "/index.html") != EXPECTED_OLD_INDEX or hash_remote(REMOTE_OLD_MANIFEST) != EXPECTED_OLD_MANIFEST:
            raise RuntimeError("ROLLBACK_BASELINE_MISMATCH")
        pre_ready = readiness()
        pre_new_manifest = hash_remote(REMOTE_NEW_MANIFEST)
        run("install -d -m 700 -- " + shlex.quote(rollback_backup))
        run("cp -p -- " + shlex.quote(REMOTE_INDEX) + " " + shlex.quote(rollback_backup + "/index.html.before"))
        run("cp -p -- " + shlex.quote(REMOTE_NEW_MANIFEST) + " " + shlex.quote(rollback_backup + "/default.res_main_c669f2c0_pet_vusa_lian_20260930.bin"))
        if hash_remote(rollback_backup + "/index.html.before") != EXPECTED_LIVE_INDEX or hash_remote(rollback_backup + "/default.res_main_c669f2c0_pet_vusa_lian_20260930.bin") != pre_new_manifest:
            raise RuntimeError("ROLLBACK_BACKUP_HASH_MISMATCH")
        run("cp -p -- " + shlex.quote(BACKUP + "/index.html") + " " + shlex.quote(stage))
        run("chown --reference=" + shlex.quote(REMOTE_INDEX) + " " + shlex.quote(stage))
        run("chmod --reference=" + shlex.quote(REMOTE_INDEX) + " " + shlex.quote(stage))
        if hash_remote(stage) != EXPECTED_OLD_INDEX:
            raise RuntimeError("ROLLBACK_STAGE_HASH_MISMATCH")
        if hash_remote(REMOTE_INDEX) != EXPECTED_LIVE_INDEX:
            raise RuntimeError("CAS_BEFORE_ROLLBACK_FAILED")
        run("mv -f -- " + shlex.quote(stage) + " " + shlex.quote(REMOTE_INDEX))
        if hash_remote(REMOTE_INDEX) != EXPECTED_OLD_INDEX or hash_remote(REMOTE_OLD_MANIFEST) != EXPECTED_OLD_MANIFEST:
            raise RuntimeError("ROLLBACK_POST_HASH_MISMATCH")
        served = {
            "loopbackIndex": served_hash("http://127.0.0.1:81/index.html?rollback=" + nonce),
            "loopbackOldManifest": served_hash("http://127.0.0.1:81/update/resource/default.res_main_c669f2c0_pet_vusa_20260929.bin"),
            "publicIndex": served_hash("https://linhhoasu.lol/index.html?rollback=" + nonce),
            "publicOldManifest": served_hash("https://linhhoasu.lol/update/resource/default.res_main_c669f2c0_pet_vusa_20260929.bin?rollback=" + nonce),
        }
        if served["loopbackIndex"] != EXPECTED_OLD_INDEX or served["loopbackOldManifest"] != EXPECTED_OLD_MANIFEST:
            raise RuntimeError("LOOPBACK_ROLLBACK_NOT_SERVED")
        public_text = run("curl --max-time 25 -fsS " + shlex.quote("https://linhhoasu.lol/index.html?rollback=" + nonce))
        if "default.res_main_c669f2c0_pet_vusa_lian_20260930.bin" in public_text or "20260930_spine_lian_v1" in public_text:
            raise RuntimeError("PUBLIC_INDEX_STILL_POINTS_NEW_MANIFEST")
        post_ready = readiness()
        report = {
            "result": "ROLLED_BACK",
            "host": str(args[0]),
            "reason": "User reported game error and long loading after Spine manifest rollout",
            "rollbackBackup": rollback_backup,
            "productionWrites": 1,
            "indexBefore": EXPECTED_LIVE_INDEX,
            "indexAfter": EXPECTED_OLD_INDEX,
            "oldManifest": EXPECTED_OLD_MANIFEST,
            "newManifestPreserved": pre_new_manifest,
            "served": served,
            "preReady": pre_ready,
            "postReady": post_ready,
            "pm2Restart": False,
            "playerDataChanged": False,
            "at": dt.datetime.now(dt.timezone.utc).isoformat(),
        }
        receipt.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except Exception as exc:
        failure = {"result": "FAILED", "error": str(exc), "at": dt.datetime.now(dt.timezone.utc).isoformat()}
        receipt.write_text(json.dumps(failure, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        raise
    finally:
        try:
            sftp.remove(stage)
        except FileNotFoundError:
            pass
        sftp.close()
        client.close()


if __name__ == "__main__":
    main()
