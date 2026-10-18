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
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, str(ROOT / "_ai_workbench/tools"))
from build_pet_resource_manifest_20260929 import parse  # noqa: E402


CANDIDATE = ROOT / "_ai_workbench/temp/role_lian_manifest_20260930"
GAME = "/linhhoasu/webgame/game"
OLD_NAME = "default.res_main_c669f2c0_pet_vusa_20260929.bin"
NEW_NAME = "default.res_main_c669f2c0_pet_vusa_lian_20260930.bin"
OLD_HASH = "c377de920cae08965e560d66003883b616c8c03ed71605d569284a708d8b40a2"
INDEX_HASH = "752aa9deeec50d4ca2c6c62f517929cfb24d4549eb527d6eab9ca4825b185c2d"
PORTS = [8080, 8083, 8084, 8085, 8086, 8087]


def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def ssh_config() -> tuple[list[object], dict[str, object]]:
    tree = ast.parse((ROOT / "_ai_workbench/tools/vps_exec.py").read_text(encoding="utf-8-sig"))
    call = next(node for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "connect")
    args = [ast.literal_eval(node) for node in call.args]
    kwargs = {node.arg: ast.literal_eval(node.value) for node in call.keywords}
    kwargs.update(timeout=20, banner_timeout=20, auth_timeout=20)
    return args, kwargs


