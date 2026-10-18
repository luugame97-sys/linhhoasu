"""Rollback the marquee feature to the exact pre-marquee production snapshot."""
from __future__ import annotations

import getpass
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko

HOST = "103.116.105.154"
BACKUP = "/linhhoasu/_ai_workbench/backups/marquee_broadcast_pre_20260901_153303"
ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT / "temp/marquee_broadcast_candidate_20260901"

FILES = {
    "game/chat.js": {
        "remote": "/linhhoasu/lhs/newServer/src/handlers/chat.js",
        "backup": f"{BACKUP}/game/chat.js",
        "pre_hash": "edd5fe8eedf1298cd059443b42ccbd5828452292810ad6fcbe89979408384984",
        "post_hashes": {
            "618f77ddf073947187786b2cb19ab1ea3f34e3244177c1dc964f26322fc45f1d",
            "b29c61c491a505fc49ee5f838e1cceed2ed065b72833dfc45dd57f6a0c0a8c50",
        },
    },
    "game/HTTPServer.js": {
        "remote": "/linhhoasu/lhs/newServer/src/net/HTTPServer.js",
        "backup": f"{BACKUP}/game/HTTPServer.js",
        "pre_hash": "cbefaa1dbdba23f80b63d8e1ae7ffc46b5056359c1a9cce306de909f1929d6ae",
        "post_hashes": {
            "d291054adbda5ceb0e43053e0012669c6a38c325e8ff18b347635f584a1916cf",
            "0b089fec30460c1962563e2271657aad7eb43bbb089f791fafb30774d272d6d2",
        },
    },
    "game/WSServer.js": {
        "remote": "/linhhoasu/lhs/newServer/src/net/WSServer.js",
        "backup": f"{BACKUP}/game/WSServer.js",
        "pre_hash": "9c7e82f49fdbc13934b4262da00823bf7b9f91a5b64a7b70fd910c535269cc8f",
        "post_hashes": {"7b38a58023e8ce09e3a858d3a46d7d74c499f52eb39f304b2846444581a31ca1"},
    },
    "webgm/config.php": {
        "remote": "/linhhoasu/webgame/gm/config.php",
        "backup": f"{BACKUP}/webgm/config.php",
        "pre_hash": "14fd6fc65762065f3059833d9713b310011475e3125484e8536ff2b824614d22",
        "post_hashes": {"9f1769a9b55b813f6d1a5101174e85c1de0643ee63ba56dfa6d9f40d1e3570c8"},
    },
    "webgm/admin/admin_api.php": {
        "remote": "/linhhoasu/webgame/gm/admin/admin_api.php",
        "backup": f"{BACKUP}/webgm/admin/admin_api.php",
        "pre_hash": "f1e2846c53aa015b72013cf9a56ffac174494a91ccabc17b40bc39bd666676d6",
        "post_hashes": {"b90c0b1572d79e79f10a42615981564ca3a8ada73d242d60de4f07d3ff8cfb48"},
    },
    "webgm/admin/index.php": {
        "remote": "/linhhoasu/webgame/gm/admin/index.php",
        "backup": f"{BACKUP}/webgm/admin/index.php",
        "pre_hash": "a95b170bb2c58d0c801c32a38ed67350913e05694700711daee909c9f5b70d42",
        "post_hashes": {"57cbcccd2dd222ed343e609055de0448a28a2191b3e5282743e61fd1009e100b"},
    },
    "webgm/assets/js/admin.js": {
        "remote": "/linhhoasu/webgame/gm/assets/js/admin.js",
        "backup": f"{BACKUP}/webgm/assets/js/admin.js",
        "pre_hash": "ee399762e29789f1f7bab87e7f2166992b9dac5c54fc3e8815fca15cb50bdc29",
        "post_hashes": {"f1ea040522aac0c6b77dd4aa252453ad8bdcb7d18c57e2688b8bf5fc2e84dd1f"},
    },
}


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 180) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-6000:] or out[-6000:] or f"remote exit={code}")
    return out


