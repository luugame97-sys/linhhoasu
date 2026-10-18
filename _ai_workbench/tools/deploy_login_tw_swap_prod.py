"""Deploy login background mapping swap with backup and compare-and-swap."""
from __future__ import annotations

import getpass
import hashlib
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko

HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT / "temp/login_tw_swap_candidate_20260902/start.min_52ac8d58.js"
REMOTE_START = "/linhhoasu/webgame/game/js/start.min_52ac8d58.js"
REMOTE_INDEX = "/linhhoasu/webgame/game/index.html"
EXPECTED_START = "e822365fca7b7380e60c0c80025d8efaeb798b19543067a609d0117a25ec9e24"
EXPECTED_INDEX = "f6e4751eb14385ccdc0d5f6e2e2b4a8b1fcd65b715a94b1ad751119c5ff7bc7b"
OLD_TOKEN = "20260831_tien_duyen_fix_v1"
NEW_TOKEN = "20260902_login_tw_swap_v1"
OLD_MAPPING = 'r=d.inChina?"login_bg":"login_bg_tw"'
NEW_MAPPING = 'r=d.inChina?"login_bg_tw":"login_bg"'


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 180) -> str:
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(err[-6000:] or out[-6000:] or f"remote exit={code}")
    return out


def main() -> None:
    candidate_hash = sha(CANDIDATE)
    candidate_text = CANDIDATE.read_text(encoding="utf-8")
    if candidate_text.count(NEW_MAPPING) != 1 or OLD_MAPPING in candidate_text:
        raise RuntimeError("Candidate mapping is not an exact one-string swap")

    password = getpass.getpass("Production password (not logged): ")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/login_tw_swap_pre_{stamp}"
    stage_start = f"/linhhoasu/_ai_workbench/temp/login_tw_swap_{stamp}.js"
    stage_index = f"/linhhoasu/_ai_workbench/temp/login_tw_swap_{stamp}.html"
    swapped = []
    try:
        live_start = run(ssh, f"sha256sum -- {shlex.quote(REMOTE_START)}").split()[0]
        live_index = run(ssh, f"sha256sum -- {shlex.quote(REMOTE_INDEX)}").split()[0]
        if live_start != EXPECTED_START:
            raise RuntimeError(f"start hash precondition failed: {live_start}")
        if live_index != EXPECTED_INDEX:
            raise RuntimeError(f"index hash precondition failed: {live_index}")
        run(ssh, f"mkdir -p -- {shlex.quote(backup)}")
        run(ssh, f"cp -a -- {shlex.quote(REMOTE_START)} {shlex.quote(backup + '/start.min_52ac8d58.js')}")
        run(ssh, f"cp -a -- {shlex.quote(REMOTE_INDEX)} {shlex.quote(backup + '/index.html')}")
        sftp = ssh.open_sftp()
        try:
            sftp.put(str(CANDIDATE), stage_start)
            remote_index_text = sftp.file(REMOTE_INDEX, "r").read().decode("utf-8")
        finally:
            sftp.close()
        index_count = remote_index_text.count(OLD_TOKEN)
        if index_count != 2:
            raise RuntimeError(f"index cache token occurrences expected 2, got {index_count}")
        index_candidate = remote_index_text.replace(OLD_TOKEN, NEW_TOKEN)
        if OLD_TOKEN in index_candidate or index_candidate.count(NEW_TOKEN) != 2:
            raise RuntimeError("index cache token replacement failed")
        Path("_ai_workbench/temp/login_tw_swap_candidate_20260902/index.html").write_text(index_candidate, encoding="utf-8", newline="")
        sftp = ssh.open_sftp()
        try:
            sftp.put("_ai_workbench/temp/login_tw_swap_candidate_20260902/index.html", stage_index)
        finally:
            sftp.close()
        run(ssh, f"node --check {shlex.quote(stage_start)}")
        run(ssh, f"test -s {shlex.quote(stage_index)}")
        if run(ssh, f"sha256sum -- {shlex.quote(stage_start)}").split()[0] != candidate_hash:
            raise RuntimeError("staged start hash mismatch")
        run(ssh, f"install -o root -g root -m 0644 -- {shlex.quote(stage_start)} {shlex.quote(REMOTE_START)}")
        swapped.append(("start.min_52ac8d58.js", REMOTE_START))
        run(ssh, f"install -o root -g root -m 0644 -- {shlex.quote(stage_index)} {shlex.quote(REMOTE_INDEX)}")
        swapped.append(("index.html", REMOTE_INDEX))
        final_start = run(ssh, f"sha256sum -- {shlex.quote(REMOTE_START)}").split()[0]
        final_index = run(ssh, f"sha256sum -- {shlex.quote(REMOTE_INDEX)}").split()[0]
        if final_start != candidate_hash:
            raise RuntimeError(f"deployed start hash mismatch: {final_start}")
        if OLD_TOKEN in run(ssh, f"grep -aF -- {shlex.quote(OLD_TOKEN)} {shlex.quote(REMOTE_INDEX)} || true"):
            raise RuntimeError("old cache token remains in live index")
        http = run(ssh, "printf 'index='; curl -sS -o /tmp/lhs_tw_index -w '%{http_code}' --max-time 10 http://127.0.0.1:81/; printf ' start='; curl -sS -o /tmp/lhs_tw_start -w '%{http_code}' --max-time 10 http://127.0.0.1:81/js/start.min_52ac8d58.js?v=20260902_login_tw_swap_v1; printf ' asset='; curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:81/update/resource/assets/game_start/login_bg_tw_8d2e3139.jpg; echo; grep -aF '20260902_login_tw_swap_v1' /tmp/lhs_tw_index | head -n 2 || true; rm -f /tmp/lhs_tw_index /tmp/lhs_tw_start").strip()
    except Exception:
        for _, remote in reversed(swapped):
            backup_name = "start.min_52ac8d58.js" if remote == REMOTE_START else "index.html"
            try:
                run(ssh, f"cp -a -- {shlex.quote(backup + '/' + backup_name)} {shlex.quote(remote)}")
            except Exception:
                pass
        raise
    finally:
        ssh.close()
    print({"result": "PASS", "backup": backup, "candidateStartHash": candidate_hash,
           "deployedStartHash": final_start, "deployedIndexHash": final_index,
           "http": http, "restart": []})


if __name__ == "__main__":
    main()
