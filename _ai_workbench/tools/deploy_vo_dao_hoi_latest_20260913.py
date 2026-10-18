"""Deploy the latest scoped Võ Đạo Hội release with backup/CAS/ready checks."""
from __future__ import annotations
import base64, hashlib, json, sys, time
from pathlib import Path
import paramiko

HOST = "103.116.105.154"
USER = "root"
FP = "SHA256:9hrzv0d3h/tdyep0ma+RUFi99n7YGXjQt3J4fI99osQ"
ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "_ai_workbench" / "temp" / "vo_dao_hoi_latest_20260913" / "release.tar.gz"
REMOTE_ARCHIVE = "/tmp/vo_dao_hoi_latest_20260913.tar.gz"
BACKUP = "/linhhoasu/_ai_workbench/backups/vo_dao_hoi_latest_20260913_predeploy"
STAGE = "/linhhoasu/_ai_workbench/temp/vo_dao_hoi_latest_20260913_stage"
FILES = [
    "lhs/newServer/src/handlers/arena.js",
    "lhs/newServer/src/handlers/account.js",
    "lhs/newServer/src/services/RankService.js",
    "lhs/newServer/src/services/ArenaReadModelService.js",
    "lhs/newServer/src/services/ArenaSettlementService.js",
    "lhs/newServer/src/services/BattleService.js",
    "lhs/newServer/src/services/PlayerService.js",
    "lhs/newServer/src/services/PlayerMutationService.js",
    "lhs/newServer/src/services/RoleAppearanceService.js",
    "lhs/newServer/src/app.js",
    "lhs/newServer/src/db/models/ArenaFightLog.js",
    "lhs/newServer/src/db/models/ArenaSettlement.js",
    "lhs/newServer/src/db/models/Player.js",
    "webgame/game/index.html",
    "webgame/game/js/lhs-arena-v1.js",
    "webgame/game/js/lhs-socket-send-v3.js",
]
# CAS only for files observed during the pre-deploy inventory. Files omitted
# by the old inventory helper are still backed up immediately before copy.
EXPECTED = {
    "lhs/newServer/src/handlers/arena.js": "42d19affd403a5b6b459d783039f51650bc99c9542c49235976e06c3651dce73",
    "lhs/newServer/src/handlers/account.js": "0152e767495cb9e60638a7ab6a84e6ed825a61014c17cd5e595f1f2966c54fd3",
    "lhs/newServer/src/services/RankService.js": "8e7431e6a41d0cba2ade7b93030d581210a6ff5de7d2abc62c3fc2f2cb936520",
    "lhs/newServer/src/services/BattleService.js": "1416b1270726acbd3afb7ea07d34f5cae99763611a025cc093967b0d96b3e484",
    "lhs/newServer/src/services/PlayerService.js": "aa668a82904c08819078a8e418cd6a0940a43cfabf568c48a8646d5043b5944b",
    "lhs/newServer/src/services/PlayerMutationService.js": "2a408d0bd1708c633f8b4f7ca410e53cc08dc6780ea7221642d5d5e84420bd78",
    "lhs/newServer/src/services/RoleAppearanceService.js": "ac13870e55cde4c7a769a508ba231df3457af15e9a8587e36f38c37f673451f4",
    "lhs/newServer/src/app.js": "c2fc0cd67c3475f0f2339ebfafb2f9fa29587ff3845702307e6313bbfeca944e",
    "lhs/newServer/src/db/models/ArenaFightLog.js": "99260e58ea153a5fbfdc127cc09a4585fa23c3f13abb8b4df6a6913f3109c583",
    "lhs/newServer/src/db/models/Player.js": "d00e8fab9d3eaf9cb02dbdeb4fe60bd521351e0412d342113b1862785f44b536",
    "webgame/game/index.html": "6920040a73976b75ddc3948e209110e497e40cbd1eb0de8a1b4d086d88c3890e",
    "webgame/game/js/lhs-arena-v1.js": "3f390d95a5bc6845a56bedc0ababb7af31cf63354877da1ea353359bb1ee0352",
}

