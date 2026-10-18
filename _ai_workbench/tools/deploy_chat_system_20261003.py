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
OUT = ROOT / '_ai_workbench/temp/public_notify_20261003'
REMOTE_ROOT = '/linhhoasu/lhs/newServer/src'
FILES = {
    f'{REMOTE_ROOT}/services/ChatBus.js': (ROOT / 'linhhoasu/lhs/newServer/src/services/ChatBus.js', 'faf7890d33e8bf0dba7d78496984c753999e9957bd6e21c67075afe2c39a37dc'),
    f'{REMOTE_ROOT}/services/PublicNotificationService.js': (ROOT / 'linhhoasu/lhs/newServer/src/services/PublicNotificationService.js', None),
    f'{REMOTE_ROOT}/app.js': (ROOT / 'linhhoasu/lhs/newServer/src/app.js', '8e1a2592facf9eda7c641978deee98e3b89186d0ca36b911386160e298487d8b'),
    f'{REMOTE_ROOT}/net/WSServer.js': (ROOT / 'linhhoasu/lhs/newServer/src/net/WSServer.js', '5f6a971c77d2dfceea728ede1fceff784c1bffb41648f27a268ad0efa8a8835e'),
    f'{REMOTE_ROOT}/services/EventRewardSettlementService.js': (ROOT / 'linhhoasu/lhs/newServer/src/services/EventRewardSettlementService.js', '59dab642c6fa4d6b11c7fdcd67bce1277d0eeefbeab6d6143aee8686cfebcca2'),
    f'{REMOTE_ROOT}/services/CrossEventSettlementService.js': (ROOT / 'linhhoasu/lhs/newServer/src/services/CrossEventSettlementService.js', '618923a92b3cf37e262b05bfcadfb161b049752e9cc35591cc7fa33929683583'),
    f'{REMOTE_ROOT}/services/ArenaSettlementService.js': (ROOT / 'linhhoasu/lhs/newServer/src/services/ArenaSettlementService.js', '8e1567a1bbef191cb9d95732972ec54fc434596adf3297b03928d080be72a6e9'),
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
    assert b'claim(eventKey' in local[next(x for x in FILES if x.endswith('/services/ChatBus.js'))]
    assert b'announceFirstClear' in local[next(x for x in FILES if x.endswith('/services/PublicNotificationService.js'))]
    assert b'chatBus.start' in local[next(x for x in FILES if x.endswith('/app.js'))]
    assert b'publicNotification.observeResult' in local[next(x for x in FILES if x.endswith('/net/WSServer.js'))]

    args, kwargs = ssh_config(); assert args[0] == '103.116.104.165'
    client = paramiko.SSHClient(); client.set_missing_host_key_policy(paramiko.AutoAddPolicy()); client.connect(*args, **kwargs)
    sftp = client.open_sftp()
    stamp = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/public_notify_fix_{stamp}'
    stages = {remote: f'{remote}.chatfix_{stamp}{".js" if remote.endswith(".js") else ""}' for remote in FILES}
    receipt = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'backupDir': backup, 'directPlayerWrites': 0, 'remotePlayerWrites': 0, 'files': {}, 'restarts': [], 'result': 'STARTED'}
    swapped: list[str] = []
    restarted: list[str] = []

    def run(command: str, timeout: int = 50) -> bytes:
        _, out, err = client.exec_command(command, timeout=timeout)
        data = out.read(); error = err.read(); code = out.channel.recv_exit_status()
        if code: raise RuntimeError(f'COMMAND_FAILED:{code}:{error.decode("utf8", "replace")[-900:]}')
        return data

    def rh(path: str) -> str | None:
        try:
            with sftp.open(path, 'rb') as f: return sha(f.read())
        except FileNotFoundError: return None

    def pmap() -> dict:
        rows = json.loads(run('pm2 jlist').decode())
        return {row['name']: proc_summary(row) for row in rows if row.get('name') in NODES}

    def ready(name: str, wait: bool = True) -> dict:
        end = time.monotonic() + (60 if wait else 0)
        while True:
            try:
                value = json.loads(run(f'curl --max-time 5 -fsS http://127.0.0.1:{NODES[name]}/ready', 8).decode())
                checks = value.get('checks', {})
                if value.get('status') == 'ok' and checks.get('mongo') is True and checks.get('redis') is True: return value
            except Exception: pass
            if time.monotonic() >= end: raise RuntimeError(f'READY_TIMEOUT:{name}')
            time.sleep(1)

    def write_receipt() -> None:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / 'deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

    try:
        pre_hashes = {remote: rh(remote) for remote in FILES}
        for remote, (_, expected) in FILES.items():
            if expected is None:
                if pre_hashes[remote] is not None: raise RuntimeError(f'NEW_FILE_COLLISION:{remote}')
            elif pre_hashes[remote] != expected:
                raise RuntimeError(f'CAS_MISMATCH:{remote}:{pre_hashes[remote]}:{expected}')
        receipt['preProcesses'] = pmap()
        receipt['preReady'] = {name: ready(name, False) for name in NODES}

        run(f'mkdir -m 700 -- {q(backup)}')
        for remote in FILES:
            if pre_hashes[remote] is None: continue
            backup_file = f'{backup}/{Path(remote).name}'
            run(f'cp -p -- {q(remote)} {q(backup_file)}')
            if rh(backup_file) != pre_hashes[remote]: raise RuntimeError(f'BACKUP_VERIFY:{remote}')

        for remote, data in local.items():
            with sftp.open(stages[remote], 'wb') as f: f.write(data)
            sftp.chmod(stages[remote], 0o644)
            if remote.endswith('.js'): run(f'node --check {q(stages[remote])}')
            if rh(stages[remote]) != after[remote]: raise RuntimeError(f'STAGE_VERIFY:{remote}')
            receipt['files'][remote] = {'before': pre_hashes[remote], 'after': after[remote]}
        write_receipt()

        for remote in FILES:
            if pre_hashes[remote] is not None and rh(remote) != pre_hashes[remote]: raise RuntimeError(f'CAS_BEFORE_SWAP:{remote}')
        for remote in FILES:
            sftp.posix_rename(stages[remote], remote); swapped.append(remote)
            if rh(remote) != after[remote]: raise RuntimeError(f'POST_SWAP_HASH:{remote}')
        receipt['swapped'] = list(FILES); write_receipt()

        # Restart each game node after the new bus is staged. All six nodes must
        # subscribe before the rollout is considered complete.
        for name in NODES:
            before = receipt['preProcesses'][name]
            run(f'pm2 restart {q(name)} --update-env')
            health = ready(name, True); after_proc = pmap()[name]
            if after_proc['status'] != 'online' or after_proc['pid'] == before['pid'] or after_proc['restart_time'] != before['restart_time'] + 1:
                raise RuntimeError(f'RESTART_GATE:{name}')
            restarted.append(name); receipt['restarts'].append({'name': name, 'ready': health, 'process': after_proc}); write_receipt()
        receipt['postProcesses'] = pmap(); receipt['postReady'] = {name: ready(name, False) for name in NODES}; receipt['postFiles'] = {remote: rh(remote) for remote in FILES}
        receipt['result'] = 'DEPLOYED_VERIFIED'; receipt['completedAt'] = dt.datetime.now(dt.timezone.utc).isoformat(); write_receipt()
    except Exception as exc:
        receipt['result'] = 'FAILED'; receipt['error'] = str(exc); write_receipt(); raise
    finally:
        for stage in stages.values():
            try: sftp.remove(stage)
            except FileNotFoundError: pass
        sftp.close(); client.close(); print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == '__main__': main()
