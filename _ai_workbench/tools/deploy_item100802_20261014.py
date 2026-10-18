from __future__ import annotations

import datetime as dt
import hashlib
import json
import shlex
import time
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / 'linhhoasu/lhs/newServer/src/handlers/item.js'
REMOTE = '/linhhoasu/lhs/newServer/src/handlers/item.js'
DEPENDENCIES = {
    '/linhhoasu/lhs/newServer/src/services/RandomUsableItemRewardService.js': 'd59beb95a05936899f679b32cd3ed34825eea9788140e3423b7540d588b8cd0e',
    '/linhhoasu/lhs/newServer/src/services/RewardGrantService.js': '2b86c938ee6fce6edbcec1e87ed9fd4d8290a9d6ae94116ad23b540bac889196',
    '/linhhoasu/lhs/newServer/src/services/ConfigService.js': '221a4dcc06679bb0594f952b9ed016784997331743470011ae96898b4c8ff822',
}
NODES = {
    'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085,
    'lhs-s1005': 8086, 'lhs-s1006': 8087, 'lhs-s1007': 8088, 'lhs-s1008': 8089,
}
OUT = ROOT / '_ai_workbench/temp/item100802_20261014/deployment.json'


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    data = LOCAL.read_bytes()
    candidate = sha(data)
    expected = '931e22004b6d70d1e80f6f5c24a68bcbaaafc5d92d830a5b019e2d324b5838af'
    if candidate == expected:
        raise RuntimeError('LOCAL_CANDIDATE_EQUALS_LIVE_PREIMAGE')
    report = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'file': REMOTE,
              'before': expected, 'after': candidate, 'directPlayerWrites': 0,
              'restarts': []}
    swapped = False

    with connect() as client:
        sftp = client.open_sftp()
        stamp = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime('%Y%m%d_%H%M%S')
        backup = f'/linhhoasu/_ai_workbench/backups/item100802_{stamp}'
        stage = REMOTE + '.item100802_' + stamp + '.js'
        report['backupDir'] = backup

        def remote_hash(path: str) -> str:
            with sftp.open(path, 'rb') as handle:
                return sha(handle.read())

        def remote_json(command: str) -> object:
            value = run(client, command)
            return json.loads(value)

        def processes() -> dict:
            rows = remote_json('pm2 jlist')
            return {row['name']: {'pid': row['pid'], 'status': row['pm2_env']['status'],
                                  'restarts': row['pm2_env']['restart_time'],
                                  'watch': row['pm2_env'].get('watch', False)} for row in rows}

        def ready(name: str) -> dict:
            deadline = time.monotonic() + 60
            while True:
                try:
                    value = remote_json(f'curl --max-time 5 -fsS http://127.0.0.1:{NODES[name]}/ready')
                    checks = value.get('checks', {})
                    if value.get('status') == 'ok' and checks.get('mongo') is True and checks.get('redis') is True:
                        return value
                except Exception:
                    pass
                if time.monotonic() >= deadline:
                    raise RuntimeError('READY_TIMEOUT:' + name)
                time.sleep(1)

        def checkpoint() -> None:
            OUT.parent.mkdir(parents=True, exist_ok=True)
            OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

        try:
            report['preProcesses'] = processes()
            for name in NODES:
                row = report['preProcesses'].get(name)
                if not row or row['status'] != 'online' or row['watch']:
                    raise RuntimeError('NODE_STATE:' + name)
            report['preReady'] = {name: ready(name) for name in NODES}
            if remote_hash(REMOTE) != expected:
                raise RuntimeError('CAS_PREFLIGHT:' + remote_hash(REMOTE))
            report['dependencyHashes'] = {path: remote_hash(path) for path in DEPENDENCIES}
            for path, expected_dep in DEPENDENCIES.items():
                if report['dependencyHashes'][path] != expected_dep:
                    raise RuntimeError('DEPENDENCY_DRIFT:' + path)
            run(client, 'mkdir -m 700 -- ' + shlex.quote(backup))
            run(client, 'cp -p -- ' + shlex.quote(REMOTE) + ' ' + shlex.quote(backup + '/item.js'))
            if remote_hash(backup + '/item.js') != expected:
                raise RuntimeError('BACKUP_HASH_MISMATCH')
            with sftp.open(stage, 'wb') as handle:
                handle.write(data)
            original_stat = sftp.stat(REMOTE)
            sftp.chmod(stage, original_stat.st_mode & 0o777)
            sftp.chown(stage, original_stat.st_uid, original_stat.st_gid)
            run(client, 'node --check ' + shlex.quote(stage))
            if remote_hash(stage) != candidate:
                raise RuntimeError('STAGE_HASH_MISMATCH')
            if remote_hash(REMOTE) != expected:
                raise RuntimeError('CAS_BEFORE_SWAP')
            run(client, 'mv -f -- ' + shlex.quote(stage) + ' ' + shlex.quote(REMOTE))
            swapped = True
            if remote_hash(REMOTE) != candidate:
                raise RuntimeError('LIVE_HASH_MISMATCH')
            checkpoint()
            for name in NODES:
                run(client, 'pm2 restart ' + shlex.quote(name) + ' --update-env')
                state = ready(name)
                report['restarts'].append({'name': name, 'status': 'READY', 'ready': state})
                checkpoint()
            report['postReady'] = {name: ready(name) for name in NODES}
            report['postProcesses'] = processes()
            for name, before in report['preProcesses'].items():
                if name not in NODES:
                    if report['postProcesses'].get(name) != before:
                        raise RuntimeError('UNRELATED_PROCESS_CHANGED:' + name)
                else:
                    after = report['postProcesses'][name]
                    if after['status'] != 'online' or after['pid'] == before['pid'] or after['restarts'] != before['restarts'] + 1:
                        raise RuntimeError('RESTART_INVARIANT:' + name)
            if remote_hash(REMOTE) != candidate:
                raise RuntimeError('FINAL_HASH_MISMATCH')
            report['result'] = 'DEPLOYED'
            report['completedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
        except Exception as exc:
            report['result'] = 'FAILED'
            report['error'] = str(exc)
            if swapped:
                report['rollback'] = 'attempted'
                try:
                    if remote_hash(REMOTE) != candidate:
                        raise RuntimeError('ROLLBACK_CAS_DRIFT')
                    rollback_stage = REMOTE + '.rollback_' + stamp
                    run(client, 'cp -p -- ' + shlex.quote(backup + '/item.js') + ' ' + shlex.quote(rollback_stage))
                    run(client, 'mv -f -- ' + shlex.quote(rollback_stage) + ' ' + shlex.quote(REMOTE))
                    if remote_hash(REMOTE) != expected:
                        raise RuntimeError('ROLLBACK_HASH_MISMATCH')
                    report['rollbackResult'] = 'RESTORED'
                    for name in NODES:
                        run(client, 'pm2 restart ' + shlex.quote(name) + ' --update-env')
                        ready(name)
                except Exception as rollback_error:
                    report['rollbackResult'] = 'FAILED:' + str(rollback_error)
            raise
        finally:
            checkpoint()
            try:
                sftp.remove(stage)
            except FileNotFoundError:
                pass
            sftp.close()
    print(json.dumps({'result': report.get('result'), 'backupDir': report.get('backupDir'),
                      'ready': [row['name'] for row in report.get('restarts', []) if row.get('status') == 'READY'],
                      'error': report.get('error'), 'receipt': str(OUT)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
