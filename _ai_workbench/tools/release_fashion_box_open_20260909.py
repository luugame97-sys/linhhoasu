"""Prepare/test a five-file fashion-box patch; deploy is a separate explicit action.

Fixtures load candidate JS at original module paths in a fresh Node process.
They block network and stub persistence. No production files or PM2 state are
changed by stage/preflight. Deploy backs up every target and uses compare-and-swap.
"""
import difflib
import hashlib
import json
import re
import shlex
import sys
from datetime import datetime, timezone

from snapshot_web_multiserver_20260906 import WB, connect
from release_huyenvu_daily_20260906 import run, hashes, pm2, ready, wait_ready
from deploy_farm_alchemy_20260908 import install_one, log_positions

APP = '/linhhoasu/lhs/newServer'
GAME = '/linhhoasu/webgame/game'
OUT = WB / 'temp/fashion_box_open_20260909'
MANIFEST = OUT / 'release.json'
RELS = [
    'lhs/newServer/src/services/FashionBoxService.js',
    'lhs/newServer/src/handlers/item.js',
    'webgame/game/js/lhs-fashion-gear-v1.js',
    'webgame/game/js/lhs-fashion-box-v1.js',
    'webgame/game/index.html',
]
TESTS = ['test-fashion-box-open.js', 'test-fashion-gear-fix.js',
         'test-fashion-gear-native.js', 'test-fashion-suit-tabs-audit.js']
CONTEXT = [GAME + '/js/main.min_a6195824.js', GAME + '/js/lhs-ranged-action-v1.js']
CONTEXT += [APP + '/src/services/' + name + '.js' for name in
            ['FashionTransactionService', 'FeatureReceiptService', 'PlayerMutationService',
             'RoleAppearanceService', 'RewardGrantService', 'CurrencySync', 'ConfigService']]
NAMES = ['lhs-s1002', 'lhs-s1001']


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(report):
    MANIFEST.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def local_bytes(rel):
    return (WB.parent / 'linhhoasu' / rel).read_bytes()


def classify_log_lines(lines):
    shutting_down, pending = False, []
    failures, shutdown_warnings = [], []
    errors = re.compile(r'uncaught exception|unhandled rejection|startup failed|stop server failed|'
                        r'TypeError|ReferenceError|SyntaxError|Cannot find module|'
                        r'PLAYER_LOCK_UPGRADE_DENIED|\[Redis\].*write EPIPE')
    for line in lines:
        if re.search(r'\[App\] received SIG(?:INT|TERM), shutting down\.\.\.$', line):
            shutting_down = True
        if '[App] starting...' in line:
            shutdown_warnings.extend(pending)
            pending = []
            shutting_down = False
        if not errors.search(line):
            continue
        known_close = line.endswith('[App] unhandled rejection: Error: Connection is closed.')
        known_pipe = bool(re.search(r'\[Redis\] 错误: write EPIPE$', line))
        if shutting_down and (known_close or known_pipe):
            pending.append(line)
        else:
            failures.append(line)
    # A warning needs both shutdown and a subsequent new-process start marker.
    failures.extend(pending)
    return {'failures': failures, 'shutdownWarnings': shutdown_warnings}


def check_new_logs(ssh, positions):
    code = r"""const fs=require('fs'),positions=POSITIONS,out=[];
for(const [file,start] of Object.entries(positions)){
 if(!fs.existsSync(file))continue;
 const size=fs.statSync(file).size,offset=size<start?0:start,n=size-offset;
 if(n>8*1024*1024)throw Error('LOG_WINDOW_EXCEEDS_LIMIT');
 const fd=fs.openSync(file,'r'),data=Buffer.alloc(n);fs.readSync(fd,data,0,n,offset);fs.closeSync(fd);
 const lines=data.toString('utf8').split('\n');
 out.push({file,newBytes:n,lines:lines.filter(l=>/\[App\]|\[Redis\]|uncaught exception|unhandled rejection|startup failed|TypeError|ReferenceError|SyntaxError|Cannot find module|PLAYER_LOCK_UPGRADE_DENIED/.test(l)).map(l=>l.replace(/user=\S+|userId[=:]\s*\S+/gi,'user=[redacted]').slice(0,500)),mongooseReservedWarning:lines.some(l=>/reserved schema/.test(l))});
}console.log(JSON.stringify(out));""".replace('POSITIONS', json.dumps(positions))
    rows = json.loads(run(ssh, 'node -', code))
    result = [{k: v for k, v in row.items() if k != 'lines'} | classify_log_lines(row['lines']) for row in rows]
    assert not any(row['failures'] for row in result), 'POST_RESTART_ERROR_MARKER: ' + json.dumps(result)
    return result


