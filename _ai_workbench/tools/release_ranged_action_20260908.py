"""Release a verified client-only ranged-action patch with CAS and recovery."""
import hashlib
import json
import re
import shlex
import sys
from datetime import datetime, timezone

from snapshot_web_multiserver_20260906 import WB, connect
from release_huyenvu_daily_20260906 import run, hashes, pm2, ready
from deploy_farm_alchemy_20260908 import install_one, log_positions, check_new_logs

APP = '/linhhoasu/lhs/newServer'
GAME = '/linhhoasu/webgame/game'
LOCAL_APP = WB.parent / 'linhhoasu/lhs/newServer'
LOCAL_GAME = WB.parent / 'linhhoasu/webgame/game'
OUT = WB / 'temp/ranged_action_fix_20260908'
PREVIOUS = WB / 'temp/fashion_suit_tabs_release_20260908_v5/release.json'
VERSION = '20260908_ranged_action_v1'
PATCH = 'js/lhs-ranged-action-v1.js'
TESTS = ['test-ranged-action.js', 'test-fashion-gear-fix.js', 'test-fashion-gear-native.js',
         'test-fashion-suit-tabs-audit.js', 'test-alchemy-material-sources.js']


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(report):
    (OUT / 'release.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def test(ssh, stage, installed):
    ranged = GAME + '/' + PATCH if installed else stage + '/' + PATCH
    env = (f'FEATURE_APP={APP} FEATURE_RUNTIME={APP} FEATURE_GAME={GAME} '
           f'FEATURE_MAIN={GAME}/js/main.min_a6195824.js '
           f'FEATURE_CLIENT={GAME}/js/lhs-fashion-gear-v1.js '
           f'RANGED_PATCH={ranged} FEATURE_ACORN={stage}/tools/acorn.js '
           'CONFIG_BIN_PATH=/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin ')
    results = {}
    for name in TESTS:
        result = run(ssh, env + 'node ' + stage + '/tools/' + name, timeout=55)
        row = json.loads(next(line for line in reversed(result.splitlines()) if line.startswith('{"result"')))
        assert row['result'] == 'PASS' and row.get('productionWrites') == 0 and row.get('networkAttempts') == 0, name
        results[name] = row
    return results


def rollback(ssh, report):
    backup = report['backup']
    assert re.fullmatch(r'/linhhoasu/_ai_workbench/backups/ranged_action_\d{8}_\d{6}', backup)
    for entry in reversed(report['installed']):
        assert entry['target'] in [GAME + '/index.html', GAME + '/' + PATCH]
        current = hashes(ssh, [entry['target']])[entry['target']]
        if current == entry['before']:
            continue
        assert current == entry['after'], 'ROLLBACK_LIVE_DRIFT'
        if entry['before'] is not None:
            install_one(ssh, entry['backup'], entry['target'], entry['after'], entry['before'])
        else:
            # Keep the new file recoverable; restore its previous absence.
            target = backup + '/ranged-action.rolled-back.js'
            assert hashes(ssh, [target])[target] is None
            run(ssh, 'mv -- ' + shlex.quote(entry['target']) + ' ' + shlex.quote(target))
    assert hashes(ssh, list(report['beforeHashes'])) == report['beforeHashes']
    report.update(status='ROLLED_BACK', ready=ready(ssh))
    save(report)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    action = sys.argv[1] if len(sys.argv) > 1 else 'preflight'
    assert action in ['preflight', 'deploy', 'rollback', 'verify']
    ssh = connect()
    try:
        if action == 'rollback':
            rollback(ssh, read(OUT / 'release.json'))
            print('{"status":"ROLLED_BACK"}')
            return
        if action == 'verify':
            report = read(OUT / 'release.json')
            assert report['status'] == 'DEPLOYED'
            assert hashes(ssh, list(report['expectedHashes'])) == report['expectedHashes']
            assert pm2(ssh) == report['afterPm2']
            assert ready(ssh) == {'8080': 200, '8083': 200}
            print('{"status":"POSTCHECK_PASS","pm2Unchanged":true}')
            return
        previous = read(PREVIOUS)
        baseline = dict(previous['expectedHashes'])
        baseline[GAME + '/' + PATCH] = None
        audit = read(WB / 'temp/ranged_skin_stutter_20260908/live.json')
        baseline[APP + '/src/handlers/box.js'] = audit['remoteHashes'][APP + '/src/handlers/box.js']
        assert hashes(ssh, list(baseline)) == baseline, 'LIVE_BASELINE_DRIFT'
        assert ready(ssh) == {'8080': 200, '8083': 200}
        patch_hash = digest(LOCAL_GAME / PATCH)
        tests = read(OUT / 'tests.json')
        visual = read(OUT / 'visual.json')
        assert tests['result'] == 'PASS' and tests['patchHash'] == patch_hash
        assert visual['result'] == 'PASS' and visual['patchHash'] == patch_hash
        assert visual['allMode'] and visual['renderedCases'] == 234 and not visual['errors'] and not visual['warnings']
        assert not visual['counts'] and all(row['hits'] == 1 for row in visual['samples'])
        with ssh.open_sftp() as sftp:
            with sftp.open(GAME + '/index.html', 'rb') as file:
                old_index = file.read()
        token = b'"js/lhs-fashion-gear-v1.js?v=20260908_fashion_gear_v5"'
        addition = token + b',\n\t\t"js/lhs-ranged-action-v1.js?v=20260908_ranged_action_v1"'
        assert old_index.count(token) == 1
        local_index = (LOCAL_GAME / 'index.html').read_bytes()
        assert old_index.replace(token, addition) == local_index, 'INDEX_UNRELATED_CHANGES'
        expected = {**baseline, GAME + '/' + PATCH: patch_hash, GAME + '/index.html': digest(LOCAL_GAME / 'index.html')}
        if action == 'preflight':
            print(json.dumps({'status': 'PREFLIGHT_PASS', 'patchHash': patch_hash, 'ready': ready(ssh),
                              'vmTests': tests['counts'], 'visualCases': visual['renderedCases']}))
            return
        assert not (OUT / 'release.json').exists(), 'RELEASE_EXISTS_INSPECT_FIRST'
        stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        stage = '/linhhoasu/_ai_workbench/temp/ranged_action_' + stamp
        backup = stage.replace('/temp/', '/backups/')
        run(ssh, f'install -d -m 700 {stage}/js {stage}/tools {backup}')
        uploads = [(LOCAL_GAME / PATCH, stage + '/' + PATCH), (LOCAL_GAME / 'index.html', stage + '/index.html')]
        uploads += [(LOCAL_APP / 'scripts' / name, stage + '/tools/' + name) for name in TESTS]
        uploads += [(LOCAL_APP / 'node_modules/acorn/dist/acorn.js', stage + '/tools/acorn.js')]
        stage_hashes = {target: digest(local) for local, target in uploads}
        with ssh.open_sftp() as sftp:
            for local, target in uploads:
                sftp.put(str(local), target)
        assert hashes(ssh, list(stage_hashes)) == stage_hashes
        run(ssh, 'node --check ' + stage + '/' + PATCH)
        report = {'status': 'STAGED', 'version': VERSION, 'stage': stage, 'backup': backup,
                  'beforeHashes': baseline, 'expectedHashes': expected, 'stagedHashes': stage_hashes,
                  'beforePm2': pm2(ssh), 'installed': [], 'restarted': [], 'productionWrites': 0,
                  'vmTests': tests, 'visualSummary': {key: visual[key] for key in ['patchHash', 'result', 'renderedCases', 'counts', 'errors', 'warnings']}}
        report['stagingTests'] = test(ssh, stage, False)
        assert hashes(ssh, list(baseline)) == baseline
        assert hashes(ssh, list(stage_hashes)) == stage_hashes
        assert all(digest(local) == stage_hashes[target] for local, target in uploads)
        report['logPositions'] = log_positions(ssh)
        save(report)
        print('{"step":"staging_tests_pass","restart":false}', flush=True)
        try:
            for number, rel in enumerate([PATCH, 'index.html']):
                target = GAME + '/' + rel
                entry = {'target': target, 'source': stage + '/' + rel, 'before': baseline[target],
                         'after': expected[target], 'backup': backup + '/' + str(number) + '.before'}
                if entry['before'] is not None:
                    run(ssh, 'cp -a -- ' + shlex.quote(target) + ' ' + shlex.quote(entry['backup']))
                    assert hashes(ssh, [entry['backup']])[entry['backup']] == entry['before']
                report['installed'].append(entry)
                report['status'] = 'INSTALLING'
                save(report)
                install_one(ssh, entry['source'], target, entry['before'], entry['after'])
            report['installedTests'] = test(ssh, stage, True)
            assert hashes(ssh, list(expected)) == expected
            report['served'] = {}
            for host in ['127.0.0.1', '103.116.105.154']:
                for url, target in [('/', GAME + '/index.html'), ('/' + PATCH + '?v=' + VERSION, GAME + '/' + PATCH)]:
                    address = 'http://' + host + ':81' + url
                    value = run(ssh, 'curl -fsS --max-time 12 ' + shlex.quote(address) + ' | sha256sum').split()[0]
                    assert value == expected[target], 'HTTP_HASH_MISMATCH'
                    report['served'][address] = value
            report['afterPm2'] = pm2(ssh)
            assert report['beforePm2'] == report['afterPm2'], 'PROCESS_STATE_CHANGED'
            report['ready'] = ready(ssh)
            assert report['ready'] == {'8080': 200, '8083': 200}
            report['logs'] = check_new_logs(ssh, report['logPositions'])
            report.update(status='DEPLOYED', at=datetime.now(timezone.utc).isoformat())
            save(report)
            with ssh.open_sftp() as sftp:
                sftp.put(str(OUT / 'release.json'), backup + '/manifest.json')
            print(json.dumps({'status': 'DEPLOYED', 'backup': backup, 'ready': report['ready'], 'pm2Unchanged': True, 'patchHash': patch_hash}))
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
