"""Client-only suit tab release. Hash guards, selective backup, no PM2/DB writes."""
import hashlib
import json
import re
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import WB, connect
from release_huyenvu_daily_20260906 import run, hashes, pm2, ready
from deploy_farm_alchemy_20260908 import install_one

APP = '/linhhoasu/lhs/newServer'
GAME = '/linhhoasu/webgame/game'
LOCAL_APP = WB.parent / 'linhhoasu/lhs/newServer'
LOCAL_GAME = WB.parent / 'linhhoasu/webgame/game'
OUT = WB / 'temp/fashion_suit_tabs_release_20260908_v5'
PREVIOUS = WB / 'temp/fashion_suit_tabs_release_20260908/release.json'
VERSION = '20260908_fashion_gear_v5'
FILES = ['js/lhs-fashion-gear-v1.js', 'index.html']
TESTS = ['test-fashion-gear-fix.js', 'test-fashion-gear-native.js', 'test-fashion-suit-tabs-audit.js']


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save(data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'release.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def test(ssh, stage, installed=False):
    patch = GAME + '/js/lhs-fashion-gear-v1.js' if installed else stage + '/js/lhs-fashion-gear-v1.js'
    env = (f'FEATURE_APP={APP} FEATURE_MAIN={GAME}/js/main.min_a6195824.js '
           f'FEATURE_CLIENT={patch} FEATURE_ACORN={stage}/tools/acorn.js '
           'CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin ')
    result = {}
    for name in TESTS:
        output = run(ssh, env + 'node ' + stage + '/tools/' + name, timeout=55)
        row = json.loads(next(line for line in reversed(output.splitlines()) if line.startswith('{"result"')))
        assert row['result'] == 'PASS' and row['productionWrites'] == 0 and row['networkAttempts'] == 0, name
        result[name] = row
    return result


def rollback(ssh, report):
    assert re.fullmatch(r'/linhhoasu/_ai_workbench/backups/fashion_suit_tabs_\d{8}_\d{6}', report['backup'])
    for entry in reversed(report['installed']):
        assert entry['target'] in [GAME + '/' + p for p in FILES]
        current = hashes(ssh, [entry['target']])[entry['target']]
        if current == entry['before']:
            continue
        assert current == entry['after'], 'ROLLBACK_TARGET_DRIFT'
        install_one(ssh, entry['backup'], entry['target'], entry['after'], entry['before'])
    assert hashes(ssh, list(report['beforeHashes'])) == report['beforeHashes']
    report.update(status='ROLLED_BACK', ready=ready(ssh))
    save(report)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    action = sys.argv[1] if len(sys.argv) > 1 else 'preflight'
    assert action in ['preflight', 'deploy', 'rollback']
    ssh = connect()
    try:
        if action == 'rollback':
            rollback(ssh, json.loads((OUT / 'release.json').read_text(encoding='utf-8')))
            print('{"status":"ROLLED_BACK"}')
            return
        previous = json.loads(PREVIOUS.read_text(encoding='utf-8'))
        baseline = dict(previous['expectedHashes'])
        baseline[GAME + '/js/main.min_a6195824.js'] = digest((LOCAL_GAME / 'js/main.min_a6195824.js').read_bytes())
        assert hashes(ssh, list(baseline)) == baseline, 'LIVE_BASELINE_DRIFT'
        assert ready(ssh) == {'8080': 200, '8083': 200}
        candidate = {GAME + '/' + p: digest((LOCAL_GAME / p).read_bytes()) for p in FILES}
        with ssh.open_sftp() as f:
            live_index = f.open(GAME + '/index.html', 'rb').read()
        local_index = (LOCAL_GAME / 'index.html').read_bytes()
        old_token = str(previous.get('version', '20260908_fashion_gear_v4')).encode()
        assert live_index.count(old_token) == 1
        assert live_index.replace(old_token, VERSION.encode()) == local_index, 'INDEX_UNRELATED_CHANGES'
        assert VERSION.encode() in (LOCAL_GAME / FILES[0]).read_bytes()
        if action == 'preflight':
            print(json.dumps({'status': 'PREFLIGHT_PASS', 'targets': FILES, 'pm2': pm2(ssh), 'ready': ready(ssh), 'candidate': candidate}))
            return
        assert not (OUT / 'release.json').exists(), 'RELEASE_EXISTS_INSPECT_FIRST'
        stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        stage = '/linhhoasu/_ai_workbench/temp/fashion_suit_tabs_' + stamp
        backup = stage.replace('/temp/', '/backups/')
        run(ssh, f'install -d -m 700 {stage}/js {stage}/tools {backup}')
        staged = {}
        with ssh.open_sftp() as f:
            for rel in FILES:
                f.put(str(LOCAL_GAME / rel), stage + '/' + rel)
                staged[stage + '/' + rel] = candidate[GAME + '/' + rel]
            for name in TESTS:
                source = LOCAL_APP / 'scripts' / name
                f.put(str(source), stage + '/tools/' + name)
                staged[stage + '/tools/' + name] = digest(source.read_bytes())
            parser = LOCAL_APP / 'node_modules/acorn/dist/acorn.js'
            f.put(str(parser), stage + '/tools/acorn.js')
            staged[stage + '/tools/acorn.js'] = digest(parser.read_bytes())
        assert hashes(ssh, list(staged)) == staged, 'STAGING_HASH_MISMATCH'
        run(ssh, 'node --check ' + stage + '/' + FILES[0])
        report = {'status': 'STAGED', 'version': VERSION, 'stage': stage, 'backup': backup,
                  'beforeHashes': baseline, 'expectedHashes': {**baseline, **candidate},
                  'beforePm2': pm2(ssh), 'installed': [], 'restarted': [],
                  'playerDataWrites': 0, 'compensation': False, 'stagedHashes': staged}
        report['stagingTests'] = test(ssh, stage)
        assert hashes(ssh, list(baseline)) == baseline, 'PREINSTALL_DRIFT'
        assert candidate == {GAME + '/' + p: digest((LOCAL_GAME / p).read_bytes()) for p in FILES}, 'LOCAL_DRIFT'
        assert hashes(ssh, list(staged)) == staged, 'STAGING_DRIFT'
        save(report)
        print('{"step":"staging_tests_pass","restart":false}', flush=True)
        try:
            for index, rel in enumerate(FILES):
                target = GAME + '/' + rel
                entry = {'target': target, 'source': stage + '/' + rel, 'before': baseline[target],
                         'after': candidate[target], 'backup': backup + '/' + str(index) + '.before'}
                run(ssh, 'cp -a -- ' + shlex.quote(target) + ' ' + shlex.quote(entry['backup']))
                assert hashes(ssh, [entry['backup']])[entry['backup']] == entry['before']
                report['installed'].append(entry)
                report['status'] = 'INSTALLING'
                save(report)
                install_one(ssh, entry['source'], target, entry['before'], entry['after'])
            report['installedTests'] = test(ssh, stage, True)
            assert hashes(ssh, list(baseline)) == report['expectedHashes']
            served = {}
            for host in ['127.0.0.1', '103.116.105.154']:
                for url, target in [('/', GAME + '/index.html'), ('/js/lhs-fashion-gear-v1.js?v=' + VERSION, GAME + '/' + FILES[0])]:
                    address = 'http://' + host + ':81' + url
                    response_hash = run(ssh, 'curl -fsS --max-time 12 ' + shlex.quote(address) + ' | sha256sum').split()[0]
                    assert response_hash == candidate[target], 'HTTP_HASH_MISMATCH'
                    served[address] = response_hash
            report['afterPm2'] = pm2(ssh)
            assert report['afterPm2'] == report['beforePm2'], 'PROCESS_STATE_CHANGED'
            report['ready'] = ready(ssh)
            assert report['ready'] == {'8080': 200, '8083': 200}
            report.update(status='DEPLOYED', at=datetime.now(timezone.utc).isoformat(), served=served)
            save(report)
            with ssh.open_sftp() as f:
                f.put(str(OUT / 'release.json'), backup + '/manifest.json')
            print(json.dumps({'status': report['status'], 'version': VERSION, 'backup': backup, 'ready': report['ready'], 'pm2Unchanged': True, 'targets': FILES}))
        except Exception as error:
            report['error'] = str(error)
            try:
                rollback(ssh, report)
            except Exception as failure:
                report.update(status='ROLLBACK_REQUIRES_ATTENTION', rollbackError=str(failure))
                save(report)
            raise
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
