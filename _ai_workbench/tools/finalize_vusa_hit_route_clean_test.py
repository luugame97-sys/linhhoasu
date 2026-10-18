"""Remove only the diagnostic proof from the test index, keeping exact VUSA hit-route guard."""
from __future__ import annotations

import getpass
import hashlib
import json
import posixpath
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko

HOST = "192.168.200.151"
ROOT = Path(__file__).resolve().parents[2]
CLEAN = ROOT / "_ai_workbench/temp/vusa_hit_route_v6_candidate_20260901/index.html"
REMOTE = "/linhhoasu/webgame/game/index.html"
EXPECTED_PROOF = "a06a7551d2716f01d9092fe58cc80823c3925dbfb5d6ed43028bc16512c8a26e"
EXPECTED_CLEAN = "b55d61265f9e32e5a31ea85e4352dd0f790abec53d0fcac028edcd705c6d9d61"


def q(value: str) -> str:
    return shlex.quote(value)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh: paramiko.SSHClient, command: str, timeout: int = 90) -> str:
    _, out, err = ssh.exec_command(command, timeout=timeout)
    text = out.read().decode("utf-8", "replace")
    error = err.read().decode("utf-8", "replace")
    code = out.channel.recv_exit_status()
    if code:
        raise RuntimeError(error[-4000:] or text[-4000:] or f"remote exit {code}")
    return text


def main() -> None:
    clean_hash = sha(CLEAN)
    if clean_hash != EXPECTED_CLEAN:
        raise RuntimeError(f"clean candidate hash mismatch: {clean_hash}")
    password = getpass.getpass("Test VPS password (not logged): ")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/vusa_hit_route_proof_cleanup_pre_{stamp}"
    stage = REMOTE + f".clean-{stamp}.html"
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False, allow_agent=False,
                timeout=20, banner_timeout=20, auth_timeout=20)
    try:
        current = run(ssh, f"sha256sum -- {q(REMOTE)} | awk '{{print $1}}'").strip().lower()
        if current == EXPECTED_CLEAN:
            print(json.dumps({"result":"already_clean","host":HOST,"sha256":current},indent=2))
            return
        if current != EXPECTED_PROOF:
            raise RuntimeError(f"proof index precondition changed: {current}")
        run(ssh, f"set -eu; mkdir -p {q(backup)}; cp -p {q(REMOTE)} {q(backup + '/index.html')}")
        sftp = ssh.open_sftp()
        try: sftp.put(str(CLEAN), stage)
        finally: sftp.close()
        if run(ssh, f"sha256sum -- {q(stage)} | awk '{{print $1}}'").strip().lower() != clean_hash:
            raise RuntimeError("staged clean index hash mismatch")
        run(ssh, f"mv -f -- {q(stage)} {q(REMOTE)}")
        live = run(ssh, f"sha256sum -- {q(REMOTE)} | awk '{{print $1}}'").strip().lower()
        if live != clean_hash:
            run(ssh, f"cp -p {q(backup + '/index.html')} {q(REMOTE)}")
            raise RuntimeError("clean index readback mismatch; restored proof index")
        served = run(ssh, "curl -sS --max-time 20 http://127.0.0.1:81/")
        if "__lhsMainHitRouteV6Bootstrap" not in served or "__lhsHitRouteProofV1" in served:
            run(ssh, f"cp -p {q(backup + '/index.html')} {q(REMOTE)}")
            raise RuntimeError("served clean-index markers invalid; restored proof index")
        ready = run(ssh, "curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8080/ready").strip()
        print(json.dumps({"result":"ok","host":HOST,"backup":backup,"sha256":live,"ready":ready,"backendRestarted":False,"proofRemoved":True},ensure_ascii=False,indent=2))
    finally:
        if ssh.get_transport() and ssh.get_transport().is_active(): run(ssh, f"rm -f -- {q(stage)}", timeout=30)
        ssh.close()


if __name__ == "__main__":
    main()