def local_sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    password = getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    rollback_backup = f"/linhhoasu/_ai_workbench/backups/marquee_rollback_before_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/marquee_rollback_{stamp}"
    swapped: list[tuple[str, str]] = []
    try:
        run(ssh, f"mkdir -p -- {shlex.quote(rollback_backup)} {shlex.quote(stage + '/game')} {shlex.quote(stage + '/webgm/admin')} {shlex.quote(stage + '/webgm/assets/js')}")
        for key, spec in FILES.items():
            current = run(ssh, f"sha256sum -- {shlex.quote(spec['remote'])}").split()[0]
            backup_hash = run(ssh, f"sha256sum -- {shlex.quote(spec['backup'])}").split()[0]
            if backup_hash != spec["pre_hash"]:
                raise RuntimeError(f"backup hash mismatch {key}: {backup_hash}")
            if current == spec["pre_hash"]:
                continue
            if current not in spec["post_hashes"]:
                raise RuntimeError(f"live hash precondition failed {key}: {current}")
            run(ssh, f"mkdir -p -- {shlex.quote(rollback_backup + '/' + key.rsplit('/', 1)[0])}")
            run(ssh, f"cp -a -- {shlex.quote(spec['remote'])} {shlex.quote(rollback_backup + '/' + key)}")
            run(ssh, f"cp -a -- {shlex.quote(spec['backup'])} {shlex.quote(stage + '/' + key)}")

        # Verify staged files and static syntax before any swap.
        run(ssh, f"cd /linhhoasu/lhs/newServer && node --check {shlex.quote(stage + '/game/chat.js')} && node --check {shlex.quote(stage + '/game/HTTPServer.js')} && node --check {shlex.quote(stage + '/game/WSServer.js')}")
        run(ssh, f"php -l {shlex.quote(stage + '/webgm/config.php')} >/dev/null && php -l {shlex.quote(stage + '/webgm/admin/admin_api.php')} >/dev/null && php -l {shlex.quote(stage + '/webgm/admin/index.php')} >/dev/null")

        for key, spec in FILES.items():
            current = run(ssh, f"sha256sum -- {shlex.quote(spec['remote'])}").split()[0]
            if current == spec["pre_hash"]:
                continue
            run(ssh, f"install -o root -g root -m 0644 -- {shlex.quote(stage + '/' + key)} {shlex.quote(spec['remote'])}")
            swapped.append((key, spec["remote"]))
            deployed = run(ssh, f"sha256sum -- {shlex.quote(spec['remote'])}").split()[0]
            if deployed != spec["pre_hash"]:
                raise RuntimeError(f"rollback hash mismatch {key}: {deployed}")

        run(ssh, "cd /linhhoasu/lhs/newServer && node -e \"require('./src/handlers/chat');require('./src/net/HTTPServer');require('./src/net/WSServer');console.log('REQUIRE_OK')\"")
        run(ssh, "pm2 restart lhs-s1001 --update-env >/dev/null && pm2 save >/dev/null", 240)
        health = run(ssh, "for i in $(seq 1 40); do h=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); w=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:9200/health || true); [ \"$h|$w\" = \"200|200\" ] && { echo \"ready=$h ws=$w\"; exit 0; }; sleep 1; done; exit 1", 240).strip()
        markers = run(ssh, "grep -aEi 'broadcast/marquee|MARQUEE_|buildMarqueeMarkup|_marqueeTimers|msgType: 16' /linhhoasu/lhs/newServer/src/handlers/chat.js /linhhoasu/lhs/newServer/src/net/HTTPServer.js /linhhoasu/lhs/newServer/src/net/WSServer.js /linhhoasu/webgame/gm/config.php /linhhoasu/webgame/gm/admin/admin_api.php /linhhoasu/webgame/gm/admin/index.php /linhhoasu/webgame/gm/assets/js/admin.js || true").strip()
        pm2 = run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{const n=[\"lhs-s1001\",\"lhs-dist\",\"lhs-admin\",\"lhs-real-bots\"];console.log(JSON.stringify(JSON.parse(s).filter(x=>n.includes(x.name)).map(x=>({name:x.name,pid:x.pid,status:x.pm2_env&&x.pm2_env.status,restarts:x.pm2_env&&x.pm2_env.restart_time}))))})'").strip()
    except Exception:
        for key, remote in reversed(swapped):
            spec = FILES[key]
            try:
                run(ssh, f"cp -a -- {shlex.quote(rollback_backup + '/' + key)} {shlex.quote(remote)}")
            except Exception:
                pass
        if swapped:
            try:
                run(ssh, "pm2 restart lhs-s1001 --update-env >/dev/null", 240)
            except Exception:
                pass
        raise
    finally:
        ssh.close()

    result = {"result": "PASS", "host": HOST, "restored": [key for key, _ in swapped],
              "preHashes": {key: spec["pre_hash"] for key, spec in FILES.items()},
              "rollbackBackup": rollback_backup, "health": health,
              "markers": markers, "pm2": json.loads(pm2), "restart": ["lhs-s1001"]}
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