def evidence():
    tests, visual = read(OUT / 'tests.json'), read(OUT / 'visual.json')
    assert tests['result'] == visual['result'] == 'PASS'
    assert tests['nativeBoxChains'] == 56 and tests['unsupportedKept'] == 3
    assert tests['cases'] >= 85 and tests['productionWrites'] == tests['networkAttempts'] == 0
    assert tests['clientHash'] == visual['hashes']['lhs-fashion-box-v1.js'] == sha(local_bytes(RELS[3]))
    assert tests['gearHash'] == visual['hashes']['lhs-fashion-gear-v1.js'] == sha(local_bytes(RELS[2]))
    assert len(visual['checks']) == 7 and not visual['errors']
    assert all(row['active'] and row['wear'] and row['openCalls'] == 1
               and len(row['labels']) == len(row['parts']) for row in visual['checks'][:6])
    assert visual['viewport'] == {'width': 390, 'height': 844}
    assert visual['mouseClicks'] >= 1
    return {'vm': tests, 'browser': {k: v for k, v in visual.items()
                                   if k not in ['serverItems', 'serverFashion']}}


def fixture(ssh, m, installed=False):
    stage = m['stage']
    env = {
        'FEATURE_APP': APP, 'FEATURE_MAIN': GAME + '/js/main.min_a6195824.js',
        'FEATURE_ACORN': stage + '/tools/acorn.js',
        'FEATURE_CLIENT': GAME + '/js/lhs-fashion-gear-v1.js' if installed else stage + '/2.js',
        'FASHION_BOX_PATCH': GAME + '/js/lhs-fashion-box-v1.js' if installed else stage + '/3.js',
        'CONFIG_BIN_PATH': '/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin',
    }
    command = ' '.join(k + '=' + shlex.quote(v) for k, v in env.items()) + ' node '
    if not installed:
        command += '-r ' + shlex.quote(stage + '/tools/candidate-loader.js') + ' '
    result = {}
    for name in TESTS:
        output = run(ssh, command + shlex.quote(stage + '/tools/' + name), timeout=55)
        row = json.loads(next(line for line in reversed(output.splitlines()) if line.startswith('{"result"')))
        assert row['result'] == 'PASS' and row['productionWrites'] == row['networkAttempts'] == 0, name
        result[name] = row
    assert result[TESTS[0]]['clientHash'] == m['after']['/linhhoasu/' + RELS[3]]
    assert result[TESTS[0]]['gearHash'] == m['after']['/linhhoasu/' + RELS[2]]
    return result


