from __future__ import annotations

import ast
import datetime as dt
import hashlib
import json
import posixpath
import shlex
import time
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[2]
REMOTE_HOST = "103.116.104.165"
LOCAL_TO_REMOTE = {
    ROOT / "linhhoasu/lhs/newServer/src/handlers/pet.js": "/linhhoasu/lhs/newServer/src/handlers/pet.js",
    ROOT / "linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin": "/linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin",
    ROOT / "linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin": "/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin",
    ROOT / "linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin": "/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin",
    ROOT / "linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin": "/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin",
    ROOT / "linhhoasu/webgame/game/index.html": "/linhhoasu/webgame/game/index.html",
}
EXPECTED_REMOTE_SHA = {
    "/linhhoasu/lhs/newServer/src/handlers/pet.js": "d764759b3ac00737a4cec224154d25b32ed615f87d044b71eb0f2242df7d6893",
    "/linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin": "e1979790fe7b97177ca271fe5b29bc75f7d0407be8312acc48a5b76e21c044da",
    "/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin": "e1979790fe7b97177ca271fe5b29bc75f7d0407be8312acc48a5b76e21c044da",
    "/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin": "e1979790fe7b97177ca271fe5b29bc75f7d0407be8312acc48a5b76e21c044da",
    "/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin": "e1979790fe7b97177ca271fe5b29bc75f7d0407be8312acc48a5b76e21c044da",
    "/linhhoasu/webgame/game/index.html": "612d638780dbeb8eba6b89180119dd52db259c01d753734e8dd5be78c3afd30f",
}
PORTS = {
    "lhs-s1001": 8080,
    "lhs-s1002": 8083,
    "lhs-s1003": 8084,
    "lhs-s1004": 8085,
    "lhs-s1005": 8086,
    "lhs-s1006": 8087,
}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def load_ssh_config() -> tuple[list[object], dict[str, object]]:
    source = (ROOT / "_ai_workbench/tools/vps_exec.py").read_text(encoding="utf-8-sig")
    tree = ast.parse(source)
    call = next(
        node for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "connect"
    )
    args = [ast.literal_eval(node) for node in call.args]
    kwargs = {node.arg: ast.literal_eval(node.value) for node in call.keywords}
    kwargs.update(timeout=20, banner_timeout=20, auth_timeout=20)
    return args, kwargs


