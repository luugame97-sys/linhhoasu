"""Deploy Xu/recharge alignment fix to WebGM with hash preconditions and rollback."""
from __future__ import annotations

import getpass
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko


HOST = "103.116.105.154"
WORKBENCH = Path(__file__).resolve().parents[1]
CANDIDATE = WORKBENCH / "temp" / "xu_recharge_alignment_candidate_20260901"
FILES = {
    "admin/admin_api.php": {
        "remote": "/linhhoasu/webgame/gm/admin/admin_api.php",
        "expected": "99596f9a1898f788423d484a2d888066b00070c3ae2b65622f6fe3229f1295c5",
    },
    "admin/index.php": {
        "remote": "/linhhoasu/webgame/gm/admin/index.php",
        "expected": "6c709ee57e6bfa90b7235951795bd52cffcff6e8b21021fdaaa08212b6968bf2",
    },
    "assets/js/admin.js": {
        "remote": "/linhhoasu/webgame/gm/assets/js/admin.js",
        "expected": "be7eadba594820f0eadad920a06c24fc5deaf079d1216d4cc24564de7e3f6d1e",
    },
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 120) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-5000:] or output[-5000:] or f"remote exit={code}")
    return output


def main() -> None:
    for relative in FILES:
        local = CANDIDATE / relative
        if not local.is_file():
            raise SystemExit(f"missing candidate: {local}")
    candidate_hashes = {relative: digest(CANDIDATE / relative) for relative in FILES}
    password = getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/webgm_xu_recharge_alignment_pre_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/webgm_xu_recharge_alignment_{stamp}"
    try:
        for relative, spec in FILES.items():
            live = run(ssh, f"sha256sum -- {shlex.quote(spec['remote'])}")
            if spec["expected"] not in live:
                raise RuntimeError(f"live hash precondition failed for {relative}: {live.strip()}")
        run(ssh, f"mkdir -p -- {shlex.quote(backup)} {shlex.quote(stage + '/admin')} {shlex.quote(stage + '/assets/js')}")
        for relative, spec in FILES.items():
            run(ssh, f"cp -a -- {shlex.quote(spec['remote'])} {shlex.quote(backup + '/' + Path(relative).name)}")
        sftp = ssh.open_sftp()
        try:
            for relative in FILES:
                remote_stage = f"{stage}/{relative}"
                sftp.put(str(CANDIDATE / relative), remote_stage)
                staged = run(ssh, f"sha256sum -- {shlex.quote(remote_stage)}")
                if candidate_hashes[relative] not in staged:
                    raise RuntimeError(f"stage hash mismatch for {relative}")
        finally:
            sftp.close()
        run(ssh, f"php -l {shlex.quote(stage + '/admin/admin_api.php')} >/dev/null")
        run(ssh, f"php -l {shlex.quote(stage + '/admin/index.php')} >/dev/null")
        for relative, spec in FILES.items():
            remote_stage = f"{stage}/{relative}"
            run(ssh, f"install -o root -g root -m 0644 -- {shlex.quote(remote_stage)} {shlex.quote(spec['remote'])}")
            after = run(ssh, f"sha256sum -- {shlex.quote(spec['remote'])}")
            if candidate_hashes[relative] not in after:
                raise RuntimeError(f"deployed hash mismatch for {relative}")
        http = run(ssh, "printf 'page='; curl -sS -o /dev/null -w '%{http_code}|%{content_type}' --max-time 15 http://127.0.0.1:88/admin/index.php; printf '\njs='; curl -sS -o /dev/null -w '%{http_code}|%{content_type}' --max-time 15 http://127.0.0.1:88/assets/js/admin.js; printf '\nready='; curl -sS -o /dev/null -w '%{http_code}' --max-time 15 http://127.0.0.1:8080/ready")
    except Exception:
        for relative, spec in FILES.items():
            try:
                run(ssh, f"test -f {shlex.quote(backup + '/' + Path(relative).name)} && cp -a -- {shlex.quote(backup + '/' + Path(relative).name)} {shlex.quote(spec['remote'])} || true")
            except Exception:
                pass
        raise
    finally:
        ssh.close()
    print(json.dumps({"result": "PASS", "backup": backup, "stage": stage,
                      "files": candidate_hashes, "http": http,
                      "restart": False}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
