from __future__ import annotations

import datetime as dt
import hashlib
import json
import shlex
import time
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
FILES = {
    '/linhhoasu/lhs/newServer/src/handlers/item.js': (
        ROOT / 'linhhoasu/lhs/newServer/src/handlers/item.js',
        'd9386cce7f1132f9c797b88ea27a59878c92b9b9648530b356fed6dd360dfc66',
    ),
    '/linhhoasu/lhs/newServer/src/services/RandomUsableItemRewardService.js': (
        ROOT / 'linhhoasu/lhs/newServer/src/services/RandomUsableItemRewardService.js',
        'd59beb95a05936899f679b32cd3ed34825eea9788140e3423b7540d588b8cd0e',
    ),
}
DEPENDENCIES = {
    '/linhhoasu/lhs/newServer/src/services/RewardGrantService.js': 'c9e075e5e513b38b69615dccb24c38ab572adabad5db836bb405f4ef526baa97',
    '/linhhoasu/lhs/newServer/src/services/ConfigService.js': '221a4dcc06679bb0594f952b9ed016784997331743470011ae96898b4c8ff822',
}
NODES = {
    'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085,
    'lhs-s1005': 8086, 'lhs-s1006': 8087, 'lhs-s1007': 8088, 'lhs-s1008': 8089,
}
FIXTURE = ROOT / '_ai_workbench/tools/test_custom_boxes_20261014.js'
OUT = ROOT / '_ai_workbench/temp/custom_boxes_20261014/deployment.json'


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_fixture(output: str) -> dict:
    for line in reversed(output.splitlines()):
        if line.startswith('CUSTOM_BOXES_RESULT='):
            return json.loads(line.split('=', 1)[1])
    raise RuntimeError('CUSTOM_BOX_FIXTURE_RESULT_MISSING:' + output[-1000:])


def fixture_command(paths: dict[str, str]) -> str:
    return (
        "globalThis.RANDOM_SOURCE=require('fs').readFileSync(" + json.dumps(paths['random']) + ",'utf8');"
        "globalThis.ITEM_SOURCE=require('fs').readFileSync(" + json.dumps(paths['item']) + ",'utf8');"
        "globalThis.REWARD_SOURCE=require('fs').readFileSync(" + json.dumps(paths['reward']) + ",'utf8');\n"
        + FIXTURE.read_text(encoding='utf-8')
    )


