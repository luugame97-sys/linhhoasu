"""CAS-guarded rolling deploy for the Arena pair-lock routing fix."""

from __future__ import annotations

import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run


ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / "linhhoasu" / "lhs" / "newServer" / "src" / "net" / "WSServer.js"
TEST = ROOT / "_ai_workbench" / "tools" / "test_arena_lock_upgrade_20260927.js"
REMOTE = "/linhhoasu/lhs/newServer/src/net/WSServer.js"
EXPECTED_REMOTE = "9ec2712c497d6ef93b6492126585791c13cca32ae2e64560d6aef7d4000a8907"


def sha_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha_file(path: Path) -> str:
    return sha_bytes(path.read_bytes())


def get_nodes(ssh):
    rows = json.loads(run(ssh, "pm2 jlist"))
    nodes = []
    for row in rows:
        name = str(row.get("name", ""))
        if not name.startswith("lhs-s"):
            continue
        try:
            server_id = int(name.removeprefix("lhs-s"))
        except ValueError:
            continue
        if server_id not in range(1001, 1007):
            continue
        env = dict((row.get("pm2_env") or {}).get("env") or {})
        try:
            port = int(env.get("HTTP_PORT"))
        except (TypeError, ValueError):
            raise RuntimeError(f"HTTP_PORT_MISSING:{name}")
        nodes.append({
            "name": name,
            "serverId": server_id,
            "port": port,
            "status": (row.get("pm2_env") or {}).get("status"),
            "pidBefore": row.get("pid"),
        })
    if {node["serverId"] for node in nodes} != set(range(1001, 1007)):
        raise RuntimeError("LHS_S1_S6_INVENTORY_INCOMPLETE")
    if any(node["status"] != "online" for node in nodes):
        raise RuntimeError("LHS_S1_S6_NOT_ALL_ONLINE")
    return sorted(nodes, key=lambda node: node["serverId"], reverse=True)


def ready(ssh, port: int) -> str:
    return run(
        ssh,
        f"curl -sS -o /dev/null -w '%{{http_code}}' --connect-timeout 2 --max-time 20 "
        f"http://127.0.0.1:{port}/ready || true",
    ).strip()


def latest_lock_errors(ssh):
    script = r'''for f in /root/.pm2/logs/lhs-s100[1-6]-out.log; do
  [ -f "$f" ] || continue
  line=$(grep -n '\[WSServer\] runtime ready revision=' "$f" | tail -1 | cut -d: -f1)
  if [ -n "$line" ]; then
    count=$(tail -n +"$line" "$f" | grep -c 'PLAYER_LOCK_UPGRADE_DENIED' || true)
  else
    count=0
  fi
  echo "$(basename "$f")=$count"
done'''
    out = run(ssh, script)
    return {
        line.split("=", 1)[0]: int(line.split("=", 1)[1])
        for line in out.splitlines()
        if "=" in line and line.rsplit("=", 1)[1].isdigit()
    }


