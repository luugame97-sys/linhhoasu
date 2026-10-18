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
        'aff3bdae3e7061f8d4940bbcf712d2809e435397f5483f69d3dcd4523a4acda3',
    ),
    '/linhhoasu/lhs/newServer/src/services/RandomUsableItemRewardService.js': (
        ROOT / 'linhhoasu/lhs/newServer/src/services/RandomUsableItemRewardService.js',
        '949efdec8fe7f4bfe954090145161756bf29b6cd394cd301c6ec6a5288b8a745',
    ),
}
DEPENDENCIES = {
    '/linhhoasu/lhs/newServer/src/services/RewardGrantService.js': 'c9e075e5e513b38b69615dccb24c38ab572adabad5db836bb405f4ef526baa97',
    '/linhhoasu/lhs/newServer/src/services/ConfigService.js': '221a4dcc06679bb0594f952b9ed016784997331743470011ae96898b4c8ff822',
}
ADDON_REMOTE = '/linhhoasu/webgame/game/js/lhs-select-legacy-boxes-v1.js'
ADDON_LOCAL = ROOT / 'linhhoasu/webgame/game/js/lhs-select-legacy-boxes-v1.js'
INDEX_REMOTE = '/linhhoasu/webgame/game/index.html'
INDEX_EXPECTED = '58c0b214a9fefae472dc0e020ef59e1789fb55e329a66e9358ebaa5f90162828'
INDEX_NEEDLE = '"js/lhs-gem-choice-shop-v1.js?v=20261006_gem_choice_shop_v2",\n'
INDEX_INSERT = INDEX_NEEDLE + '\t\t"js/lhs-select-legacy-boxes-v1.js?v=20261014_select_legacy_boxes_v1",\n'
NODES = {
    'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085,
    'lhs-s1005': 8086, 'lhs-s1006': 8087, 'lhs-s1007': 8088, 'lhs-s1008': 8089,
}
FIXTURE = ROOT / '_ai_workbench/tools/test_remaining_boxes_20261014.js'
OUT = ROOT / '_ai_workbench/temp/remaining_boxes_20261014/deployment.json'


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_fixture(output: str) -> dict:
    for line in reversed(output.splitlines()):
        if line.startswith('REMAINING_BOXES_RESULT='):
            return json.loads(line.split('=', 1)[1])
    raise RuntimeError('REMAINING_BOX_FIXTURE_RESULT_MISSING:' + output[-1000:])


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
    addon_data = ADDON_LOCAL.read_bytes()
    addon_after = sha(addon_data)
    report = {
        'at': dt.datetime.now(dt.timezone.utc).isoformat(),
        'files': {}, 'static': {}, 'playerWrites': 0, 'restarts': [],
    }
    swapped: list[str] = []
    with connect() as client:
        sftp = client.open_sftp()
        stamp = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime('%Y%m%d_%H%M%S')
        backup = f'/linhhoasu/_ai_workbench/backups/remaining_boxes_{stamp}'
        stages = {remote: remote + '.remaining_boxes_' + stamp + '.js' for remote in FILES}
        addon_stage = ADDON_REMOTE + '.remaining_boxes_' + stamp + '.js'
        index_stage = INDEX_REMOTE + '.remaining_boxes_' + stamp + '.html'
        report['backupDir'] = backup

        def remote_hash(path: str) -> str:
            with sftp.open(path, 'rb') as handle:
                return sha(handle.read())

        def remote_exists(path: str) -> bool:
            try:
                sftp.stat(path)
                return True
            except FileNotFoundError:
                return False

        def json_command(command: str) -> object:
            return json.loads(run(client, command))

        def processes() -> dict:
            rows = json_command('pm2 jlist')
            return {
                row['name']: {
                    'pid': row['pid'], 'status': row['pm2_env']['status'],
                    'restarts': row['pm2_env']['restart_time'], 'watch': row['pm2_env'].get('watch', False),
                } for row in rows
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

            index_before = remote_hash(INDEX_REMOTE)
            if index_before != INDEX_EXPECTED:
                raise RuntimeError('INDEX_CAS_PREFLIGHT:' + index_before)
            with sftp.open(INDEX_REMOTE, 'rb') as handle:
                index_data = handle.read()
            index_text = index_data.decode('utf-8')
            marker = '"js/lhs-select-legacy-boxes-v1.js?v=20261014_select_legacy_boxes_v1",\n'
            if marker in index_text:
                index_after_data = index_data
                index_changed = False
            else:
                if index_text.count(INDEX_NEEDLE) != 1:
                    raise RuntimeError('INDEX_INSERT_NEEDLE_MISSING')
                index_after_data = index_text.replace(INDEX_NEEDLE, INDEX_INSERT, 1).encode('utf-8')
                index_changed = True
            index_after = sha(index_after_data)
            addon_exists = remote_exists(ADDON_REMOTE)
            addon_before = remote_hash(ADDON_REMOTE) if addon_exists else None
            if addon_exists and addon_before != addon_after:
                raise RuntimeError('ADDON_DRIFT:' + str(addon_before))
            report['static'] = {
                'addon': {'before': addon_before, 'after': addon_after, 'changed': not addon_exists},
                'index': {'before': index_before, 'after': index_after, 'changed': index_changed},
            }

            run(client, 'mkdir -m 700 -- ' + shlex.quote(backup))
            if index_changed:
                run(client, 'cp -p -- ' + shlex.quote(INDEX_REMOTE) + ' ' + shlex.quote(backup + '/index.html'))
                if remote_hash(backup + '/index.html') != index_before:
                    raise RuntimeError('INDEX_BACKUP_HASH_MISMATCH')
            for remote, (_data, expected) in payloads.items():
                run(client, 'cp -p -- ' + shlex.quote(remote) + ' ' + shlex.quote(backup + '/' + Path(remote).name))
                if remote_hash(backup + '/' + Path(remote).name) != expected:
                    raise RuntimeError('BACKUP_HASH_MISMATCH:' + remote)
                with sftp.open(stages[remote], 'wb') as handle:
                    handle.write(_data)
                stat = sftp.stat(remote)
                sftp.chmod(stages[remote], stat.st_mode & 0o777)
                sftp.chown(stages[remote], stat.st_uid, stat.st_gid)
                run(client, 'node --check ' + shlex.quote(stages[remote]))
                if remote_hash(stages[remote]) != after[remote]:
                    raise RuntimeError('STAGE_HASH_MISMATCH:' + remote)

            if not addon_exists:
                with sftp.open(addon_stage, 'wb') as handle:
                    handle.write(addon_data)
                sftp.chmod(addon_stage, 0o640)
                sftp.chown(addon_stage, 0, 1001)
                run(client, 'node --check ' + shlex.quote(addon_stage))
                if remote_hash(addon_stage) != addon_after:
                    raise RuntimeError('ADDON_STAGE_HASH_MISMATCH')
            if index_changed:
                with sftp.open(index_stage, 'wb') as handle:
                    handle.write(index_after_data)
                sftp.chmod(index_stage, 0o755)
                sftp.chown(index_stage, 0, 0)
                if remote_hash(index_stage) != index_after:
                    raise RuntimeError('INDEX_STAGE_HASH_MISMATCH')

            fixture_paths = {
                'item': stages['/linhhoasu/lhs/newServer/src/handlers/item.js'],
                'random': stages['/linhhoasu/lhs/newServer/src/services/RandomUsableItemRewardService.js'],
                'reward': '/linhhoasu/lhs/newServer/src/services/RewardGrantService.js',
            }
            report['preSwapFixture'] = parse_fixture(run(client, 'node -', fixture_command(fixture_paths)))
            fixture = report['preSwapFixture']
            if (fixture.get('targetIds') != 89 or fixture.get('definitions') != 89
                    or fixture.get('selectionCases') != 4 or fixture.get('passed') != 271
                    or fixture.get('networkAttempts') != 0 or fixture.get('writeAttempts') != 0):
                raise RuntimeError('PRE_SWAP_FIXTURE_FAILED:' + json.dumps(fixture))

            for remote, (_data, expected) in payloads.items():
                if remote_hash(remote) != expected:
                    raise RuntimeError('CAS_BEFORE_SWAP:' + remote)
            if remote_hash(INDEX_REMOTE) != INDEX_EXPECTED:
                raise RuntimeError('INDEX_CAS_BEFORE_SWAP')
            for remote in FILES:
                run(client, 'mv -f -- ' + shlex.quote(stages[remote]) + ' ' + shlex.quote(remote))
                swapped.append(remote)
                if remote_hash(remote) != after[remote]:
                    raise RuntimeError('LIVE_HASH_MISMATCH:' + remote)
                checkpoint()
            if not addon_exists:
                run(client, 'mv -f -- ' + shlex.quote(addon_stage) + ' ' + shlex.quote(ADDON_REMOTE))
                swapped.append(ADDON_REMOTE)
                if remote_hash(ADDON_REMOTE) != addon_after:
                    raise RuntimeError('LIVE_ADDON_HASH_MISMATCH')
            if index_changed:
                run(client, 'mv -f -- ' + shlex.quote(index_stage) + ' ' + shlex.quote(INDEX_REMOTE))
                swapped.append(INDEX_REMOTE)
                if remote_hash(INDEX_REMOTE) != index_after:
                    raise RuntimeError('LIVE_INDEX_HASH_MISMATCH')

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
            fixture = report['postLiveFixture']
            if (fixture.get('targetIds') != 89 or fixture.get('definitions') != 89
                    or fixture.get('selectionCases') != 4 or fixture.get('passed') != 271):
                raise RuntimeError('POST_LIVE_FIXTURE_FAILED:' + json.dumps(fixture))
            for remote, expected in after.items():
                if remote_hash(remote) != expected:
                    raise RuntimeError('FINAL_HASH_MISMATCH:' + remote)
            if remote_hash(ADDON_REMOTE) != addon_after or remote_hash(INDEX_REMOTE) != index_after:
                raise RuntimeError('FINAL_STATIC_HASH_MISMATCH')
            report['result'] = 'DEPLOYED'
            report['completedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
        except Exception as error:
            report['result'] = 'FAILED'
            report['error'] = str(error)
            if swapped:
                report['rollback'] = 'attempted'
                try:
                    for remote in reversed(swapped):
                        if remote == ADDON_REMOTE and not report['static']['addon']['before']:
                            if remote_hash(remote) != addon_after:
                                raise RuntimeError('ROLLBACK_ADDON_CAS_DRIFT')
                            run(client, 'rm -f -- ' + shlex.quote(remote))
                            continue
                        if remote == INDEX_REMOTE:
                            expected_live = report['static']['index']['after']
                            expected_old = report['static']['index']['before']
                        elif remote == ADDON_REMOTE:
                            expected_live = addon_after
                            expected_old = report['static']['addon']['before']
                        else:
                            expected_live = after[remote]
                            expected_old = FILES[remote][1]
                        if remote_hash(remote) != expected_live:
                            raise RuntimeError('ROLLBACK_CAS_DRIFT:' + remote)
                        stage = remote + '.rollback_' + stamp
                        run(client, 'cp -p -- ' + shlex.quote(backup + '/' + Path(remote).name) + ' ' + shlex.quote(stage))
                        run(client, 'mv -f -- ' + shlex.quote(stage) + ' ' + shlex.quote(remote))
                        if remote_hash(remote) != expected_old:
                            raise RuntimeError('ROLLBACK_HASH:' + remote)
                    report['rollbackResult'] = 'RESTORED'
                    if any(remote in swapped for remote in FILES):
                        for name in NODES:
                            run(client, 'pm2 restart ' + shlex.quote(name) + ' --update-env')
                            ready(name)
                except Exception as rollback_error:
                    report['rollbackResult'] = 'FAILED:' + str(rollback_error)
            raise
        finally:
            checkpoint()
            for stage in list(stages.values()) + [addon_stage, index_stage]:
                try:
                    sftp.remove(stage)
                except FileNotFoundError:
                    pass
            sftp.close()
    print(json.dumps({
        'result': report.get('result'), 'backupDir': report.get('backupDir'),
        'ready': [row['name'] for row in report.get('restarts', []) if row.get('status') == 'READY'],
        'error': report.get('error'), 'receipt': str(OUT),
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
