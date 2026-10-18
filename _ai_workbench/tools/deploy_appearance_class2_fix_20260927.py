"""Deploy the verified class-2 appearance fallback with CAS, backup and read-back."""

from __future__ import annotations

import hashlib
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
ROOT = WB.parent
sys.path.insert(0, str(WB / "tools"))
from snapshot_web_multiserver_20260906 import connect  # noqa: E402


APP = "/linhhoasu/lhs/newServer"
GAME = "/linhhoasu/webgame/game"
REMOTE_FILES = {
    f"{APP}/src/handlers/fashion.js": ROOT / "linhhoasu/lhs/newServer/src/handlers/fashion.js",
    f"{GAME}/js/lhs-appearance-preview-v1.js": ROOT / "linhhoasu/webgame/game/js/lhs-appearance-preview-v1.js",
    f"{GAME}/index.html": ROOT / "linhhoasu/webgame/game/index.html",
}
TEST = WB / "tools/test_appearance_class2_fix_20260927.js"
NODES = [
    ("lhs-s1006", 8087), ("lhs-s1005", 8086), ("lhs-s1004", 8085),
    ("lhs-s1003", 8084), ("lhs-s1002", 8083), ("lhs-s1001", 8080),
]

# Read-only preflight immediately before this rollout found these exact bytes.
# Any drift aborts before creating or swapping a live file.
REMOTE_BASELINE = {
    f"{APP}/src/handlers/fashion.js": "56420e785ca0623fa6ce35e098eb02797466552c5afda777100379cc0cda21fe",
    f"{GAME}/js/lhs-appearance-preview-v1.js": "ad1ea0006d3bd55108d6d7a09eeb4b663bd10a77a2ac887f11685ce5eb2ddfd6",
    f"{GAME}/index.html": "df78699fedf403a025e0639cc9f222dea907db1e50bee8e6764a1ff7fb0d9a37",
}
OLD_MARKER = b"js/lhs-appearance-preview-v1.js?v=20260927_appearance_preview_v2"
NEW_MARKER = b"js/lhs-appearance-preview-v1.js?v=20260927_appearance_preview_v3"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def remote(ssh, command: str, timeout: int = 120) -> str:
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    if stdout.channel.recv_exit_status() != 0:
        raise RuntimeError((error + output)[-30000:])
    return output


def ready(ssh, port: int) -> None:
    remote(
        ssh,
        "for i in $(seq 1 90); do "
        f"code=$(curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready || true); "
        "[ \"$code\" = 200 ] && exit 0; sleep 1; done; exit 1",
        timeout=120,
    )


def pm2(ssh) -> list[dict]:
    script = (
        "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify("
        "JSON.parse(s).filter(p=>p.name.startsWith('lhs-s100')).map(p=>({name:p.name,status:p.pm2_env.status,pid:p.pid,restarts:p.pm2_env.restart_time})))))"
    )
    return json.loads(remote(ssh, "pm2 jlist | node -e " + shlex.quote(script)))


