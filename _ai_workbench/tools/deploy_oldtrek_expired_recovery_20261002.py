from __future__ import annotations

import datetime as dt
import hashlib
import json
import shlex
import time
from pathlib import Path

import paramiko

from rollback_role_lian_manifest_20260930 import ssh_config

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / '_ai_workbench/temp/oldtrek_expired_candidate_20261002/server/old-trek.js'
REMOTE = '/linhhoasu/lhs/newServer/src/handlers/old-trek.js'
EXPECTED = '11ec6b244149889d37e8fbd19db2769c4bdd6f8bb525637b6c57854aa09c7b21'
NODES = {'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085, 'lhs-s1005': 8086, 'lhs-s1006': 8087}
OUT = ROOT / '_ai_workbench/temp/oldtrek_expired_release_20261002'


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    payload = LOCAL.read_bytes()
    after = sha(payload)
    if b'recoverExpiredMiniGame' not in payload:
        raise RuntimeError('CANDIDATE_MARKER_MISSING')
    args, kwargs = ssh_config()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()
    stamp = dt.datetime.now().strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/oldtrek_expired_recovery_{stamp}'
    stage = REMOTE + '.expired_' + stamp + '.js'
    report = {
        'at': dt.datetime.now(dt.timezone.utc).isoformat(),
        'backupDir': backup,
        'productionPlayerWrites': 0,
        'before': EXPECTED,
        'after': after,
        'restarts': [],
    }

    def run(command: str, timeout: int = 55) -> str:
        _, out, err = client.exec_command(command, timeout=timeout)
        text = out.read().decode('utf-8', 'replace')
        error = err.read().decode('utf-8', 'replace')
        rc = out.channel.recv_exit_status()
        if rc:
            raise RuntimeError(f'REMOTE({rc}):{error[-1000:]}')
        return text.strip()

    def remote_hash(path: str) -> str:
        return sha(sftp.open(path, 'rb').read())

    def ready(name: str) -> dict:
        deadline = time.monotonic() + 60
        while True:
            try:
                value = json.loads(run(f'curl --max-time 5 -fsS http://127.0.0.1:{NODES[name]}/ready', 8))
                if value.get('status') == 'ok' and value.get('checks', {}).get('mongo') is True and value.get('checks', {}).get('redis') is True:
                    return value
            except Exception:
                pass
            if time.monotonic() > deadline:
                raise RuntimeError('READY:' + name)
            time.sleep(1)

    swapped = False
    try:
        if remote_hash(REMOTE) != EXPECTED:
            raise RuntimeError('CAS:' + remote_hash(REMOTE))
        run('mkdir -m 700 -- ' + shlex.quote(backup))
        run('cp -p -- ' + shlex.quote(REMOTE) + ' ' + shlex.quote(backup + '/old-trek.js'))
        if remote_hash(backup + '/old-trek.js') != EXPECTED:
            raise RuntimeError('BACKUP_HASH_MISMATCH')
        run('node --check ' + shlex.quote(REMOTE))
        sftp.put(str(LOCAL), stage)
        run('chmod 644 -- ' + shlex.quote(stage))
        run('node --check ' + shlex.quote(stage))
        if remote_hash(stage) != after:
            raise RuntimeError('STAGE_HASH_MISMATCH')
        if remote_hash(REMOTE) != EXPECTED:
            raise RuntimeError('CAS_BEFORE_SWAP')
        run('mv -f -- ' + shlex.quote(stage) + ' ' + shlex.quote(REMOTE))
        if remote_hash(REMOTE) != after:
            raise RuntimeError('LIVE_HASH_MISMATCH')
        swapped = True
        for name in NODES:
            run('pm2 restart ' + shlex.quote(name) + ' --update-env')
            report['restarts'].append({'name': name, 'ready': ready(name)})
        report['postReady'] = {name: ready(name) for name in NODES}
        report['result'] = 'DEPLOYED'
        report['completedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
    except Exception as exc:
        report['result'] = 'FAILED'
        report['error'] = str(exc)
        if swapped:
            try:
                rollback = REMOTE + '.rollback_' + stamp + '.js'
                run('cp -p -- ' + shlex.quote(backup + '/old-trek.js') + ' ' + shlex.quote(rollback))
                run('mv -f -- ' + shlex.quote(rollback) + ' ' + shlex.quote(REMOTE))
                for name in NODES:
                    try:
                        run('pm2 restart ' + shlex.quote(name) + ' --update-env')
                        ready(name)
                    except Exception:
                        pass
                report['rollback'] = 'restored'
            except Exception as rollback_error:
                report['rollbackError'] = str(rollback_error)
        raise
    finally:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / 'deployment.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        try:
            sftp.remove(stage)
        except FileNotFoundError:
            pass
        sftp.close()
        client.close()
        print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
