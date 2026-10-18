"""Scoped, CAS-guarded rolling deploy for real winner/loser score deltas."""
from __future__ import annotations

import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "linhhoasu" / "lhs" / "newServer"
REMOTE_ROOT = "/linhhoasu/lhs/newServer"
BACKUP_BASE = "/linhhoasu/_ai_workbench/backups/zero_sum_score_20260927_v3"
STAGE_BASE = "/linhhoasu/_ai_workbench/temp/zero_sum_score_20260927_v3_stage"
PREVIOUS_RELEASE = ROOT / "_ai_workbench" / "temp" / "zero_sum_score_20260927_v2" / "release.json"
FILES = [
    "src/services/CompetitionScoreService.js",
    "src/handlers/arena.js",
    "src/services/CrossArenaService.js",
    "src/app.js",
    "src/db/models/Player.js",
    "src/db/models/ArenaFightLog.js",
    "src/db/models/CrossEventEntry.js",
    "src/db/models/CrossArenaAction.js",
]
# The current live files were read-only verified immediately before this
# mutation. Their exact hashes come from the completed v1 read-back; this is
# the CAS guard for the v2 concurrency fix.


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def remote_name(rel: str) -> str:
    return f"{REMOTE_ROOT}/{rel}"


def backup_name(rel: str) -> str:
    return rel.replace("/", "__")


def expected_remote(rel: str) -> str | None:
    if not PREVIOUS_RELEASE.exists():
        raise RuntimeError("PREVIOUS_RELEASE_READBACK_MISSING")
    previous = json.loads(PREVIOUS_RELEASE.read_text(encoding="utf-8"))
    value = (previous.get("afterHashes") or {}).get(rel)
    if not value:
        raise RuntimeError(f"PREVIOUS_RELEASE_HASH_MISSING:{rel}")
    return str(value)


def process_nodes(ssh):
    rows = json.loads(run(ssh, "pm2 jlist"))
    nodes = []
    for row in rows:
        name = str(row.get("name", ""))
        if not name.startswith("lhs-s"):
            continue
        env = dict((row.get("pm2_env") or {}).get("env") or {})
        env.update({k: v for k, v in (row.get("pm2_env") or {}).items() if k in {"SERVER_ID", "HTTP_PORT"}})
        try:
            server_id = int(env.get("SERVER_ID"))
            port = int(env.get("HTTP_PORT"))
        except (TypeError, ValueError):
            continue
        nodes.append({"name": name, "serverId": server_id, "port": port, "status": (row.get("pm2_env") or {}).get("status")})
    if not nodes:
        raise RuntimeError("NO_LHS_NODES")
    return sorted(nodes, key=lambda x: x["serverId"], reverse=True)


def ready(ssh, port: int) -> str:
    return run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}}' --connect-timeout 2 --max-time 20 http://127.0.0.1:{port}/ready || true").strip()