def main() -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/appearance_class2_fix_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/appearance_class2_fix_{stamp}"
    evidence_path = WB / "temp" / "appearance_class2_fix_20260927" / f"release_{stamp}.json"
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    evidence = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "PREPARING",
        "backup": backup,
        "stage": stage,
        "productionWrites": 0,
        "playerWrites": 0,
        "dbWrites": 0,
        "processRestarts": 0,
        "files": {},
    }
    local_data = {
        path: local.read_bytes()
        for path, local in REMOTE_FILES.items()
        if path != f"{GAME}/index.html"
    }
    ssh = connect()
    installed: list[str] = []
    restarted = False
    try:
        before_ready = {str(port): remote(ssh, f"curl -fsS -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip() for _name, port in NODES}
        if any(value != "200" for value in before_ready.values()):
            raise RuntimeError("READY_NOT_200_BEFORE:" + json.dumps(before_ready))
        evidence["beforeReady"] = before_ready
        evidence["beforePm2"] = pm2(ssh)

        with ssh.open_sftp() as sftp:
            before_data = {path: sftp.open(path, "rb").read() for path in REMOTE_FILES}
            before_hashes = {path: sha(data) for path, data in before_data.items()}
            if before_hashes != REMOTE_BASELINE:
                raise RuntimeError("REMOTE_DRIFT:" + json.dumps(before_hashes, sort_keys=True))
            current_index = before_data[f"{GAME}/index.html"]
            if NEW_MARKER in current_index:
                raise RuntimeError("RELEASE_ALREADY_PRESENT")
            if current_index.count(OLD_MARKER) != 1:
                raise RuntimeError("INDEX_CACHE_ANCHOR_COUNT")
            candidate_data = dict(local_data)
            candidate_data[f"{GAME}/index.html"] = current_index.replace(OLD_MARKER, NEW_MARKER, 1)
            candidate_hashes = {path: sha(data) for path, data in candidate_data.items()}
            evidence["files"] = {
                path: {
                    "before": before_hashes[path],
                    "candidate": candidate_hashes[path],
                    "bytes": len(candidate_data[path]),
                }
                for path in REMOTE_FILES
            }

            remote(ssh, f"install -d -m 700 {shlex.quote(backup)} {shlex.quote(stage)}")
            backup_paths = {}
            stage_paths = {}
            for index, path in enumerate(REMOTE_FILES, 1):
                safe = f"{index:02d}_{path.strip('/').replace('/', '__')}"
                backup_path = f"{backup}/{safe}.before"
                stage_path = f"{stage}/{safe}.candidate"
                remote(ssh, f"cp -p -- {shlex.quote(path)} {shlex.quote(backup_path)}")
                with sftp.open(backup_path, "rb") as handle:
                    if sha(handle.read()) != before_hashes[path]:
                        raise RuntimeError("BACKUP_HASH_MISMATCH:" + path)
                with sftp.open(stage_path, "wb") as handle:
                    handle.write(candidate_data[path])
                sftp.chmod(stage_path, 0o644)
                with sftp.open(stage_path, "rb") as handle:
                    if sha(handle.read()) != candidate_hashes[path]:
                        raise RuntimeError("STAGE_HASH_MISMATCH:" + path)
                backup_paths[path] = backup_path
                stage_paths[path] = stage_path

            # Last CAS immediately before any live mutation.
            for path in REMOTE_FILES:
                with sftp.open(path, "rb") as handle:
                    if sha(handle.read()) != before_hashes[path]:
                        raise RuntimeError("LIVE_CAS_DRIFT:" + path)

            for path in REMOTE_FILES:
                temp_path = path + f".appearance-class2-{stamp}.next"
                remote(ssh, f"cp -p -- {shlex.quote(stage_paths[path])} {shlex.quote(temp_path)}")
                remote(ssh, f"mv -f -- {shlex.quote(temp_path)} {shlex.quote(path)}")
                installed.append(path)
                with sftp.open(path, "rb") as handle:
                    if sha(handle.read()) != candidate_hashes[path]:
                        raise RuntimeError("INSTALL_HASH_MISMATCH:" + path)

            # Server-side regression runs against the newly installed handler;
            # it is RAM-only and uses a stubbed save service.
            test_path = f"{stage}/test_appearance_class2_fix_20260927.js"
            with sftp.open(test_path, "wb") as handle:
                handle.write(TEST.read_bytes())
            sftp.chmod(test_path, 0o644)
            remote(ssh, f"node --check < {shlex.quote(f'{stage}/01_linhhoasu__lhs__newServer__src__handlers__fashion.js.candidate')}")
            remote(ssh, f"node --check < {shlex.quote(f'{stage}/02_linhhoasu__webgame__game__js__lhs-appearance-preview-v1.js.candidate')}")
            test_out = remote(
                ssh,
                f"FEATURE_APP={APP} FEATURE_GAME={GAME} FEATURE_SKIP_CLIENT=1 node {shlex.quote(test_path)}",
                timeout=180,
            ).strip()
            if '"result":"PASS"' not in test_out or '"productionWrites":0' not in test_out:
                raise RuntimeError("CLASS2_REGRESSION_FAILED:" + test_out[-4000:])
            evidence["class2Regression"] = test_out
            evidence["backupPaths"] = backup_paths

        # fashion.js is loaded by the game processes, so restart one node at a
        # time.  Static client files need no process restart.
        for name, port in NODES:
            remote(ssh, f"cd {APP} && pm2 restart ecosystem.config.js --only {name} --update-env", timeout=180)
            ready(ssh, port)
        restarted = True
        evidence["processRestarts"] = len(NODES)
        evidence["afterPm2"] = pm2(ssh)
        evidence["afterReady"] = {
            str(port): remote(ssh, f"curl -fsS -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip()
            for _name, port in NODES
        }
        if any(value != "200" for value in evidence["afterReady"].values()):
            raise RuntimeError("READY_NOT_200_AFTER")

        with ssh.open_sftp() as sftp:
            after_hashes = {}
            for path in REMOTE_FILES:
                with sftp.open(path, "rb") as handle:
                    after_hashes[path] = sha(handle.read())
        if after_hashes != candidate_hashes:
            raise RuntimeError("REMOTE_READBACK_HASH_MISMATCH:" + json.dumps(after_hashes, sort_keys=True))
        evidence["afterHashes"] = after_hashes

        served = {}
        for path in [f"{GAME}/js/lhs-appearance-preview-v1.js", f"{GAME}/index.html"]:
            url_path = path.removeprefix(GAME)
            served_hash = remote(ssh, "curl -fsS --max-time 15 " + shlex.quote("http://127.0.0.1:81" + url_path) + " | sha256sum | cut -d' ' -f1").strip()
            served[path] = {"sha256": served_hash, "matches": served_hash == candidate_hashes[path]}
            if served_hash != candidate_hashes[path]:
                raise RuntimeError("HTTP_READBACK_HASH_MISMATCH:" + path)
        evidence["served"] = served
        evidence["status"] = "PASS"
        remote(ssh, f"rm -rf -- {shlex.quote(stage)}")
    except Exception:
        evidence["status"] = "FAILED"
        evidence["installedBeforeFailure"] = installed
        if installed:
            # Restore all files from the verified backup, then restart all
            # nodes if any process had already loaded the candidate source.
            for index, path in enumerate(REMOTE_FILES, 1):
                safe = f"{index:02d}_{path.strip('/').replace('/', '__')}"
                backup_path = f"{backup}/{safe}.before"
                try:
                    temp_path = path + f".appearance-class2-rollback-{stamp}.next"
                    remote(ssh, f"cp -p -- {shlex.quote(backup_path)} {shlex.quote(temp_path)} && mv -f -- {shlex.quote(temp_path)} {shlex.quote(path)}")
                except Exception:
                    pass
            if restarted:
                for name, port in NODES:
                    try:
                        remote(ssh, f"cd {APP} && pm2 restart ecosystem.config.js --only {name} --update-env", timeout=180)
                        ready(ssh, port)
                    except Exception:
                        pass
        raise
    finally:
        try:
            remote(ssh, f"rm -rf -- {shlex.quote(stage)}")
        except Exception:
            pass
        evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        ssh.close()
    print(json.dumps(evidence, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
