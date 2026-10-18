"""Deploy the final player-tab header/help copy only; no process restart."""

import getpass
import hashlib
import json
import os
import shlex
from datetime import datetime, timezone
from pathlib import Path

import paramiko

HOST = "103.116.105.154"
ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / "temp" / "account_management_redesign_candidate_20260901" / "webgm" / "admin" / "index.php"
REMOTE = "/linhhoasu/webgame/gm/admin/index.php"
EXPECTED = "4d2d25332a67f57eec8a7bf29f12ca45015eb5e74c71322f48ce7b07e96a115b"

def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def run(ssh, cmd):
    _, out, err = ssh.exec_command(cmd, timeout=120); text=out.read().decode('utf-8','replace'); error=err.read().decode('utf-8','replace'); code=out.channel.recv_exit_status()
    if code: raise RuntimeError(error or text)
    return text

def main():
    candidate = sha(LOCAL); stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    password=os.environ.get('LHS_PROD_PASSWORD') or getpass.getpass('Production password (not logged): ')
    ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy());ssh.connect(HOST,username='root',password=password,look_for_keys=False,allow_agent=False,timeout=20)
    backup=f'/linhhoasu/_ai_workbench/backups/account_management_header_pre_{stamp}'; stage=f'/linhhoasu/_ai_workbench/temp/account_management_header_{stamp}.php'
    try:
        live=run(ssh,f'sha256sum -- {shlex.quote(REMOTE)}')
        if EXPECTED not in live: raise RuntimeError('live hash precondition failed: '+live)
        run(ssh,f'mkdir -p -- {shlex.quote(backup)} && cp -a -- {shlex.quote(REMOTE)} {shlex.quote(backup+"/index.php")}')
        sftp=ssh.open_sftp();sftp.put(str(LOCAL),stage);sftp.close()
        run(ssh,f'php -l {shlex.quote(stage)} >/dev/null')
        staged=run(ssh,f'sha256sum -- {shlex.quote(stage)}')
        if candidate not in staged: raise RuntimeError('stage hash mismatch')
        run(ssh,f'install -o root -g root -m 0644 -- {shlex.quote(stage)} {shlex.quote(REMOTE)}')
        after=run(ssh,f'sha256sum -- {shlex.quote(REMOTE)}')
        if candidate not in after: raise RuntimeError('deployed hash mismatch')
        http=run(ssh,"curl -sS -o /tmp/account-ui.$$ -w '%{http_code}|%{size_download}|%{content_type}' --max-time 15 http://127.0.0.1:88/admin/index.php; rm -f /tmp/account-ui.$$")
    except Exception:
        try: run(ssh,f'test -f {shlex.quote(backup+"/index.php")} && cp -a -- {shlex.quote(backup+"/index.php")} {shlex.quote(REMOTE)} || true')
        except Exception: pass
        raise
    finally: ssh.close()
    print(json.dumps({'result':'PASS','backup':backup,'sha256':candidate,'http':http,'restart':False},ensure_ascii=False,indent=2))

if __name__=='__main__': main()