class Pinned(paramiko.MissingHostKeyPolicy):
    def missing_host_key(self, client, hostname, key):
        fingerprint = "SHA256:" + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")
        if hostname != HOST or fingerprint != FP:
            raise RuntimeError("SSH_HOST_KEY_MISMATCH")

def run(ssh, command, timeout=120):
    _stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(f"remote exit {code}: {err[-2000:]}")
    return out.strip()

def main():
    if not ARCHIVE.exists(): raise SystemExit(f"archive missing: {ARCHIVE}")
    password = sys.stdin.readline().rstrip("\r\n")
    if not password: raise SystemExit("password missing on stdin")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(Pinned())
    ssh.connect(HOST, username=USER, password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        key = ssh.get_transport().get_remote_server_key()
        actual = "SHA256:" + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")
        if actual != FP: raise RuntimeError(f"host fingerprint mismatch: {actual}")
        remote_paths = [f"/linhhoasu/{p}" for p in FILES]
        pre = run(ssh, "sha256sum " + " ".join(remote_paths))
        pre_map = {line.split()[1].replace("/linhhoasu/", "", 1): line.split()[0]
                   for line in pre.splitlines() if len(line.split()) >= 2}
        for rel, expected in EXPECTED.items():
            got = pre_map.get(rel, "")
            if got.lower() != expected.lower():
                raise RuntimeError(f"CAS mismatch {rel}: {got} != {expected}")
        run(ssh, f"mkdir -p {BACKUP}")
        for rel in FILES:
            run(ssh, f"cp -a /linhhoasu/{rel} {BACKUP}/{Path(rel).name}.before")
        run(ssh, f"sha256sum {BACKUP}/*.before > {BACKUP}/SHA256.before")
        sftp = ssh.open_sftp()
        try: sftp.put(str(ARCHIVE), REMOTE_ARCHIVE)
        finally: sftp.close()
        run(ssh, f"rm -rf {STAGE}; mkdir -p {STAGE}; tar -xzf {REMOTE_ARCHIVE} -C {STAGE}")
        stage_paths = [f"{STAGE}/{p}" for p in FILES]
        run(ssh, "node --check " + " ".join(stage_paths), timeout=120)
        for rel in FILES:
            run(ssh, f"cp -a {STAGE}/{rel} /linhhoasu/{rel}")
        run(ssh, "pm2 restart lhs-s1002", timeout=120)
        run(ssh, "for i in $(seq 1 30); do curl -fsS --max-time 2 http://127.0.0.1:8083/ready >/tmp/lhs_ready2 && break; sleep 1; done; test -s /tmp/lhs_ready2")
        run(ssh, "pm2 restart lhs-s1001", timeout=120)
        run(ssh, "for i in $(seq 1 30); do curl -fsS --max-time 2 http://127.0.0.1:8080/ready >/tmp/lhs_ready1 && break; sleep 1; done; test -s /tmp/lhs_ready1")
        post = run(ssh, "sha256sum " + " ".join(remote_paths))
        pm2 = run(ssh, "pm2 jlist | node -e 'let s=\"\";process.stdin.on(\"data\",c=>s+=c);process.stdin.on(\"end\",()=>console.log(JSON.stringify(JSON.parse(s).filter(x=>[\"lhs-s1001\",\"lhs-s1002\"].includes(x.name)).map(x=>({name:x.name,pid:x.pid,restarts:x.pm2_env.restart_time,status:x.pm2_env.status})))));'")
        result = {"ok": True, "hostFingerprint": actual, "archiveSha256": hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(),
                  "ready1": run(ssh, "cat /tmp/lhs_ready1"), "ready2": run(ssh, "cat /tmp/lhs_ready2"),
                  "pm2": pm2, "postHashes": post, "backup": BACKUP}
        print(json.dumps(result, ensure_ascii=False))
    finally:
        ssh.close()

if __name__ == "__main__": main()