def main() -> None:
    if not LOCAL.is_file() or not TEST.is_file():
        raise FileNotFoundError("LOCAL_CANDIDATE_OR_TEST_MISSING")
    candidate = LOCAL.read_bytes()
    local_hash = sha_bytes(candidate)
    test_hash = sha_file(TEST)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/arena_lock_fix_20260927_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/arena_lock_fix_20260927_{stamp}"
    remote_before = None
    swapped = False
    nodes = []
    readiness = {}
    restarted = []
    ssh = connect()
    try:
        nodes = get_nodes(ssh)
        remote_hash = run(ssh, f"sha256sum -- {shlex.quote(REMOTE)} | awk '{{print $1}}'").strip()
        if remote_hash != EXPECTED_REMOTE:
            raise RuntimeError(f"REMOTE_CAS_DRIFT:{remote_hash}:{EXPECTED_REMOTE}")
        with ssh.open_sftp() as sftp:
            remote_before = sftp.open(REMOTE, "rb").read()
            if sha_bytes(remote_before) != EXPECTED_REMOTE:
                raise RuntimeError("REMOTE_PRE_READ_CAS_DRIFT")
            attrs = sftp.stat(REMOTE)
            run(ssh, f"install -d -m 700 {shlex.quote(backup)} {shlex.quote(stage)}")
            with sftp.open(f"{backup}/WSServer.js.before", "wb") as handle:
                handle.write(remote_before)
            sftp.chmod(f"{backup}/WSServer.js.before", attrs.st_mode & 0o777)
            with sftp.open(f"{stage}/WSServer.js", "wb") as handle:
                handle.write(candidate)
            sftp.chmod(f"{stage}/WSServer.js", attrs.st_mode & 0o777)
            test_remote = f"{stage}/test_arena_lock_upgrade_20260927.js"
            with sftp.open(test_remote, "wb") as handle:
                handle.write(TEST.read_bytes())
            sftp.chmod(test_remote, 0o600)
        run(ssh, f"node --check {shlex.quote(stage + '/WSServer.js')}")
        with ssh.open_sftp() as sftp:
            current = sftp.open(REMOTE, "rb").read()
            if current != remote_before:
                raise RuntimeError("PRE_SWAP_CAS_DRIFT")
            staged = f"{stage}/WSServer.js"
            sftp.posix_rename(staged, REMOTE)
            swapped = True
            manifest = {
                "release": "arena_lock_fix_20260927",
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "beforeSha256": EXPECTED_REMOTE,
                "candidateSha256": local_hash,
                "candidateBytes": len(candidate),
                "testSha256": test_hash,
                "playerDataWrites": 0,
                "rewardWrites": 0,
            }
            with sftp.open(f"{backup}/manifest.json", "wb") as handle:
                handle.write((json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode())
            sftp.chmod(f"{backup}/manifest.json", 0o600)

        # The staged file has now been atomically installed. Load that exact
        # live candidate in a separate Node process before restarting PM2.
        # The test only exercises the lock scheduler and performs no DB/HTTP
        # writes. Any failure enters the rollback path below.
        test_output = run(
            ssh,
            f"cd {shlex.quote('/linhhoasu/lhs/newServer')} && "
            f"ARENA_LOCK_APP_ROOT={shlex.quote('/linhhoasu/lhs/newServer')} "
            f"ARENA_LOCK_WSSERVER_PATH={shlex.quote(REMOTE)} "
            f"node {shlex.quote(test_remote)}",
        )
        if '"result":"PASS"' not in test_output:
            raise RuntimeError(f"REMOTE_LOCK_CONTRACT_FAILED:{test_output[-1000:]}")

        # Restart newest first and prove readiness after every individual node.
        for node in nodes:
            run(ssh, f"pm2 restart {shlex.quote(node['name'])} --update-env")
            restarted.append(node["name"])
            code = "000"
            for _ in range(30):
                code = ready(ssh, node["port"])
                if code == "200":
                    break
                time.sleep(2)
            readiness[node["name"]] = code
            if code != "200":
                raise RuntimeError(f"READY_FAILED:{node['name']}:{code}")

        with ssh.open_sftp() as sftp:
            after = sftp.open(REMOTE, "rb").read()
        after_hash = sha_bytes(after)
        if after_hash != local_hash:
            raise RuntimeError(f"POST_HASH_MISMATCH:{after_hash}:{local_hash}")
        post_errors = latest_lock_errors(ssh)
        result = {
            "result": "DEPLOYED_ARENA_LOCK_FIX",
            "at": datetime.now(timezone.utc).isoformat(),
            "backup": backup,
            "stage": stage,
            "nodes": nodes,
            "restarted": restarted,
            "readiness": readiness,
            "beforeSha256": EXPECTED_REMOTE,
            "afterSha256": after_hash,
            "localSha256": local_hash,
            "remoteLockErrorsSinceLatestRestart": post_errors,
            "remoteContract": test_output.strip(),
            "playerDataWrites": 0,
            "rewardWrites": 0,
        }
        out = ROOT / "_ai_workbench" / "temp" / "arena_lock_fix_20260927" / "deploy.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception:
        if swapped and remote_before is not None:
            try:
                with ssh.open_sftp() as sftp:
                    rollback = f"{REMOTE}.rollback_{stamp}"
                    with sftp.open(rollback, "wb") as handle:
                        handle.write(remote_before)
                    sftp.posix_rename(rollback, REMOTE)
                for node in nodes:
                    try:
                        run(ssh, f"pm2 restart {shlex.quote(node['name'])} --update-env")
                    except Exception:
                        pass
            except Exception as rollback_error:
                raise RuntimeError(f"ROLLBACK_FAILED:{rollback_error}") from rollback_error
        raise
    finally:
        try:
            run(ssh, f"rm -rf -- {shlex.quote(stage)}")
        except Exception:
            pass
        ssh.close()


if __name__ == "__main__":
    main()
