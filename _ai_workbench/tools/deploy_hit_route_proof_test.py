"""Deploy read-only hit-route proof index on the isolated VPS test."""
from __future__ import annotations

import getpass
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
import paramiko

HOST = "192.168.200.151"
ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / "_ai_workbench/temp/vusa_hit_route_v6_proof_candidate_20260901/index.html"
REMOTE = "/linhhoasu/webgame/game/index.html"
EXPECTED = "b55d61265f9e32e5a31ea85e4352dd0f790abec53d0fcac028edcd705c6d9d61"


def q(v: str) -> str: return shlex.quote(v)
def sha(path: Path) -> str: return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh, cmd, timeout=90):
    _, out, err = ssh.exec_command(cmd, timeout=timeout)
    text = out.read().decode('utf-8', 'replace'); error = err.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if code: raise RuntimeError(error[-4000:] or text[-4000:] or f'remote exit {code}')
    return text


def main():
    wanted = sha(LOCAL); password = getpass.getpass('Test VPS password (not logged): ')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/hit_route_proof_pre_{stamp}'
    stage = REMOTE + f'.proof-{stamp}.html'
    ssh = paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=20)
    try:
        current = run(ssh, f"sha256sum -- {q(REMOTE)} | awk '{{print $1}}'").strip().lower()
        if current != EXPECTED: raise RuntimeError(f'index precondition changed: {current}')
        run(ssh, f"mkdir -p {q(backup)}; cp -p {q(REMOTE)} {q(backup + '/index.html')}")
        sftp = ssh.open_sftp()
        try: sftp.put(str(LOCAL), stage)
        finally: sftp.close()
        if run(ssh, f"sha256sum -- {q(stage)} | awk '{{print $1}}'").strip().lower() != wanted:
            raise RuntimeError('staged hash mismatch')
        run(ssh, f"mv -f -- {q(stage)} {q(REMOTE)}")
        served = run(ssh, 'curl -sS --max-time 20 http://127.0.0.1:81/')
        if '__lhsHitRouteProofV1' not in served or '__lhsMainHitRouteV6Bootstrap' not in served:
            run(ssh, f"cp -p {q(backup + '/index.html')} {q(REMOTE)}")
            raise RuntimeError('served proof markers missing; rolled back')
        print(json.dumps({'result':'ok','host':HOST,'backup':backup,'sha256':wanted,'backendRestarted':False},indent=2))
    finally:
        if ssh.get_transport() and ssh.get_transport().is_active(): run(ssh, f"rm -f -- {q(stage)}")
        ssh.close()


if __name__ == '__main__': main()