def main() -> None:
    local_hashes = {}
    for local_path, remote_path in LOCAL_TO_REMOTE.items():
        if not local_path.is_file():
            raise FileNotFoundError(local_path)
        payload = local_path.read_bytes()
        local_hashes[remote_path] = {
            "local": str(local_path.relative_to(ROOT)).replace("\\", "/"),
            "sha256": sha256_bytes(payload),
            "bytes": len(payload),
        }

    args, kwargs = load_ssh_config()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()
    moved: list[tuple[str, str]] = []
    staged: list[str] = []
    restarted: list[str] = []
    backup_ready = False
    mutation_started = False
    now = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = f"/linhhoasu/_ai_workbench/backups/pet_cap1000_{now}"
    work_dir = f"/linhhoasu/_ai_workbench/temp/pet_cap1000_deploy_{now}"
    local_report_dir = ROOT / "_ai_workbench/temp/pet_cap1000_deploy_20260930"
    local_report_dir.mkdir(parents=True, exist_ok=True)

    def run(command: str, *, check: bool = True) -> str:
        _, stdout, stderr = client.exec_command(command, timeout=45)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        if check and code != 0:
            raise RuntimeError(f"remote command failed ({code}): {command}\n{err[:1000]}")
        return out

    def remote_sha(remote_path: str) -> str:
        with sftp.open(remote_path, "rb") as stream:
            return sha256_bytes(stream.read())

    def remote_json(command: str):
        value = run(command)
        for line in reversed(value.splitlines()):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue
        raise RuntimeError(f"remote JSON missing: {value[:1000]}")

    def ready(name: str, port: int) -> dict:
        deadline = time.time() + 45
        last = ""
        while time.time() < deadline:
            raw = run(f"curl --max-time 5 -fsS http://127.0.0.1:{port}/ready", check=False)
            last = raw.strip()
            try:
                data = json.loads(last)
            except json.JSONDecodeError:
                data = None
            if isinstance(data, dict) and data.get("status") == "ok" and data.get("checks", {}).get("mongo") is True and data.get("checks", {}).get("redis") is True:
                return data
            time.sleep(1)
        raise RuntimeError(f"readiness failed for {name}:{port}: {last[:500]}")

    def rollback(reason: str) -> None:
        for remote_path, backup_path in ((remote, f"{backup_dir}/{posixpath.basename(remote)}") for remote in LOCAL_TO_REMOTE.values()):
            try:
                run(f"cp -p -- {shlex.quote(backup_path)} {shlex.quote(remote_path)}")
            except Exception:
                pass
        for temp_path in staged:
            run(f"rm -f -- {shlex.quote(temp_path)}", check=False)
        for name in restarted:
            try:
                run(f"pm2 restart {shlex.quote(name)} --update-env")
                ready(name, PORTS[name])
            except Exception:
                pass
        raise RuntimeError(f"ROLLBACK_COMPLETED: {reason}")

    try:
        # CAS preflight: no file is touched unless every target still matches the
        # read-only snapshot collected immediately before deployment.
        live_pre = {remote: remote_sha(remote) for remote in LOCAL_TO_REMOTE.values()}
        mismatches = {
            remote: {"expected": EXPECTED_REMOTE_SHA[remote], "actual": live_pre[remote]}
            for remote in live_pre
            if live_pre[remote] != EXPECTED_REMOTE_SHA[remote]
        }
        if mismatches:
            raise RuntimeError(f"CAS_PRECONDITION_FAILED: {json.dumps(mismatches)}")

        run(f"install -d -m 700 -- {shlex.quote(backup_dir)} {shlex.quote(work_dir)}")
        backup_manifest = []
        for remote_path in LOCAL_TO_REMOTE.values():
            backup_path = f"{backup_dir}/{posixpath.basename(remote_path)}"
            run(f"cp -p -- {shlex.quote(remote_path)} {shlex.quote(backup_path)}")
            backup_manifest.append({
                "path": remote_path,
                "backup": backup_path,
                "sha256": remote_sha(backup_path),
                "bytes": sftp.stat(backup_path).st_size,
            })
        if any(row["sha256"] != EXPECTED_REMOTE_SHA[row["path"]] for row in backup_manifest):
            raise RuntimeError("REMOTE_BACKUP_HASH_MISMATCH")
        backup_ready = True

        nonce = f"{int(time.time())}"
        for local_path, remote_path in LOCAL_TO_REMOTE.items():
            temp_path = f"{remote_path}.pet_cap1000_{nonce}.tmp"
            sftp.put(str(local_path), temp_path)
            run(f"chmod 644 -- {shlex.quote(temp_path)}")
            if remote_sha(temp_path) != local_hashes[remote_path]["sha256"]:
                raise RuntimeError(f"STAGED_HASH_MISMATCH:{remote_path}")
            staged.append(temp_path)

        mutation_started = True
        for temp_path, remote_path in zip(staged, LOCAL_TO_REMOTE.values()):
            run(f"mv -f -- {shlex.quote(temp_path)} {shlex.quote(remote_path)}")
            moved.append((remote_path, temp_path))

        post_hashes = {remote: remote_sha(remote) for remote in LOCAL_TO_REMOTE.values()}
        mismatches = {
            remote: {"expected": local_hashes[remote]["sha256"], "actual": post_hashes[remote]}
            for remote in post_hashes
            if post_hashes[remote] != local_hashes[remote]["sha256"]
        }
        if mismatches:
            rollback(f"POST_SWAP_HASH_MISMATCH:{json.dumps(mismatches)}")

        for name, port in PORTS.items():
            run(f"pm2 restart {shlex.quote(name)} --update-env")
            restarted.append(name)
            ready_data = ready(name, port)
            print(json.dumps({"node": name, "ready": ready_data}, ensure_ascii=False))

        runtime = remote_json(
            "cd /linhhoasu/lhs/newServer && node -e "
            + shlex.quote(
                "const c=require('./src/services/ConfigService');"
                "const t=c.loadAllTables();"
                "console.log(JSON.stringify({base:t.PetBaseConfig.levelMax,breakQualities:t.PetBaseConfig.breakLimitPetQuality,stage50:t.CoercionConfig[50]}));"
            )
        )
        if runtime.get("base") != 200 or runtime.get("stage50", {}).get("limitLevelUp") != 800 or set(runtime.get("breakQualities", [])) != {7, 9, 10}:
            rollback(f"RUNTIME_CONFIG_ASSERTION_FAILED:{json.dumps(runtime)}")
        static_hashes = {
            "/index.html": run("curl --max-time 15 -fsS http://127.0.0.1:81/index.html | sha256sum").split()[0],
            "/config_fashion_20260909.bin": run("curl --max-time 15 -fsS http://127.0.0.1:81/update/resource/assets/excel/config_fashion_20260909.bin | sha256sum").split()[0],
        }
        if static_hashes["/index.html"] != local_hashes["/linhhoasu/webgame/game/index.html"]["sha256"]:
            rollback(f"STATIC_INDEX_HASH_MISMATCH:{static_hashes['/index.html']}")
        if static_hashes["/config_fashion_20260909.bin"] != local_hashes["/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin"]["sha256"]:
            rollback(f"STATIC_CONFIG_HASH_MISMATCH:{static_hashes['/config_fashion_20260909.bin']}")
        index_live = run("curl --max-time 15 -fsS http://127.0.0.1:81/index.html | grep -o \"20260930_pet_cap1000_v1\" | head -n 1", check=False).strip()
        domain_index = run("curl --max-time 20 -fsS https://linhhoasu.lol/index.html", check=False)
        report = {
            "result": "DEPLOYED",
            "productionWrites": len(LOCAL_TO_REMOTE),
            "host": REMOTE_HOST,
            "backupDir": backup_dir,
            "backupManifest": backup_manifest,
            "localFiles": local_hashes,
            "postHashes": post_hashes,
            "runtimeConfig": runtime,
            "staticHashes": static_hashes,
            "loopbackIndexCacheBust": index_live,
            "domainIndexCacheBust": "20260930_pet_cap1000_v1" in domain_index,
            "restarted": restarted,
            "at": dt.datetime.now(dt.timezone.utc).isoformat(),
        }
        (local_report_dir / "deployment.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except Exception as exc:
        if backup_ready and mutation_started:
            try:
                rollback(str(exc))
            finally:
                sftp.close()
                client.close()
        else:
            for temp_path in staged:
                run(f"rm -f -- {shlex.quote(temp_path)}", check=False)
            sftp.close()
            client.close()
        raise
    finally:
        try:
            sftp.close()
            client.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
