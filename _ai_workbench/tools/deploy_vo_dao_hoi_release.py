from __future__ import annotations

import base64
import hashlib
import json
import sys
from pathlib import Path

import paramiko

HOST = "103.116.105.154"
USER = "root"
EXPECTED_FP = "SHA256:9hrzv0d3h/tdyep0ma+RUFi99n7YGXjQt3J4fI99osQ"
ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "_ai_workbench" / "temp" / "vo_dao_hoi_fix_20260912" / "release.tar.gz"
REMOTE_ARCHIVE = "/tmp/vo_dao_hoi_release.tar.gz"
BACKUP = "/linhhoasu/_ai_workbench/backups/vo_dao_hoi_socketfix_20260913_predeploy"
STAGE = "/linhhoasu/_ai_workbench/temp/vo_dao_hoi_fix_20260913_release"

EXPECTED = {
    "/linhhoasu/lhs/newServer/src/handlers/arena.js": "9dd028891a4fd4bd15a4de27e0563a87e8c1f589fb6e943712016f7b1c8456d9",
    "/linhhoasu/lhs/newServer/src/services/BattleService.js": "1416b1270726acbd3afb7ea07d34f5cae99763611a025cc093967b0d96b3e484",
    "/linhhoasu/lhs/newServer/src/services/RankService.js": "9ee1445594c8851e06820d213bf2048967551f6cbffd3727329bb5b408cad176",
    "/linhhoasu/lhs/newServer/src/handlers/account.js": "0152e767495cb9e60638a7ab6a84e6ed825a61014c17cd5e595f1f2966c54fd3",
    "/linhhoasu/lhs/newServer/src/services/PlayerService.js": "c37faa83777ae2b95224f70fdae50658d67cdbfb3b9240fea45f3d483abe096e",
    "/linhhoasu/lhs/newServer/src/app.js": "6c70d0b06281a4f8606e69654edd2ae912febd654b3e095f1f937406728974a4",
    "/linhhoasu/webgame/game/index.html": "5f54973b8806f65c6cd141af1ed60dbe1fcecd38c6037911b1ddc8a1d3ec1e94",
    "/linhhoasu/webgame/game/js/lhs-arena-v1.js": "a0b97d52cecfdd3d98beb6dec7d1d3e354baba416e71ec30c76122e9b8d041d0",
}


def run(ssh: paramiko.SSHClient, command: str) -> str:
    stdin, stdout, stderr = ssh.exec_command(command, timeout=120)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        raise RuntimeError(err.strip())
    return out.strip()


