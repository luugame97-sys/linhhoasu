"""Deploy the final TextFlow-compatible marquee encoder only."""
from __future__ import annotations

import getpass
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko

HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / "temp/marquee_broadcast_candidate_20260901/game/chat.js"
REMOTE = "/linhhoasu/lhs/newServer/src/handlers/chat.js"
EXPECTED = "618f77ddf073947187786b2cb19ab1ea3f34e3244177c1dc964f26322fc45f1d"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 180) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-5000:] or out[-5000:] or f"remote exit={code}")
    return out


def main() -> None:
    target_hash = sha(LOCAL)
    password = getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/marquee_textflow_pre_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/marquee_textflow_{stamp}.js"
    swapped = False
    try:
        live = run(ssh, f"sha256sum -- {shlex.quote(REMOTE)}").split()[0]
        if live != EXPECTED:
            raise RuntimeError(f"hash precondition failed: {live}")
        run(ssh, f"mkdir -p -- {shlex.quote(backup)} && cp -a -- {shlex.quote(REMOTE)} {shlex.quote(backup + '/chat.js')}")
        sftp = ssh.open_sftp()
        try:
            sftp.put(str(LOCAL), stage)
        finally:
            sftp.close()
        run(ssh, f"node --check {shlex.quote(stage)}")
        if run(ssh, f"sha256sum -- {shlex.quote(stage)}").split()[0] != target_hash:
            raise RuntimeError("stage hash mismatch")
        run(ssh, f"install -o root -g root -m 0644 -- {shlex.quote(stage)} {shlex.quote(REMOTE)}")
        swapped = True
        run(ssh, "cd /linhhoasu/lhs/newServer && node -e \"const c=require('./src/handlers/chat');const m=c.buildMarqueeMarkup('QA',{color:'#12abef',size:32});if(!m.startsWith('|C:0x12ABEF&S:32'))process.exit(2);console.log('TEXTFLOW_OK')\"")
        run(ssh, "pm2 restart lhs-s1001 --update-env >/dev/null && pm2 save >/dev/null", 240)
        health = run(ssh, "for i in $(seq 1 40); do h=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready || true); w=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:9200/health || true); [ \"$h|$w\" = \"200|200\" ] && { echo \"ready=$h ws=$w\"; exit 0; }; sleep 1; done; exit 1", 240).strip()
        final_hash = run(ssh, f"sha256sum -- {shlex.quote(REMOTE)}").split()[0]
        if final_hash != target_hash:
            raise RuntimeError("final hash mismatch")
    except Exception:
        if swapped:
            try:
                run(ssh, f"cp -a -- {shlex.quote(backup + '/chat.js')} {shlex.quote(REMOTE)}")
                run(ssh, "pm2 restart lhs-s1001 --update-env >/dev/null", 240)
            except Exception:
                pass
        raise
    finally:
        ssh.close()
    print(json.dumps({"result": "PASS", "backup": backup, "hash": target_hash,
                      "health": health, "restart": ["lhs-s1001"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
