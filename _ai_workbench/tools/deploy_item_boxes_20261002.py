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
FILES = {
    '/linhhoasu/lhs/newServer/src/services/RandomUsableItemRewardService.js': (ROOT / '_ai_workbench/temp/item_boxes_20261002/candidate/server/services/RandomUsableItemRewardService.js', '0b5ac22c3f458174a0e126d44baad8201bb44feb2da4664cb464062aa122770c'),
    '/linhhoasu/lhs/newServer/src/handlers/item.js': (ROOT / '_ai_workbench/temp/item_boxes_20261002/candidate/server/handlers/item.js', '19d1cef8b1b9d1d8facd64e9e3c497d90f858ae50bbdcd1f73657e495ac26611'),
    '/linhhoasu/lhs/newServer/src/services/RewardGrantService.js': (ROOT / '_ai_workbench/temp/item_boxes_20261002/candidate/server/services/RewardGrantService.js', 'b763bdc8d530d51ca37f57835360649037ac791fe3b4ad0d35d5e95f6f44d517'),
}
NODES = {'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085, 'lhs-s1005': 8086, 'lhs-s1006': 8087}
OUT = ROOT / '_ai_workbench/temp/item_boxes_20261002/release_server'


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    payloads = {remote: (local.read_bytes(), expected) for remote, (local, expected) in FILES.items()}
    after = {remote: sha(data) for remote, (data, _expected) in payloads.items()}
    if any(after[remote] == expected for remote, (_data, expected) in payloads.items()):
        raise RuntimeError('CANDIDATE_EQUALS_PREIMAGE')
    args, kwargs = ssh_config()
    assert args[0] == '103.116.104.165'
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()
    stamp = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/item_boxes_{stamp}'
    stages = {remote: remote + '.item_boxes_' + stamp + '.js' for remote in FILES}
    report = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'backupDir': backup, 'directPlayerWrites': 0, 'files': {}, 'restarts': []}
    swapped = []

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

    def processes():
        return {p['name']: {'pid': p['pid'], 'restarts': p['pm2_env']['restart_time'], 'status': p['pm2_env']['status'], 'watch': p['pm2_env'].get('watch', False)} for p in json.loads(run('pm2 jlist'))}

    def checkpoint():
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / 'deployment.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    try:
        report['preProcesses'] = processes()
        assert all(n in report['preProcesses'] and not report['preProcesses'][n]['watch'] for n in NODES), 'NODE_OR_WATCH_DRIFT'
        report['preReady'] = {name: ready(name) for name in NODES}
        for remote, (_data, expected) in payloads.items():
            if remote_hash(remote) != expected:
                raise RuntimeError('CAS_PREFLIGHT:' + remote)
        preflight = json.loads((ROOT / '_ai_workbench/temp/item_boxes_20261002/snapshot.json').read_text(encoding='utf8'))
        for remote, row in preflight['files'].items():
            if remote not in FILES and remote.startswith('/linhhoasu/lhs/'):
                assert remote_hash(remote) == row['sha256'], 'DEPENDENCY_DRIFT:' + remote
        assert remote_hash(preflight['config']['remote']) == preflight['config']['sha256'], 'CONFIG_DRIFT'
        run('mkdir -m 700 -- ' + shlex.quote(backup))
        for remote, (data, expected) in payloads.items():
            current = remote_hash(remote)
            if current != expected:
                raise RuntimeError('CAS:' + remote + ':' + current)
            name = Path(remote).name
            run('cp -p -- ' + shlex.quote(remote) + ' ' + shlex.quote(backup + '/' + name))
            if remote_hash(backup + '/' + name) != expected:
                raise RuntimeError('BACKUP_HASH_MISMATCH:' + remote)
            run('node --check ' + shlex.quote(remote))
            with sftp.open(stages[remote], 'wb') as handle:
                handle.write(data)
            run('chmod 644 -- ' + shlex.quote(stages[remote]))
            stat = sftp.stat(remote)
            sftp.chown(stages[remote], stat.st_uid, stat.st_gid)
            run('node --check ' + shlex.quote(stages[remote]))
            if remote_hash(stages[remote]) != after[remote]:
                raise RuntimeError('STAGE_HASH_MISMATCH:' + remote)
            report['files'][remote] = {'before': expected, 'after': after[remote]}
        for remote in FILES:
            if remote_hash(remote) != payloads[remote][1]:
                raise RuntimeError('CAS_BEFORE_SWAP:' + remote)
        for remote in FILES:
            run('mv -f -- ' + shlex.quote(stages[remote]) + ' ' + shlex.quote(remote))
            swapped.append(remote)
            checkpoint()
            if remote_hash(remote) != after[remote]:
                raise RuntimeError('LIVE_HASH_MISMATCH:' + remote)
        print('Backup/CAS + staged syntax/hash PASS; 3 server files published', flush=True)
        for name in NODES:
            report['restarts'].append({'name': name, 'status': 'STARTED'})
            checkpoint()
            run('pm2 restart ' + shlex.quote(name) + ' --update-env')
            report['restarts'][-1].update(status='READY', ready=ready(name))
            checkpoint()
            print(name + ' ready Mongo/Redis', flush=True)
        report['postReady'] = {name: ready(name) for name in NODES}
        report['postProcesses'] = processes()
        for name, before in report['preProcesses'].items():
            if name not in NODES:
                assert report['postProcesses'].get(name) == before, 'UNRELATED_PROCESS_CHANGED:' + name
            else:
                state = report['postProcesses'][name]
                assert state['status'] == 'online' and state['pid'] != before['pid'] and state['restarts'] == before['restarts'] + 1, 'RESTART_INVARIANT:' + name
        for remote in FILES:
            assert remote_hash(remote) == after[remote], 'FINAL_HASH:' + remote
        report['result'] = 'DEPLOYED'
        report['completedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
    except Exception as exc:
        report['result'] = 'FAILED'
        report['error'] = str(exc)
        if swapped:
            report['rollback'] = 'attempted'
            for remote in reversed(swapped):
                try:
                    if remote_hash(remote) != after[remote]:
                        raise RuntimeError('ROLLBACK_CAS_DRIFT:' + remote)
                    name = Path(remote).name
                    rollback_stage = remote + '.rollback_' + stamp
                    run('cp -p -- ' + shlex.quote(backup + '/' + name) + ' ' + shlex.quote(rollback_stage))
                    run('mv -f -- ' + shlex.quote(rollback_stage) + ' ' + shlex.quote(remote))
                    assert remote_hash(remote) == payloads[remote][1], 'ROLLBACK_HASH:' + remote
                except Exception:
                    report.setdefault('rollbackErrors', []).append(remote)
            for restart in report['restarts']:
                name = restart['name']
                try:
                    run('pm2 restart ' + shlex.quote(name) + ' --update-env')
                    ready(name)
                except Exception:
                    pass
        raise
    finally:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / 'deployment.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        for stage in stages.values():
            try:
                sftp.remove(stage)
            except FileNotFoundError:
                pass
        sftp.close()
        client.close()
        print(json.dumps({'result': report.get('result'), 'backupDir': backup, 'files': report['files'], 'ready': [r['name'] for r in report['restarts'] if r.get('status') == 'READY'], 'error': report.get('error'), 'receipt': str(OUT / 'deployment.json')}, ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    main()
