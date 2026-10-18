"""Scoped SSH transport for the auction repair; credentials stay in existing helper."""
from pathlib import Path
import hashlib
import json
import shlex
import sys
import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config

ROOT = Path(__file__).resolve().parents[2]
TASK = ROOT / '_ai_workbench/temp/auction_20261015'
APP = '/linhhoasu/lhs/newServer'

def connect():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    args, kwargs = ssh_config()
    client.connect(*args, **kwargs)
    return client

def run(client, command, timeout=120):
    _, stdout, stderr = client.exec_command(command, timeout=timeout)
    out = stdout.read().decode('utf-8', 'replace')
    err = stderr.read().decode('utf-8', 'replace')
    rc = stdout.channel.recv_exit_status()
    if rc:
        raise RuntimeError(f'remote exit {rc}: {out}\n{err}')
    return out

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    client = connect()
    try:
        if sys.argv[1] == 'node':
            source = sys.stdin.read()
            print(run(client, 'cd ' + shlex.quote(APP) + ' && node - <<\'AUCTION_NODE\'\n' + source + '\nAUCTION_NODE'))
        elif sys.argv[1] in ('snapshot', 'snapshot-shared'):
            sftp = client.open_sftp()
            for relative in sys.argv[2:]:
                if '..' in relative.split('/') or relative.startswith('/'):
                    raise ValueError(relative)
                target = TASK / ('baseline-shared' if sys.argv[1] == 'snapshot-shared' else 'baseline') / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                remote = '/linhhoasu/webgame/game/' + relative[4:] if relative.startswith('web/') else APP + '/' + relative
                data = sftp.open(remote, 'rb').read()
                if target.exists() and target.read_bytes() != data:
                    raise RuntimeError('Baseline changed: ' + relative)
                target.write_bytes(data)
                print(json.dumps({'path': relative, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}))
        else:
            raise ValueError('Expected node or snapshot')
    finally:
        client.close()

if __name__ == '__main__':
    main()