def stage(ssh):
    assert not MANIFEST.exists(), 'MANIFEST_EXISTS: inspect/preflight the prepared release'
    proof = evidence()
    snapshot = read(OUT / 'resume-live.json')
    baseline = dict(snapshot['hashes'])
    baseline[GAME + '/js/lhs-fashion-box-v1.js'] = snapshot['boxPatchLive']
    assert snapshot['boxPatchLive'] is None, 'PATCH_ALREADY_EXISTS'
    assert hashes(ssh, list(baseline)) == baseline, 'LIVE_BASELINE_DRIFT'
    context = hashes(ssh, CONTEXT)
    assert all(value == sha((WB.parent / path.lstrip('/')).read_bytes()) for path, value in context.items()), 'RUNTIME_CONTEXT_DRIFT'
    assert ready(ssh) == {'8080': 200, '8083': 200}
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    folder = '/linhhoasu/_ai_workbench/temp/fashion_box_open_' + stamp
    local_backup = WB / 'backups/fashion_box_release_20260909'
    local_backup.mkdir(exist_ok=True)
    candidates = {f'{folder}/{i}.js': local_bytes(rel) for i, rel in enumerate(RELS)}
    before = {target: baseline[target] for target in ['/linhhoasu/' + rel for rel in RELS]}
    after = {'/linhhoasu/' + rel: sha(local_bytes(rel)) for rel in RELS}
    diff = []
    with ssh.open_sftp() as sftp:
        for i, rel in enumerate(RELS):
            target = '/linhhoasu/' + rel
            old = sftp.open(target, 'rb').read() if before[target] else b''
            assert sha(old) == before[target] if before[target] else not old
            if before[target]:
                destination = local_backup / f'{i}.before'
                if destination.exists():
                    assert destination.read_bytes() == old, 'LOCAL_BACKUP_DRIFT'
                else:
                    destination.write_bytes(old)
            diff.extend(difflib.unified_diff(old.decode('utf-8').splitlines(True),
                                            local_bytes(rel).decode('utf-8').splitlines(True),
                                            fromfile='live/' + rel, tofile='candidate/' + rel))
            if i == 1:
                previous = b"  if (require('../services/FashionBoxService').isBox(itemId)) return require('../services/FashionBoxService').open(params, session, msgUid);"
                replacement = b"  const fashionBoxes = require('../services/FashionBoxService');\n  if (fashionBoxes.isCandidateBox(itemId)) return fashionBoxes.open(params, session, msgUid);"
                assert old.count(previous) == 1 and old.replace(previous, replacement) == local_bytes(rel), 'ITEM_HANDLER_UNRELATED_EDIT'
            if i == 4:
                expected = old.replace(b'20260908_fashion_gear_v5', b'20260909_fashion_gear_v7')
                token = b'"js/lhs-fashion-gear-v1.js?v=20260909_fashion_gear_v7"'
                expected = expected.replace(token, token + b',\n\t\t"js/lhs-fashion-box-v1.js?v=20260909_fashion_box_v3"')
                assert expected == local_bytes(rel), 'INDEX_UNRELATED_EDIT'
    (OUT / 'review.diff').write_text(''.join(diff), encoding='utf-8')
    replacements = {APP + '/src/services/FashionBoxService.js': folder + '/0.js',
                    APP + '/src/handlers/item.js': folder + '/1.js'}
    loader = ("'use strict';\nconst fs=require('fs'),Module=require('module');\nconst replacements="
              + json.dumps(replacements) + ";\nconst original=Module._extensions['.js'];\n"
              "Module._extensions['.js']=function(module,filename){const file=replacements[filename];"
              "if(file)return module._compile(fs.readFileSync(file,'utf8'),filename);"
              "return original(module,filename);};\n")
    candidates[folder + '/tools/candidate-loader.js'] = loader.encode()
    for name in TESTS:
        candidates[folder + '/tools/' + name] = (WB.parent / 'linhhoasu/lhs/newServer/scripts' / name).read_bytes()
    candidates[folder + '/tools/acorn.js'] = (WB.parent / 'linhhoasu/lhs/newServer/node_modules/acorn/dist/acorn.js').read_bytes()
    run(ssh, 'install -d -m 700 ' + folder + '/tools')
    with ssh.open_sftp() as sftp:
        for target, data in candidates.items():
            with sftp.open(target, 'wb') as stream:
                stream.write(data)
    staged = {p: sha(data) for p, data in candidates.items()}
    assert hashes(ssh, list(staged)) == staged
    m = {'status': 'STAGING', 'stage': folder, 'before': before, 'after': after,
         'contextHashes': context, 'stagedHashes': staged, 'evidence': proof,
         'localBackup': str(local_backup), 'beforePm2': pm2(ssh),
         'installed': [], 'restarted': [], 'productionSourceWrites': 0, 'playerDataWrites': 0, 'playerDataRepair': False}
    save(m)
    m['stagingTests'] = fixture(ssh, m)
    assert hashes(ssh, list(before)) == before
    assert pm2(ssh) == m['beforePm2']
    m.update(status='STAGED_NOT_DEPLOYED', ready=ready(ssh))
    save(m)
    return m