def main() -> None:
    password = sys.stdin.readline().rstrip("\r\n")
    if not password:
        raise SystemExit("password missing on stdin")
    archive_sha = hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=password, look_for_keys=False, allow_agent=False,
                timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        key = ssh.get_transport().get_remote_server_key()
        actual = "SHA256:" + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")
        if actual != EXPECTED_FP:
            raise RuntimeError(f"host fingerprint mismatch: {actual}")
        backup_cmd = f"mkdir -p {BACKUP}; " + "; ".join(
            f"cp -a {path} {BACKUP}/{Path(path).name}.before" for path in EXPECTED
        ) + f"; sha256sum {BACKUP}/*.before > {BACKUP}/SHA256.before"
        run(ssh, backup_cmd)
        run(ssh, "sha256sum " + " ".join(EXPECTED.keys()))
        for path, digest in EXPECTED.items():
            got = run(ssh, f"sha256sum {path} | awk '{{print $1}}'")
            if got.lower() != digest:
                raise RuntimeError(f"CAS mismatch {path}: {got} != {digest}")
        run(ssh, f"rm -rf {STAGE}; mkdir -p {STAGE}; tar -xzf {REMOTE_ARCHIVE} -C {STAGE}")
        node_files = [
            f"{STAGE}/lhs/newServer/src/handlers/arena.js",
            f"{STAGE}/lhs/newServer/src/services/RankService.js",
            f"{STAGE}/lhs/newServer/src/services/ArenaSettlementService.js",
            f"{STAGE}/lhs/newServer/src/db/models/ArenaFightLog.js",
            f"{STAGE}/lhs/newServer/src/handlers/account.js",
            f"{STAGE}/lhs/newServer/src/services/PlayerService.js",
            f"{STAGE}/lhs/newServer/src/app.js",
            f"{STAGE}/lhs/newServer/src/services/BattleService.js",
            f"{STAGE}/lhs/newServer/src/services/ArenaReadModelService.js",
            f"{STAGE}/lhs/newServer/src/db/models/ArenaSettlement.js",
            f"{STAGE}/webgame/game/js/lhs-arena-v1.js",
            f"{STAGE}/webgame/game/js/lhs-socket-send-v3.js",
        ]
        run(ssh, "node --check " + " ".join(node_files))
        run(ssh, f"cp -a {STAGE}/lhs/newServer/src/handlers/arena.js /linhhoasu/lhs/newServer/src/handlers/arena.js; cp -a {STAGE}/lhs/newServer/src/services/RankService.js /linhhoasu/lhs/newServer/src/services/RankService.js; cp -a {STAGE}/lhs/newServer/src/services/ArenaSettlementService.js /linhhoasu/lhs/newServer/src/services/ArenaSettlementService.js; cp -a {STAGE}/lhs/newServer/src/db/models/ArenaFightLog.js /linhhoasu/lhs/newServer/src/db/models/ArenaFightLog.js; cp -a {STAGE}/lhs/newServer/src/handlers/account.js /linhhoasu/lhs/newServer/src/handlers/account.js; cp -a {STAGE}/lhs/newServer/src/services/PlayerService.js /linhhoasu/lhs/newServer/src/services/PlayerService.js; cp -a {STAGE}/lhs/newServer/src/app.js /linhhoasu/lhs/newServer/src/app.js; cp -a {STAGE}/lhs/newServer/src/services/BattleService.js /linhhoasu/lhs/newServer/src/services/BattleService.js; cp -a {STAGE}/lhs/newServer/src/services/ArenaReadModelService.js /linhhoasu/lhs/newServer/src/services/ArenaReadModelService.js; cp -a {STAGE}/lhs/newServer/src/db/models/ArenaSettlement.js /linhhoasu/lhs/newServer/src/db/models/ArenaSettlement.js; cp -a {STAGE}/webgame/game/js/lhs-arena-v1.js /linhhoasu/webgame/game/js/lhs-arena-v1.js; cp -a {STAGE}/webgame/game/js/lhs-socket-send-v3.js /linhhoasu/webgame/game/js/lhs-socket-send-v3.js; cp -a {STAGE}/webgame/game/index.html /linhhoasu/webgame/game/index.html")
        post = run(ssh, "sha256sum /linhhoasu/lhs/newServer/src/handlers/arena.js /linhhoasu/lhs/newServer/src/services/RankService.js /linhhoasu/lhs/newServer/src/services/ArenaSettlementService.js /linhhoasu/lhs/newServer/src/db/models/ArenaFightLog.js /linhhoasu/lhs/newServer/src/handlers/account.js /linhhoasu/lhs/newServer/src/services/PlayerService.js /linhhoasu/lhs/newServer/src/app.js /linhhoasu/lhs/newServer/src/services/BattleService.js /linhhoasu/lhs/newServer/src/services/ArenaReadModelService.js /linhhoasu/lhs/newServer/src/db/models/ArenaSettlement.js /linhhoasu/webgame/game/js/lhs-arena-v1.js /linhhoasu/webgame/game/js/lhs-socket-send-v3.js /linhhoasu/webgame/game/index.html")
        print(json.dumps({"ok": True, "hostFingerprint": actual, "archiveSha256": archive_sha, "postHashes": post}, ensure_ascii=False))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