def main() -> None:
    payloads = {remote: (local.read_bytes(), expected) for remote, (local, expected) in FILES.items()}
    after = {remote: sha(data) for remote, (data, _expected) in payloads.items()}
    report = {
        'at': dt.datetime.now(dt.timezone.utc).isoformat(),
        'files': {},
        'productionWrites': 0,
        'restarts': [],
    }
    swapped: list[str] = []

    with connect() as client:
        sftp = client.open_sftp()
        stamp = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime('%Y%m%d_%H%M%S')
        backup = f'/linhhoasu/_ai_workbench/backups/custom_boxes_{stamp}'
        stages = {remote: remote + '.custom_boxes_' + stamp + '.js' for remote in FILES}
        report['backupDir'] = backup

        def remote_hash(path: str) -> str:
            with sftp.open(path, 'rb') as handle:
                return sha(handle.read())

        def json_command(command: str) -> object:
            return json.loads(run(client, command))

        def processes() -> dict:
            rows = json_command('pm2 jlist')
            return {
                row['name']: {
                    'pid': row['pid'],
                    'status': row['pm2_env']['status'],
                    'restarts': row['pm2_env']['restart_time'],
                    'watch': row['pm2_env'].get('watch', False),
                }
                for row in rows
            }

        def ready(name: str) -> dict:
            deadline = time.monotonic() + 60
            while True:
                try:
                    value = json_command(f'curl --max-time 5 -fsS http://127.0.0.1:{NODES[name]}/ready')
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
                state = report['preProcesses'].get(name)
                if not state or state['status'] != 'online' or state['watch']:
                    raise RuntimeError('NODE_STATE:' + name)
            report['preReady'] = {name: ready(name) for name in NODES}
            for remote, (_data, expected) in payloads.items():
                current = remote_hash(remote)
                if current != expected:
                    raise RuntimeError('CAS_PREFLIGHT:' + remote + ':' + current)
                report['files'][remote] = {'before': expected, 'after': after[remote]}
            report['dependencyHashes'] = {path: remote_hash(path) for path in DEPENDENCIES}
            for path, expected in DEPENDENCIES.items():
                if report['dependencyHashes'][path] != expected:
                    raise RuntimeError('DEPENDENCY_DRIFT:' + path)

            run(client, 'mkdir -m 700 -- ' + shlex.quote(backup))
            for remote, (data, expected) in payloads.items():
                run(client, 'cp -p -- ' + shlex.quote(remote) + ' ' + shlex.quote(backup + '/' + Path(remote).name))
                if remote_hash(backup + '/' + Path(remote).name) != expected:
                    raise RuntimeError('BACKUP_HASH_MISMATCH:' + remote)
                with sftp.open(stages[remote], 'wb') as handle:
                    handle.write(data)
                stat = sftp.stat(remote)
                sftp.chmod(stages[remote], stat.st_mode & 0o777)
                sftp.chown(stages[remote], stat.st_uid, stat.st_gid)
                run(client, 'node --check ' + shlex.quote(stages[remote]))
                if remote_hash(stages[remote]) != after[remote]:
                    raise RuntimeError('STAGE_HASH_MISMATCH:' + remote)

            fixture_paths = {
                'item': stages['/linhhoasu/lhs/newServer/src/handlers/item.js'],
                'random': stages['/linhhoasu/lhs/newServer/src/services/RandomUsableItemRewardService.js'],
                'reward': '/linhhoasu/lhs/newServer/src/services/RewardGrantService.js',
            }
            report['preSwapFixture'] = parse_fixture(run(client, 'node -', fixture_command(fixture_paths)))
            if report['preSwapFixture'].get('passed') != 193 or report['preSwapFixture'].get('networkAttempts') != 0 or report['preSwapFixture'].get('writeAttempts') != 0:
                raise RuntimeError('PRE_SWAP_FIXTURE_FAILED:' + json.dumps(report['preSwapFixture']))

            for remote, (_data, expected) in payloads.items():
                if remote_hash(remote) != expected:
                    raise RuntimeError('CAS_BEFORE_SWAP:' + remote)
            for remote in FILES:
                run(client, 'mv -f -- ' + shlex.quote(stages[remote]) + ' ' + shlex.quote(remote))
                swapped.append(remote)
                if remote_hash(remote) != after[remote]:
                    raise RuntimeError('LIVE_HASH_MISMATCH:' + remote)
                checkpoint()

            for name in NODES:
                run(client, 'pm2 restart ' + shlex.quote(name) + ' --update-env')
                report['restarts'].append({'name': name, 'status': 'READY', 'ready': ready(name)})
                checkpoint()
            report['postReady'] = {name: ready(name) for name in NODES}
            report['postProcesses'] = processes()
            for name, before in report['preProcesses'].items():
                after_state = report['postProcesses'].get(name)
                if name not in NODES:
                    if after_state != before:
                        raise RuntimeError('UNRELATED_PROCESS_CHANGED:' + name)
                elif (after_state['status'] != 'online' or after_state['pid'] == before['pid']
                      or after_state['restarts'] != before['restarts'] + 1):
                    raise RuntimeError('RESTART_INVARIANT:' + name)

            live_paths = {
                'item': '/linhhoasu/lhs/newServer/src/handlers/item.js',
                'random': '/linhhoasu/lhs/newServer/src/services/RandomUsableItemRewardService.js',
                'reward': '/linhhoasu/lhs/newServer/src/services/RewardGrantService.js',
            }
            report['postLiveFixture'] = parse_fixture(run(client, 'node -', fixture_command(live_paths)))
            if report['postLiveFixture'].get('passed') != 193:
                raise RuntimeError('POST_LIVE_FIXTURE_FAILED:' + json.dumps(report['postLiveFixture']))
            for remote, expected in after.items():
                if remote_hash(remote) != expected:
                    raise RuntimeError('FINAL_HASH_MISMATCH:' + remote)
            report['result'] = 'DEPLOYED'
            report['completedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
        except Exception as error:
            report['result'] = 'FAILED'
            report['error'] = str(error)
            if swapped:
                report['rollback'] = 'attempted'
                try:
                    for remote in reversed(swapped):
                        if remote_hash(remote) != after[remote]:
                            raise RuntimeError('ROLLBACK_CAS_DRIFT:' + remote)
                        stage = remote + '.rollback_' + stamp
                        run(client, 'cp -p -- ' + shlex.quote(backup + '/' + Path(remote).name) + ' ' + shlex.quote(stage))
                        run(client, 'mv -f -- ' + shlex.quote(stage) + ' ' + shlex.quote(remote))
                        if remote_hash(remote) != payloads[remote][1]:
                            raise RuntimeError('ROLLBACK_HASH:' + remote)
                    report['rollbackResult'] = 'RESTORED'
                    for name in NODES:
                        run(client, 'pm2 restart ' + shlex.quote(name) + ' --update-env')
                        ready(name)
                except Exception as rollback_error:
                    report['rollbackResult'] = 'FAILED:' + str(rollback_error)
            raise
        finally:
            checkpoint()
            for stage in stages.values():
                try:
                    sftp.remove(stage)
                except FileNotFoundError:
                    pass
            sftp.close()
    print(json.dumps({
        'result': report.get('result'),
        'backupDir': report.get('backupDir'),
        'ready': [row['name'] for row in report.get('restarts', []) if row.get('status') == 'READY'],
        'error': report.get('error'),
        'receipt': str(OUT),
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