def preflight(ssh, m):
    assert m['status'] == 'STAGED_NOT_DEPLOYED'
    assert re.fullmatch(r'/linhhoasu/_ai_workbench/temp/fashion_box_open_\d{8}_\d{6}', m['stage'])
    assert m['stagingTests'][TESTS[0]]['cases'] >= 85
    evidence()
    assert hashes(ssh, list(m['before'])) == m['before'], 'LIVE_BASELINE_DRIFT'
    assert hashes(ssh, list(m['contextHashes'])) == m['contextHashes'], 'CONTEXT_DRIFT'
    assert hashes(ssh, list(m['stagedHashes'])) == m['stagedHashes'], 'STAGE_DRIFT'
    assert {'/linhhoasu/' + rel: sha(local_bytes(rel)) for rel in RELS} == m['after'], 'LOCAL_DRIFT'
    assert ready(ssh) == {'8080': 200, '8083': 200}
    state = pm2(ssh)
    assert all(any(p['name'] == name and p['status'] == 'online' for p in state) for name in NAMES)
    return state


def rollback(ssh, m):
    assert re.fullmatch(r'/linhhoasu/_ai_workbench/backups/fashion_box_open_\d{8}_\d{6}', m['backup'])
    for entry in reversed(m['installed']):
        target = entry['target']
        assert target in ['/linhhoasu/' + rel for rel in RELS]
        current = hashes(ssh, [target])[target]
        if current == m['before'][target]:
            continue
        assert current == m['after'][target], 'ROLLBACK_TARGET_DRIFT'
        if m['before'][target]:
            install_one(ssh, entry['backup'], target, current, m['before'][target])
        else:
            destination = m['backup'] + '/new-box-patch.rolled-back'
            assert hashes(ssh, [destination])[destination] is None
            run(ssh, 'mv -- ' + shlex.quote(target) + ' ' + shlex.quote(destination))
    for name in m['restarted']:
        assert name in NAMES
        run(ssh, 'pm2 restart ' + name)
        wait_ready(ssh, 8083 if name == NAMES[0] else 8080)
    assert hashes(ssh, list(m['before'])) == m['before']
    m.update(status='ROLLED_BACK', ready=ready(ssh))
    save(m)


