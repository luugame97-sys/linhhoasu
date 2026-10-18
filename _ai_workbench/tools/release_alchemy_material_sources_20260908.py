"""Guarded release for monster sources used by alchemy recipes.

Stages and deploys only the new material-drop policy/service and box handler.
No player migration, compensation, or historical inventory repair.
"""
import hashlib
import json
import re
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import WB, connect
from release_huyenvu_daily_20260906 import run, hashes, pm2, ready, wait_ready
from deploy_farm_alchemy_20260908 import log_positions, check_new_logs

APP = '/linhhoasu/lhs/newServer'
GAME = '/linhhoasu/webgame/game'
OUT = WB / 'temp' / 'alchemy_material_sources_20260908'
LOCAL_ROOT = WB.parent / 'linhhoasu' / 'lhs' / 'newServer'
FILES = [
    ('src/config/alchemyMaterialDrops.json', APP + '/src/config/alchemyMaterialDrops.json'),
    ('src/services/AlchemyMaterialDropService.js', APP + '/src/services/AlchemyMaterialDropService.js'),
    ('src/handlers/box.js', APP + '/src/handlers/box.js'),
]
TEST = WB.parent / 'linhhoasu' / 'lhs' / 'newServer' / 'scripts' / 'test-alchemy-material-sources.js'


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def dump(name, value):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def check_fixture(ssh, app_root, test_root, include_regression=True):
    env = (
        f'CONFIG_BIN_PATH={APP}/../update/resource/assets/excel/config_e5ac72c2.bin '
        f'FEATURE_APP={app_root} FEATURE_RUNTIME={app_root} FEATURE_GAME={GAME} '
        f'FEATURE_MAIN={GAME}/js/main.min_a6195824.js '
        f'FEATURE_ACORN={test_root}/tools/acorn.js '
        f'FEATURE_PATCH={GAME}/js/lhs-farm-alchemy-v2.js '
        f'MAP_RESOURCE_ROOT={GAME}/update/resource/assets/map '
        f'NODE_PATH={APP}/node_modules '
    )
    material = json.loads(run(ssh, env + f'node {test_root}/app/scripts/test-alchemy-material-sources.js', timeout=60))
    assert material['result'] == 'PASS' and material['count'] >= 17 and material['productionWrites'] == 0 and material['networkAttempts'] == 0
    result = {'materialSources': material}
    if include_regression:
        farm = json.loads(run(ssh, env + f'node {test_root}/app/scripts/test-farm-alchemy-fix.js', timeout=60))
        assert farm['result'] == 'PASS' and farm['count'] >= 48 and farm['productionWrites'] == 0
        result['farmAlchemyRegression'] = farm
    return result


def stage(ssh):
    OUT.mkdir(parents=True, exist_ok=True)
    assert not (OUT / 'release.json').exists(), 'RELEASE_EXISTS_INSPECT_FIRST'
    assert ready(ssh) == {'8080': 200, '8083': 200}
    processes = pm2(ssh)
    before = hashes(ssh, [target for _, target in FILES])
    assert before[APP + '/src/handlers/box.js'] == digest(WB / 'backups/alchemy_material_sources_20260908/box.js'), 'LIVE_BOX_BASELINE_DRIFT'
    assert all(before[target] is None for _, target in FILES[:2]), 'NEW_TARGET_ALREADY_EXISTS'
    prior_path = OUT / 'pending.json'
    prior = json.loads(prior_path.read_text()) if prior_path.exists() else None
    if prior is None and (OUT / 'stage.json').exists():
        prior = json.loads((OUT / 'stage.json').read_text())
    if prior:
        stage_path = prior['stage']
        assert prior['before'] == before, 'PENDING_BASELINE_DRIFT'
        assert re.fullmatch(r'/linhhoasu/_ai_workbench/temp/alchemy_material_sources_\d{8}_\d{6}', stage_path)
    else:
        stage_path = '/linhhoasu/_ai_workbench/temp/alchemy_material_sources_' + datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        run(ssh, 'install -d -m 700 ' + shlex.quote(stage_path + '/app/scripts'))
        run(ssh, 'cp -a ' + shlex.quote(APP + '/src') + ' ' + shlex.quote(stage_path + '/app/src'))
        run(ssh, 'ln -s ' + shlex.quote(APP + '/node_modules') + ' ' + shlex.quote(stage_path + '/app/node_modules'))
        run(ssh, 'install -d -m 700 ' + shlex.quote(stage_path + '/tools'))
        dump('pending.json', {'stage': stage_path, 'before': before})
    expected = {}
    with ssh.open_sftp() as sftp:
        for rel, target in FILES:
            local = LOCAL_ROOT / rel
            destination = stage_path + '/app/' + rel
            sftp.put(str(local), destination)
            expected[stage_path + '/app/' + rel] = digest(local)
        for test_name in ['test-alchemy-material-sources.js', 'test-farm-alchemy-fix.js', 'test-alchemy-craft.js']:
            source_test = TEST if test_name == TEST.name else LOCAL_ROOT / 'scripts' / test_name
            sftp.put(str(source_test), stage_path + '/app/scripts/' + test_name)
            expected[stage_path + '/app/scripts/' + test_name] = digest(source_test)
        acorn = LOCAL_ROOT / 'node_modules' / 'acorn' / 'dist' / 'acorn.js'
        sftp.put(str(acorn), stage_path + '/tools/acorn.js')
        expected[stage_path + '/tools/acorn.js'] = digest(acorn)
    for rel, _ in FILES:
        if rel.endswith('.js'):
            run(ssh, 'node --check ' + shlex.quote(stage_path + '/app/' + rel))
    fixture = check_fixture(ssh, stage_path + '/app', stage_path)
    assert hashes(ssh, list(before)) == before
    assert pm2(ssh) == processes, 'PROCESSES_CHANGED_DURING_STAGE'
    report = {
        'status': 'STAGED_NOT_DEPLOYED', 'stage': stage_path,
        'before': before, 'expected': expected,
        'fixture': fixture, 'ready': ready(ssh), 'beforePm2': pm2(ssh),
        'playerDataRepair': False, 'compensation': False,
    }
    dump('stage.json', report)
    print(json.dumps({'status': report['status'], 'stage': stage_path,
                      'tests': fixture['materialSources']['count'], 'ready': report['ready']}))


