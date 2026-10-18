"""Deploy read-only player lock reporting UI to WebGM with rollback."""
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
CANDIDATE = ROOT / "temp" / "webgm_player_lock_report_candidate_20260901"
FILES = {
    "admin/admin_api.php": ("/linhhoasu/webgame/gm/admin/admin_api.php", "601227c6ec35ff4fc5c1ece536548454546a1887f17857d66581b4358b47b212"),
    "admin/index.php": ("/linhhoasu/webgame/gm/admin/index.php", "02480d5b70e581661a2594dd68fd62b5acd5004378476f4cf4fc5438bd549f80"),
    "assets/js/admin.js": ("/linhhoasu/webgame/gm/assets/js/admin.js", "d8e6c4c972b4b372af23dfcaed9082ebd5eb3dbd1fc2491cce5faf2497c9c397"),
}


def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()


def run(ssh, cmd, timeout=120):
    _, o, e = ssh.exec_command(cmd, timeout=timeout)
    out=o.read().decode('utf-8','replace'); err=e.read().decode('utf-8','replace'); code=o.channel.recv_exit_status()
    if code: raise RuntimeError(err[-5000:] or out[-5000:] or f'exit={code}')
    return out


def main():
    hashes={rel:sha(CANDIDATE/rel) for rel in FILES}
    password=getpass.getpass('Production password (not logged): ')
    ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy());ssh.connect(HOST,username='root',password=password,look_for_keys=False,allow_agent=False,timeout=20,banner_timeout=20,auth_timeout=20)
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup=f'/linhhoasu/_ai_workbench/backups/webgm_player_lock_report_pre_{stamp}';stage=f'/linhhoasu/_ai_workbench/temp/webgm_player_lock_report_{stamp}'
    try:
        for rel,(remote,expected) in FILES.items():
            live=run(ssh,f'sha256sum -- {shlex.quote(remote)}')
            if expected not in live: raise RuntimeError(f'hash precondition failed {rel}: {live.strip()}')
        run(ssh,f"mkdir -p -- {shlex.quote(backup)} {shlex.quote(stage+'/admin')} {shlex.quote(stage+'/assets/js')}")
        for rel,(remote,_) in FILES.items(): run(ssh,f"cp -a -- {shlex.quote(remote)} {shlex.quote(backup+'/'+Path(rel).name)}")
        sftp=ssh.open_sftp()
        try:
            for rel in FILES: sftp.put(str(CANDIDATE/rel),f'{stage}/{rel}')
        finally:sftp.close()
        run(ssh,f"php -l {shlex.quote(stage+'/admin/admin_api.php')} >/dev/null; php -l {shlex.quote(stage+'/admin/index.php')} >/dev/null")
        for rel,(remote,_) in FILES.items():
            staged=run(ssh,f"sha256sum -- {shlex.quote(stage+'/'+rel)}")
            if hashes[rel] not in staged: raise RuntimeError('stage hash mismatch '+rel)
            run(ssh,f"install -o root -g root -m 0644 -- {shlex.quote(stage+'/'+rel)} {shlex.quote(remote)}")
            after=run(ssh,f"sha256sum -- {shlex.quote(remote)}")
            if hashes[rel] not in after: raise RuntimeError('deploy hash mismatch '+rel)
        http=run(ssh,"printf 'admin='; curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:88/admin/index.php; printf '\njs='; curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:88/assets/js/admin.js; printf '\nready='; curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/ready")
    except Exception:
        for rel,(remote,_) in FILES.items():
            try:run(ssh,f"test -f {shlex.quote(backup+'/'+Path(rel).name)} && cp -a -- {shlex.quote(backup+'/'+Path(rel).name)} {shlex.quote(remote)} || true")
            except Exception:pass
        raise
    finally:ssh.close()
    print(json.dumps({'result':'PASS','backup':backup,'stage':stage,'hashes':hashes,'http':http,'restart':False},ensure_ascii=False,indent=2))


if __name__=='__main__':main()