def deploy(ssh, m):
    before_pm2 = preflight(ssh, m)
    m['backup'] = m['stage'].replace('/temp/', '/backups/')
    run(ssh, 'install -d -m 700 ' + m['backup'])
    for i, rel in enumerate(RELS):
        target = '/linhhoasu/' + rel
        if m['before'][target]:
            dest = m['backup'] + f'/{i}.before'
            existing = hashes(ssh, [dest])[dest]
            if existing is None:
                run(ssh, 'cp -a -- ' + shlex.quote(target) + ' ' + shlex.quote(dest))
            else:
                assert existing == m['before'][target], 'BACKUP_DRIFT'
            assert hashes(ssh, [dest])[dest] == m['before'][target]
    assert hashes(ssh, list(m['before'])) == m['before']
    positions = log_positions(ssh)
    m.update(status='INSTALLING', deploymentBeforePm2=before_pm2, logStartPositions=positions)
    save(m)
    try:
        for i, rel in enumerate(RELS):
            target = '/linhhoasu/' + rel
            m['installed'].append({'target': target, 'backup': m['backup'] + f'/{i}.before'})
            save(m)
            install_one(ssh, m['stage'] + f'/{i}.js', target, m['before'][target], m['after'][target])
            m['productionSourceWrites'] += 1
            save(m)
            if i == 1:
                for name, port in [(NAMES[0], 8083), (NAMES[1], 8080)]:
                    m['restarted'].append(name)
                    save(m)
                    run(ssh, 'pm2 restart ' + name)
                    wait_ready(ssh, port)
                    m.setdefault('restartLogs', {})[name] = check_new_logs(ssh, positions)
                    save(m)
                    print(json.dumps({'step': 'backend-ready', 'name': name}), flush=True)
        m['installedTests'] = fixture(ssh, m, True)
        after_pm2 = pm2(ssh)
        assert [p for p in before_pm2 if p['name'] not in NAMES] == [p for p in after_pm2 if p['name'] not in NAMES]
        for name in NAMES:
            old = next(p for p in before_pm2 if p['name'] == name)
            new = next(p for p in after_pm2 if p['name'] == name)
            assert new['status'] == 'online' and new['pid'] != old['pid'] and new['restarts'] == old['restarts'] + 1
        served = {}
        for host in ['127.0.0.1', '103.116.105.154']:
            for url, rel in [('/', RELS[4]), ('/js/lhs-fashion-gear-v1.js?v=20260909_fashion_gear_v7', RELS[2]),
                             ('/js/lhs-fashion-box-v1.js?v=20260909_fashion_box_v3', RELS[3])]:
                address = 'http://' + host + ':81' + url
                value = run(ssh, 'curl -fsS --max-time 12 ' + shlex.quote(address) + ' | sha256sum').split()[0]
                assert value == m['after']['/linhhoasu/' + rel], 'HTTP_HASH_MISMATCH'
                served[address] = value
        assert hashes(ssh, list(m['after'])) == m['after']
        assert hashes(ssh, list(m['contextHashes'])) == m['contextHashes']
        assert ready(ssh) == {'8080': 200, '8083': 200}
        m.update(status='DEPLOYED', afterPm2=after_pm2, ready=ready(ssh), servedHashes=served,
                 logs=check_new_logs(ssh, positions), completedAt=datetime.now(timezone.utc).isoformat())
        save(m)
        with ssh.open_sftp() as sftp:
            sftp.put(str(MANIFEST), m['backup'] + '/manifest.json')
    except Exception as error:
        m['error'] = str(error)
        try:
            rollback(ssh, m)
        except Exception as failure:
            m.update(status='ROLLBACK_REQUIRES_ATTENTION', rollbackError=str(failure))
            save(m)
        raise
    return m


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else 'preflight'
    assert action in ['stage', 'preflight', 'deploy', 'retry', 'verify', 'rollback']
    ssh = connect()
    try:
        if action == 'stage':
            m = stage(ssh)
        else:
            m = read(MANIFEST)
            if action == 'preflight':
                preflight(ssh, m)
            elif action == 'retry':
                assert m['status'] == 'ROLLED_BACK', 'RETRY_REQUIRES_CONFIRMED_ROLLBACK'
                assert hashes(ssh, list(m['before'])) == m['before']
                previous = {k: m.get(k) for k in ['status', 'installed', 'restarted', 'error',
                            'productionSourceWrites', 'deploymentBeforePm2', 'ready']}
                previous['review'] = read(OUT / 'restart-log-review.json')
                m.setdefault('previousAttempts', []).append(previous)
                m.update(status='STAGED_NOT_DEPLOYED', installed=[], restarted=[], productionSourceWrites=0)
                m.pop('error', None)
                preflight(ssh, m)
                save(m)
                m = deploy(ssh, m)
            elif action == 'deploy':
                m = deploy(ssh, m)
            elif action == 'rollback':
                rollback(ssh, m)
            else:
                assert m['status'] == 'DEPLOYED'
                assert hashes(ssh, list(m['after'])) == m['after']
                assert hashes(ssh, list(m['contextHashes'])) == m['contextHashes']
                assert ready(ssh) == {'8080': 200, '8083': 200}
        print(json.dumps({'action': action, 'status': m['status'], 'files': len(RELS),
                          'stage': m['stage'], 'ready': m.get('ready'), 'playerDataRepair': False}))
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