def main() -> None:
    build = json.loads((CANDIDATE / "build.json").read_text(encoding="utf-8"))
    index_build = json.loads((CANDIDATE / "index-build.json").read_text(encoding="utf-8"))
    manifest = (CANDIDATE / NEW_NAME).read_bytes()
    index = (CANDIDATE / "index.html").read_bytes()
    base = (ROOT / "_ai_workbench/temp/remote_main_pet_vusa_20260930.bin").read_bytes()
    if sha(base) != OLD_HASH or sha(manifest) != build["candidate"]["sha256"] or sha(index) != index_build["candidate"]["sha256"]:
        raise RuntimeError("LOCAL_HASH_MISMATCH")
    if sha((ROOT / "linhhoasu/webgame/game/index.html").read_bytes()) != INDEX_HASH:
        raise RuntimeError("LOCAL_INDEX_DRIFT")
    base_parsed, candidate_parsed = parse(base), parse(manifest)
    candidate_by_name = {row["name"]: row for row in candidate_parsed["resources"]}
    if len(candidate_by_name) != len(candidate_parsed["resources"]):
        raise RuntimeError("DUPLICATE_RESOURCE_NAMES")
    if any(candidate_by_name.get(row["name"]) != row for row in base_parsed["resources"]):
        raise RuntimeError("EXISTING_RESOURCES_CHANGED")
    if candidate_parsed["prefixes"][:len(base_parsed["prefixes"])] != base_parsed["prefixes"]:
        raise RuntimeError("EXISTING_PREFIXES_CHANGED")
    if len(candidate_parsed["resources"]) - len(base_parsed["resources"]) != 12:
        raise RuntimeError("RESOURCE_DELTA_NOT_12")
    if candidate_parsed["compressed"] != base_parsed["compressed"]:
        raise RuntimeError("MANIFEST_COMPRESSION_CHANGED")
    if set(candidate_parsed["groups"]) != set(base_parsed["groups"]):
        raise RuntimeError("RESOURCE_GROUP_NAMES_CHANGED")
    for group, indices in base_parsed["groups"].items():
        before_names = [base_parsed["resources"][i]["name"] for i in indices]
        after_names = [candidate_parsed["resources"][i]["name"] for i in candidate_parsed["groups"][group]]
        if before_names != after_names:
            raise RuntimeError("RESOURCE_GROUP_MEMBERS_CHANGED:" + group)
    source_index = (ROOT / "linhhoasu/webgame/game/index.html").read_bytes()
    expected_index = source_index.replace(OLD_NAME.encode(), NEW_NAME.encode()).replace(b"20260930_pet_cap1000_v1", b"20260930_spine_lian_v1")
    if expected_index != index:
        raise RuntimeError("UNEXPECTED_INDEX_CHANGE")
    index_text = index.decode("utf-8")
    if index_text.count(NEW_NAME) != 1 or "20260930_spine_lian_v1" not in index_text:
        raise RuntimeError("INDEX_ANCHOR_MISSING")

    args, kwargs = ssh_config()
    if str(args[0]) != "103.116.104.165":
        raise RuntimeError("TARGET_HOST_MISMATCH")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()
    nonce = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/role_lian_manifest_{nonce}"
    receipt_path = CANDIDATE / "deployment.json"
    new_remote = GAME + "/update/resource/" + NEW_NAME
    old_remote = GAME + "/update/resource/" + OLD_NAME
    index_remote = GAME + "/index.html"
    staged: list[str] = []
    index_swapped = False
    published = False

    def run(command: str) -> str:
        _, stdout, stderr = client.exec_command(command, timeout=45)
        out, err = stdout.read().decode("utf-8", "replace"), stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        if code:
            raise RuntimeError(f"REMOTE_COMMAND_FAILED({code}):{err[:800]}")
        return out.strip()

    def read(path: str) -> bytes:
        with sftp.open(path, "rb") as stream:
            return stream.read()

    def hash_remote(path: str) -> str:
        return sha(read(path))

    def pm2() -> list[dict[str, object]]:
        raw = json.loads(run("pm2 jlist 2>/dev/null"))
        return sorted([{"name": p["name"], "status": p["pm2_env"]["status"], "pid": p["pid"], "restart": p["pm2_env"].get("restart_time")} for p in raw if p["name"].startswith("lhs-s100")], key=lambda p: p["name"])

    def ready() -> dict[str, object]:
        result = {}
        for port in PORTS:
            data = json.loads(run(f"curl --max-time 8 -fsS http://127.0.0.1:{port}/ready"))
            if data.get("status") != "ok" or data.get("checks", {}).get("mongo") is not True or data.get("checks", {}).get("redis") is not True:
                raise RuntimeError(f"READINESS_FAILED:{port}")
            result[str(port)] = data
        return result

    def curl_hash(url: str) -> str:
        # pipefail prevents hashing an empty curl failure as a passing check.
        return run("bash -o pipefail -c " + shlex.quote("curl --max-time 25 -fsS " + shlex.quote(url) + " | sha256sum")).split()[0]

    try:
        if hash_remote(old_remote) != OLD_HASH or hash_remote(index_remote) != INDEX_HASH:
            raise RuntimeError("CAS_PREFLIGHT_FAILED")
        try:
            sftp.stat(new_remote)
            raise RuntimeError("NEW_MANIFEST_TARGET_ALREADY_EXISTS")
        except FileNotFoundError:
            pass
        pre_pm2 = pm2()
        pre_ready = ready()
        run("install -d -m 700 -- " + shlex.quote(backup))
        for source, target in [(old_remote, backup + "/" + OLD_NAME), (index_remote, backup + "/index.html")]:
            run("cp -p -- " + shlex.quote(source) + " " + shlex.quote(target))
        if hash_remote(backup + "/index.html") != INDEX_HASH or hash_remote(backup + "/" + OLD_NAME) != OLD_HASH:
            raise RuntimeError("BACKUP_HASH_MISMATCH")
        staged_manifest = new_remote + "." + nonce + ".tmp"
        staged_index = index_remote + "." + nonce + ".tmp"
        for local, stage, expected in [(CANDIDATE / NEW_NAME, staged_manifest, sha(manifest)), (CANDIDATE / "index.html", staged_index, sha(index))]:
            sftp.put(str(local), stage)
            staged.append(stage)
            run("chmod 644 -- " + shlex.quote(stage))
            if hash_remote(stage) != expected:
                raise RuntimeError("STAGED_HASH_MISMATCH")
        # Re-check CAS immediately before atomic publication, dependencies first.
        if hash_remote(index_remote) != INDEX_HASH or hash_remote(old_remote) != OLD_HASH:
            raise RuntimeError("CAS_BEFORE_SWAP_FAILED")
        run("mv -n -- " + shlex.quote(staged_manifest) + " " + shlex.quote(new_remote))
        published = True
        if hash_remote(new_remote) != sha(manifest):
            raise RuntimeError("NEW_MANIFEST_HASH_MISMATCH")
        if curl_hash("http://127.0.0.1:81/update/resource/" + NEW_NAME) != sha(manifest):
            raise RuntimeError("NEW_MANIFEST_NOT_SERVED")
        # Keep current owner and mode on the HTML entry point.
        run("chown --reference=" + shlex.quote(index_remote) + " " + shlex.quote(staged_index))
        run("chmod --reference=" + shlex.quote(index_remote) + " " + shlex.quote(staged_index))
        if hash_remote(index_remote) != INDEX_HASH:
            raise RuntimeError("INDEX_CAS_FAILED")
        run("mv -f -- " + shlex.quote(staged_index) + " " + shlex.quote(index_remote))
        index_swapped = True
        if hash_remote(index_remote) != sha(index):
            raise RuntimeError("POST_INDEX_HASH_MISMATCH")
        if hash_remote(old_remote) != OLD_HASH:
            raise RuntimeError("OLD_MANIFEST_CHANGED")
        served = {
            "index": curl_hash("http://127.0.0.1:81/index.html"),
            "main": curl_hash("http://127.0.0.1:81/update/resource/" + NEW_NAME),
            "publicIndex": curl_hash("https://linhhoasu.lol/index.html?spine_lian=" + nonce),
            "publicMain": curl_hash("https://linhhoasu.lol/update/resource/" + NEW_NAME),
        }
        if served["index"] != sha(index) or served["main"] != sha(manifest) or served["publicIndex"] != sha(index) or served["publicMain"] != sha(manifest):
            raise RuntimeError("SERVED_HASH_MISMATCH")
        assets = []
        for row in build["added"]:
            url = "https://linhhoasu.lol/update/resource/" + row["url"]
            got = run("curl --max-time 15 -fsS -o /dev/null -w '%{http_code} %{size_download} %{content_type}' " + shlex.quote(url))
            parts = got.split(" ", 2)
            if parts[0] != "200":
                raise RuntimeError("ASSET_HTTP_FAILED:" + row["name"])
            if row["type"] != "image" and int(parts[1]) != row["bytes"]:
                raise RuntimeError("ASSET_SIZE_MISMATCH:" + row["name"])
            if row["type"] == "image" and parts[2].split(";")[0] != "image/png":
                raise RuntimeError("ASSET_PNG_TYPE_MISMATCH:" + row["name"])
            assets.append({"name": row["name"], "http": got})
        post_ready = ready()
        post_pm2 = pm2()
        if post_pm2 != pre_pm2:
            raise RuntimeError("PM2_PID_RESTART_INVARIANT_FAILED")
        report = {
            "result": "DEPLOYED",
            "host": str(args[0]),
            "backupDir": backup,
            "productionWrites": 2,
            "preHashes": {"index": INDEX_HASH, "main": OLD_HASH},
            "postHashes": {"index": sha(index), "main": sha(manifest)},
            "servedHashes": served,
            "resources": {"before": len(base_parsed["resources"]), "after": len(candidate_parsed["resources"]), "unchangedBefore": True, "added": len(build["added"])},
            "assetChecks": assets,
            "preReady": pre_ready,
            "postReady": post_ready,
            "prePm2": pre_pm2,
            "postPm2": post_pm2,
            "at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "gameplayE2E": False,
        }
        receipt_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        # Sync local source only if the preimage is still unchanged.
        local_index = ROOT / "linhhoasu/webgame/game/index.html"
        if sha(local_index.read_bytes()) != INDEX_HASH:
            raise RuntimeError("LOCAL_POST_DEPLOY_DRIFT")
        local_index.write_bytes(index)
        (ROOT / "linhhoasu/webgame/game/update/resource" / NEW_NAME).write_bytes(manifest)
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except Exception as exc:
        rollback_status = "no live entry point mutation"
        if index_swapped:
            if hash_remote(index_remote) != sha(index):
                rollback_status = "blocked by changed live index; manual review required"
            else:
                rollback_stage = index_remote + ".rollback_" + nonce + ".tmp"
                run("cp -p -- " + shlex.quote(backup + "/index.html") + " " + shlex.quote(rollback_stage))
                if hash_remote(rollback_stage) != INDEX_HASH:
                    raise RuntimeError("ROLLBACK_STAGE_HASH_MISMATCH") from exc
                run("mv -f -- " + shlex.quote(rollback_stage) + " " + shlex.quote(index_remote))
                rollback_status = "index restored; old manifest unchanged"
        failure = {"result": "FAILED", "error": str(exc), "backupDir": backup, "publishedManifest": published, "rollback": rollback_status, "at": dt.datetime.now(dt.timezone.utc).isoformat()}
        receipt_path.write_text(json.dumps(failure, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        raise
    finally:
        for stage in staged:
            try:
                sftp.remove(stage)
            except FileNotFoundError:
                pass
        sftp.close()
        client.close()


if __name__ == "__main__":
    main()