def install_one(ssh, source, target, before, after):
    body = """const fs=require('fs'),c=require('crypto');const a=ARGS;
const h=p=>fs.existsSync(p)?c.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;
if(h(a.source)!==a.after||h(a.target)!==a.before)throw Error('INSTALL_CAS_FAILURE');
const tmp=a.target+'.alchemy-material-next';if(fs.existsSync(tmp))throw Error('TEMP_ALREADY_EXISTS');
fs.copyFileSync(a.source,tmp);fs.chmodSync(tmp,0o644);fs.renameSync(tmp,a.target);
if(h(a.target)!==a.after)throw Error('POST_INSTALL_HASH_FAILURE');console.log('OK');""".replace('ARGS', json.dumps({'source': source, 'target': target, 'before': before, 'after': after}))
    assert run(ssh, 'node -', body).strip() == 'OK'


def rollback(ssh, release):
    assert re.fullmatch(r'/linhhoasu/_ai_workbench/backups/alchemy_material_sources_\d{8}_\d{6}', release['backup'])
    assert {e['target'] for e in release['installed']}.issubset({target for _, target in FILES})
    for entry in reversed(release['installed']):
        current = hashes(ssh, [entry['target']])[entry['target']]
        if current == entry['before']:
            continue
        assert current == entry['after'], 'ROLLBACK_TARGET_DRIFT:' + entry['target']
        if entry['before']:
            install_one(ssh, entry['backup'], entry['target'], entry['after'], entry['before'])
        else:
            run(ssh, 'mv -- ' + shlex.quote(entry['target']) + ' ' + shlex.quote(entry['backup'] + '.new-disabled'))
    for name in release['restarted']:
        port = 8083 if name == 'lhs-s1002' else 8080
        run(ssh, 'pm2 restart ' + name)
        wait_ready(ssh, port)
    assert hashes(ssh, list(release['beforeHashes'])) == release['beforeHashes'], 'ROLLBACK_HASH_MISMATCH'
    release['status'] = 'ROLLED_BACK'
    release['rollbackReady'] = ready(ssh)
    dump('release.json', release)


