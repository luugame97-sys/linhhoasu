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
OUT = ROOT / '_ai_workbench/temp/homeland_fix_20261003'
REMOTE_ROOT = '/linhhoasu/lhs/newServer/src'
FILES = {
    f'{REMOTE_ROOT}/handlers/homeland.js': (
        ROOT / 'linhhoasu/lhs/newServer/src/handlers/homeland.js',
        '301d3a22de03787eeb1403e6b445cef8f6df06494304a18c69b66860ab7f7cd4',
    ),
    f'{REMOTE_ROOT}/handlers/playerPayload.js': (
        ROOT / 'linhhoasu/lhs/newServer/src/handlers/playerPayload.js',
        'a32f43289a9764c1ce478be21bce5e30c2dd397f667e60e854fc1872848bee09',
    ),
    f'{REMOTE_ROOT}/services/CurrencySync.js': (
        ROOT / 'linhhoasu/lhs/newServer/src/services/CurrencySync.js',
        '0df6dac56975c86f4b7a86960ffa01f3233a67d56644f99aac7443b489cbe540',
    ),
}
NODES = {'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085, 'lhs-s1005': 8086, 'lhs-s1006': 8087}


def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def q(value: str) -> str:
    return shlex.quote(value)


def proc_summary(row: dict) -> dict:
    env = row.get('pm2_env', {})
    return {'name': row.get('name'), 'pid': row.get('pid'), 'restart_time': env.get('restart_time'), 'status': env.get('status'), 'pm_id': row.get('pm_id')}


def main() -> None:
    local = {remote: path.read_bytes() for remote, (path, _) in FILES.items()}
    after = {remote: sha(data) for remote, data in local.items()}
    assert b'handleHomelandPayTribute' in local[next(path for path in FILES if path.endswith('/handlers/homeland.js'))]
    assert b'buildClientItemList' in local[next(path for path in FILES if path.endswith('/services/CurrencySync.js'))]

    args, kwargs = ssh_config()
    assert args[0] == '103.116.104.165'
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()
    stamp = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/homeland_fix_{stamp}'
    stages = {remote: f'{remote}.homelandfix_{stamp}.js' for remote in FILES}
    receipt = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'backupDir': backup,
               'directPlayerWrites': 0, 'remotePlayerWrites': 0, 'files': {}, 'restarts': [], 'result': 'STARTED'}

    def run(command: str, timeout: int = 50) -> bytes:
        _, out, err = client.exec_command(command, timeout=timeout)
        data, error = out.read(), err.read()
        code = out.channel.recv_exit_status()
        if code:
            raise RuntimeError(f'COMMAND_FAILED:{code}:{error.decode("utf8", "replace")[-900:]}')
        return data

    def rh(path: str) -> str | None:
        try:
            with sftp.open(path, 'rb') as f:
                return sha(f.read())
        except FileNotFoundError:
            return None

    def pmap() -> dict:
        rows = json.loads(run('pm2 jlist').decode('utf8'))
        return {row['name']: proc_summary(row) for row in rows if row.get('name') in NODES}

    def ready(name: str, wait: bool = True) -> dict:
        end = time.monotonic() + (60 if wait else 0)
        while True:
            try:
                value = json.loads(run(f'curl --max-time 5 -fsS http://127.0.0.1:{NODES[name]}/ready', 8).decode('utf8'))
                checks = value.get('checks', {})
                if value.get('status') == 'ok' and checks.get('mongo') is True and checks.get('redis') is True:
                    return value
            except Exception:
                pass
            if time.monotonic() >= end:
                raise RuntimeError(f'READY_TIMEOUT:{name}')
            time.sleep(1)

    def write_receipt() -> None:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / 'deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

    try:
        pre_hashes = {remote: rh(remote) for remote in FILES}
        for remote, (_, expected) in FILES.items():
            if pre_hashes[remote] != expected:
                raise RuntimeError(f'CAS_MISMATCH:{remote}:{pre_hashes[remote]}:{expected}')
        receipt['preProcesses'] = pmap()
        receipt['preReady'] = {name: ready(name, False) for name in NODES}
        run(f'mkdir -m 700 -- {q(backup)}')
        for remote in FILES:
            backup_file = f'{backup}/{Path(remote).name}'
            run(f'cp -p -- {q(remote)} {q(backup_file)}')
            if rh(backup_file) != pre_hashes[remote]:
                raise RuntimeError(f'BACKUP_VERIFY:{remote}')
        for remote, data in local.items():
            with sftp.open(stages[remote], 'wb') as f:
                f.write(data)
            sftp.chmod(stages[remote], 0o644)
            run(f'node --check {q(stages[remote])}')
            if rh(stages[remote]) != after[remote]:
                raise RuntimeError(f'STAGE_VERIFY:{remote}')
            receipt['files'][remote] = {'before': pre_hashes[remote], 'after': after[remote]}
        write_receipt()
        for remote in FILES:
            if rh(remote) != pre_hashes[remote]:
                raise RuntimeError(f'CAS_BEFORE_SWAP:{remote}')
        for remote in FILES:
            sftp.posix_rename(stages[remote], remote)
            if rh(remote) != after[remote]:
                raise RuntimeError(f'POST_SWAP_HASH:{remote}')
        receipt['swapped'] = list(FILES)
        write_receipt()
        for name in NODES:
            before = receipt['preProcesses'][name]
            run(f'pm2 restart {q(name)} --update-env')
            health = ready(name, True)
            current = pmap()[name]
            if current['status'] != 'online' or current['pid'] == before['pid'] or current['restart_time'] != before['restart_time'] + 1:
                raise RuntimeError(f'RESTART_GATE:{name}')
            receipt['restarts'].append({'name': name, 'ready': health, 'process': current})
            write_receipt()
        receipt['postProcesses'] = pmap()
        receipt['postReady'] = {name: ready(name, False) for name in NODES}
        receipt['postFiles'] = {remote: rh(remote) for remote in FILES}
        receipt['result'] = 'DEPLOYED_VERIFIED'
        receipt['completedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
        write_receipt()
    except Exception as exc:
        receipt['result'] = 'FAILED'
        receipt['error'] = str(exc)
        write_receipt()
        raise
    finally:
        for stage in stages.values():
            try:
                sftp.remove(stage)
            except FileNotFoundError:
                pass
        sftp.close()
        client.close()
        print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