def main() -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"{BACKUP_BASE}_{stamp}"
    stage = f"{STAGE_BASE}_{stamp}"
    payload = {rel: (APP / rel).read_bytes() for rel in FILES}
    local_hashes = {rel: digest(data) for rel, data in payload.items()}
    if any(not h for h in local_hashes.values()):
        raise RuntimeError("LOCAL_FILE_MISSING")

    ssh = connect()
    swapped: list[str] = []
    restarted: list[str] = []
    nodes = []
    readiness = {}
    remote_before = {}
    backup_manifest = {"createdAt": datetime.now(timezone.utc).isoformat(), "files": {}, "missing": []}
    try:
        nodes = process_nodes(ssh)
        with ssh.open_sftp() as sftp:
            run(ssh, f"install -d -m 700 {shlex.quote(backup)} {shlex.quote(stage)}")
            for rel in FILES:
                remote = remote_name(rel)
                try:
                    old = sftp.open(remote, "rb").read()
                    attrs = sftp.stat(remote)
                    old_hash = digest(old)
                    remote_before[rel] = old
                    expected = expected_remote(rel)
                    if expected is None:
                        raise RuntimeError(f"REMOTE_UNEXPECTED_EXISTING:{rel}:{old_hash}")
                    if old_hash != expected:
                        raise RuntimeError(f"REMOTE_CAS_DRIFT:{rel}:{old_hash}:{expected}")
                    bp = f"{backup}/{backup_name(rel)}.before"
                    with sftp.open(bp, "wb") as handle:
                        handle.write(old)
                    sftp.chmod(bp, attrs.st_mode & 0o777)
                    backup_manifest["files"][rel] = {"sha256": old_hash, "bytes": len(old), "mode": attrs.st_mode & 0o777}
                except FileNotFoundError:
                    raise RuntimeError(f"REMOTE_FILE_MISSING:{rel}")
                stage_path = f"{stage}/{rel}"
                run(ssh, f"install -d -m 700 {shlex.quote(str(Path(stage_path).parent).replace(chr(92), chr(47)))}")
                with sftp.open(stage_path, "wb") as handle:
                    handle.write(payload[rel])
                sftp.chmod(stage_path, (backup_manifest["files"].get(rel) or {}).get("mode", 0o644))
            for rel in FILES:
                run(ssh, f"node --check {shlex.quote(stage + '/' + rel)}")
            # Re-read every target immediately before the atomic swaps.
            for rel in FILES:
                remote = remote_name(rel)
                try:
                    current = sftp.open(remote, "rb").read()
                except FileNotFoundError:
                    current = None
                if current != remote_before[rel]:
                    raise RuntimeError(f"PRE_SWAP_CAS_DRIFT:{rel}")
            for rel in FILES:
                remote = remote_name(rel)
                staged = f"{stage}/{rel}"
                sftp.posix_rename(staged, remote)
                swapped.append(remote)
            manifest_path = f"{backup}/manifest.json"
            with sftp.open(manifest_path, "wb") as handle:
                handle.write(json.dumps({"release": "zero_sum_score_20260927_v3", **backup_manifest}, ensure_ascii=False, indent=2).encode())
            sftp.chmod(manifest_path, 0o600)

        # Restart newest server first.  Only code is changed; no player/DB
        # mutation is performed by this script.
        for node in nodes:
            run(ssh, f"pm2 restart {shlex.quote(node['name'])} --update-env")
            restarted.append(node["name"])
            code = ""
            for _ in range(30):
                code = ready(ssh, node["port"])
                if code == "200":
                    break
                time.sleep(2)
            readiness[node["name"]] = code
            if code != "200":
                raise RuntimeError(f"READY_FAILED:{node['name']}:{code}")

        remote_after = {}
        syntax_after = {}
        with ssh.open_sftp() as sftp:
            for rel in FILES:
                data = sftp.open(remote_name(rel), "rb").read()
                remote_after[rel] = digest(data)
                syntax_after[rel] = run(ssh, f"node --check {shlex.quote(remote_name(rel))} >/dev/null && echo PASS").strip() == "PASS"
        if remote_after != local_hashes or not all(syntax_after.values()):
            raise RuntimeError("POST_DEPLOY_HASH_OR_SYNTAX_FAILED")
        report = {
            "result": "DEPLOYED_ZERO_SUM_SCORE_V3",
            "at": datetime.now(timezone.utc).isoformat(),
            "backup": backup,
            "stage": stage,
            "nodes": nodes,
            "restarted": restarted,
            "readiness": readiness,
            "beforeHashes": {rel: digest(data) if data is not None else None for rel, data in remote_before.items()},
            "afterHashes": remote_after,
            "localHashes": local_hashes,
            "syntax": syntax_after,
            "productionWrites": 0,
            "playerDataWrites": 0,
        }
        out = ROOT / "_ai_workbench" / "temp" / "zero_sum_score_20260927_v3" / "release.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except Exception:
        if swapped:
            try:
                with ssh.open_sftp() as sftp:
                    for rel in FILES:
                        remote = remote_name(rel)
                        if remote not in swapped:
                            continue
                        old = remote_before.get(rel)
                        if old is None:
                            run(ssh, f"rm -f -- {shlex.quote(remote)}")
                        else:
                            tmp = f"{remote}.rollback_{stamp}"
                            with sftp.open(tmp, "wb") as handle:
                                handle.write(old)
                            sftp.posix_rename(tmp, remote)
                for node in nodes:
                    try:
                        run(ssh, f"pm2 restart {shlex.quote(node['name'])} --update-env")
                    except Exception:
                        pass
            except Exception:
                pass
        raise
    finally:
        try:
            run(ssh, f"rm -rf -- {shlex.quote(stage)}")
        except Exception:
            pass
        ssh.close()


if __name__ == "__main__":
    main()