def deploy(ssh):
    assert not (OUT / 'release.json').exists(), 'RELEASE_EXISTS_INSPECT_FIRST'
    stage_info = json.loads((OUT / 'stage.json').read_text(encoding='utf-8'))
    assert stage_info['status'] == 'STAGED_NOT_DEPLOYED'
    assert ready(ssh) == {'8080': 200, '8083': 200}
    assert hashes(ssh, list(stage_info['before'])) == stage_info['before']
    assert hashes(ssh, list(stage_info['expected'])) == stage_info['expected']
    stage_path = stage_info['stage']
    assert re.fullmatch(r'/linhhoasu/_ai_workbench/temp/alchemy_material_sources_\d{8}_\d{6}', stage_path)
    for rel, _ in FILES:
        assert digest(LOCAL_ROOT / rel) == stage_info['expected'][stage_path + '/app/' + rel], 'LOCAL_SOURCE_DRIFT'
    assert stage_info['before'][APP + '/src/handlers/box.js'] == digest(WB / 'backups/alchemy_material_sources_20260908/box.js')
    regular = "const fs=require('fs');for(const p of " + json.dumps([t for _, t in FILES]) + "){if(fs.existsSync(p)&&!fs.lstatSync(p).isFile())throw Error('TARGET_NOT_REGULAR:'+p)}console.log('OK')"
    assert run(ssh, 'node -', regular).strip() == 'OK'
    check_fixture(ssh, stage_path + '/app', stage_path)
    before_processes = pm2(ssh)
    positions = log_positions(ssh)
    backup = stage_path.replace('/temp/', '/backups/')
    run(ssh, 'install -d -m 700 ' + shlex.quote(backup))
    installed = []
    for index, (rel, target) in enumerate(FILES):
        before = stage_info['before'][target]
        source = stage_path + '/app/' + rel
        after = stage_info['expected'][source]
        backup_path = backup + '/' + str(index) + '.before'
        if before:
            run(ssh, 'cp -a -- ' + shlex.quote(target) + ' ' + shlex.quote(backup_path))
            assert hashes(ssh, [backup_path])[backup_path] == before, 'BACKUP_HASH_MISMATCH'
        else:
            backup_path = backup + '/' + str(index) + '.missing'
        installed.append({'target': target, 'source': source, 'before': before, 'after': after, 'backup': backup_path})
    release = {'status': 'INSTALLING', 'stage': stage_path, 'backup': backup,
               'beforeHashes': stage_info['before'], 'expectedHashes': {entry['target']: entry['after'] for entry in installed},
               'beforePm2': before_processes, 'installed': [], 'restarted': [], 'canary': [],
               'playerDataRepair': False, 'compensation': False}
    dump('release.json', release)
    try:
        assert hashes(ssh, list(stage_info['before'])) == stage_info['before'], 'PRE_INSTALL_DRIFT'
        for entry in installed:
            release['installed'].append(entry)
            dump('release.json', release)
            install_one(ssh, entry['source'], entry['target'], entry['before'], entry['after'])
        assert hashes(ssh, list(release['expectedHashes'])) == release['expectedHashes']
        for name, port in [('lhs-s1002', 8083), ('lhs-s1001', 8080)]:
            release['restarted'].append(name)
            dump('release.json', release)
            print(json.dumps({'step': 'restart', 'name': name}), flush=True)
            run(ssh, 'pm2 restart ' + name)
            wait_ready(ssh, port)
            qa = check_fixture(ssh, APP, stage_path)
            release['canary'].append({'name': name, 'qa': qa})
            release['logs'] = check_new_logs(ssh, positions)
            dump('release.json', release)
            print(json.dumps({'step': 'canary-pass', 'name': name}), flush=True)
        assert ready(ssh) == {'8080': 200, '8083': 200}
        assert hashes(ssh, list(release['expectedHashes'])) == release['expectedHashes']
        release['status'] = 'DEPLOYED'
        release['at'] = datetime.now(timezone.utc).isoformat()
        release['afterPm2'] = pm2(ssh)
        other = lambda values: [p for p in values if p['name'] not in release['restarted']]
        assert other(release['beforePm2']) == other(release['afterPm2']), 'UNRELATED_PROCESS_CHANGED'
        for name in release['restarted']:
            before = next(p for p in release['beforePm2'] if p['name'] == name)
            after = next(p for p in release['afterPm2'] if p['name'] == name)
            assert after['status'] == 'online' and after['restarts'] == before['restarts'] + 1
        release['ready'] = ready(ssh)
        dump('release.json', release)
        with ssh.open_sftp() as sftp:
            sftp.put(str(OUT / 'release.json'), backup + '/manifest.json')
        print(json.dumps({'status': release['status'], 'backup': backup,
                          'tests': release['canary'][-1]['qa']['materialSources']['count'],
                          'ready': release['ready']}))
    except Exception as error:
        release['error'] = str(error)
        try:
            rollback(ssh, release)
        except Exception as rollback_error:
            release['status'] = 'ROLLBACK_REQUIRES_ATTENTION'
            release['rollbackError'] = str(rollback_error)
            dump('release.json', release)
        raise


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else 'stage'
    ssh = connect()
    try:
        if action == 'stage':
            stage(ssh)
        elif action == 'deploy':
            deploy(ssh)
        elif action == 'rollback':
            rollback(ssh, json.loads((OUT / 'release.json').read_text(encoding='utf-8')))
        else:
            raise ValueError('UNKNOWN_ACTION')
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
