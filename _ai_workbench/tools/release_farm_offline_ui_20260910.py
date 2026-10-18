"""Client-only rollout for the integrated Farm Manager offline settings UI.

Usage: python release_farm_offline_ui_20260910.py stage|deploy|verify|rollback
The only live targets are the dedicated client patch and its cache-busted index entry.
"""
import hashlib
import json
import re
import shlex
import sys
from datetime import datetime, timezone

from snapshot_web_multiserver_20260906 import WB, connect
from release_huyenvu_daily_20260906 import hashes, ready, run
from deploy_farm_alchemy_20260908 import install_one

GAME = '/linhhoasu/webgame/game'
OUT = WB / 'temp' / 'farm_offline_ui_20260910'
MANIFEST = OUT / 'release.json'
LOCAL = WB.parent / 'linhhoasu' / 'webgame' / 'game'
TARGETS = [
    GAME + '/js/lhs-farm-social-offline-v1.js',
    GAME + '/index.html',
]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(value):
    OUT.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def load():
    return json.loads(MANIFEST.read_text(encoding='utf-8'))


def source_for(target):
    if target.endswith('/index.html'):
        return LOCAL / 'index.html'
    return LOCAL / 'js' / 'lhs-farm-social-offline-v1.js'


def served_hash(session, target):
    relative = target.removeprefix(GAME + '/')
    output = run(session, 'curl -fsS --max-time 15 ' + shlex.quote('http://127.0.0.1:81/' + relative) + ' | sha256sum')
    return output.split()[0]


def stage(session):
    assert ready(session) == {'8080': 200, '8083': 200}, 'GAME_NOT_READY'
    local_hashes = {target: sha(source_for(target)) for target in TARGETS}
    patch = source_for(TARGETS[0]).read_text(encoding='utf-8')
    index = source_for(TARGETS[1]).read_text(encoding='utf-8')
    assert "version: '20260910_offline_ui_v1'" in patch, 'UI_VERSION_MISSING'
    assert 'setInterval(function(){' not in patch, 'LEGACY_FLOATING_BUTTON_REMAINS'
    assert "button.label='Offline'" not in patch, 'LEGACY_FLOATING_LABEL_REMAINS'
    assert "button.label = 'Cài offline'" in patch, 'MANAGER_ENTRY_MISSING'
    assert 'CheckBox5Skin' in patch and 'BtnYellow0Skin' in patch, 'NATIVE_SKIN_MISSING'
    assert 'Rpc(2429' in patch, 'OFFLINE_RPC_MISSING'
    assert 'js/lhs-farm-social-offline-v1.js?v=20260910_offline_ui_v1' in index, 'INDEX_CACHE_VERSION_MISSING'
    before = hashes(session, TARGETS)
    for target in TARGETS:
        assert served_hash(session, target) == before[target], 'HTTP_DISK_DRIFT:' + target
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    stage_path = '/linhhoasu/_ai_workbench/temp/farm_offline_ui_' + stamp
    run(session, 'install -d -m 700 ' + shlex.quote(stage_path))
    staged = {}
    with session.open_sftp() as sftp:
        for index, target in enumerate(TARGETS):
            candidate = stage_path + '/' + str(index) + '.candidate'
            sftp.put(str(source_for(target)), candidate)
            staged[target] = candidate
    assert hashes(session, list(staged.values())) == {staged[target]: local_hashes[target] for target in TARGETS}, 'STAGE_HASH_MISMATCH'
    report = {
        'status': 'STAGED',
        'at': datetime.now(timezone.utc).isoformat(),
        'before': before,
        'expected': local_hashes,
        'stage': stage_path,
        'staged': staged,
        'targets': TARGETS,
        'readyBefore': ready(session),
        'checks': {
            'clientOnly': True,
            'noFloatingOfflineControl': True,
            'managerIntegratedEntry': True,
            'offlineRpcUnchanged': True,
        },
    }
    save(report)
    print(json.dumps({'status': report['status'], 'targets': len(TARGETS), 'ready': report['readyBefore']}))


def deploy(session):
    report = load()
    assert report['status'] == 'STAGED', 'NOT_STAGED'
    assert ready(session) == {'8080': 200, '8083': 200}, 'GAME_NOT_READY'
    assert hashes(session, TARGETS) == report['before'], 'LIVE_BASELINE_DRIFT'
    for target in TARGETS:
        assert served_hash(session, target) == report['before'][target], 'HTTP_DISK_DRIFT:' + target
        assert sha(source_for(target)) == report['expected'][target], 'LOCAL_CANDIDATE_DRIFT:' + target
    assert hashes(session, list(report['staged'].values())) == {report['staged'][target]: report['expected'][target] for target in TARGETS}, 'STAGED_CANDIDATE_DRIFT'
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = '/linhhoasu/_ai_workbench/backups/farm_offline_ui_' + stamp
    run(session, 'install -d -m 700 ' + shlex.quote(backup))
    report.update(status='INSTALLING', backup=backup, installed=[])
    save(report)
    try:
        for index, target in enumerate(TARGETS):
            backup_path = backup + '/' + str(index) + '.before'
            run(session, 'cp -a -- ' + shlex.quote(target) + ' ' + shlex.quote(backup_path))
            assert hashes(session, [backup_path])[backup_path] == report['before'][target], 'BACKUP_HASH_MISMATCH'
            entry = {
                'target': target,
                'before': report['before'][target],
                'after': report['expected'][target],
                'backup': backup_path,
            }
            report['installed'].append(entry)
            save(report)
            install_one(session, report['staged'][target], target, entry['before'], entry['after'])
        assert hashes(session, TARGETS) == report['expected'], 'POST_INSTALL_HASH_MISMATCH'
        served = {target: served_hash(session, target) for target in TARGETS}
        assert served == report['expected'], 'PUBLIC_HTTP_HASH_MISMATCH'
        report.update(status='DEPLOYED_PENDING_NATIVE_QA', readyAfter=ready(session), served=served)
        save(report)
        print(json.dumps({'status': report['status'], 'backup': backup, 'ready': report['readyAfter']}))
    except Exception:
        save(report)
        rollback(session)
        raise


def verify(session):
    report = load()
    expected = report['expected'] if report['status'].startswith('DEPLOYED') else report['before']
    disk = hashes(session, TARGETS)
    served = {target: served_hash(session, target) for target in TARGETS}
    result = {'status': report['status'], 'disk': disk, 'served': served, 'ready': ready(session)}
    assert disk == expected and served == expected, 'VERIFY_HASH_MISMATCH'
    print(json.dumps(result))


def rollback(session):
    report = load()
    assert report.get('backup'), 'NO_BACKUP'
    assert re.fullmatch(r'/linhhoasu/_ai_workbench/backups/farm_offline_ui_\d{8}_\d{6}', report['backup']), 'UNSAFE_BACKUP'
    for entry in reversed(report.get('installed', [])):
        current = hashes(session, [entry['target']])[entry['target']]
        if current == entry['before']:
            continue
        assert current == entry['after'], 'ROLLBACK_DRIFT:' + entry['target']
        install_one(session, entry['backup'], entry['target'], entry['after'], entry['before'])
    assert hashes(session, TARGETS) == report['before'], 'ROLLBACK_HASH_MISMATCH'
    served = {target: served_hash(session, target) for target in TARGETS}
    assert served == report['before'], 'ROLLBACK_HTTP_HASH_MISMATCH'
    report.update(status='ROLLED_BACK', rollbackAt=datetime.now(timezone.utc).isoformat(), rollbackReady=ready(session), rollbackServed=served)
    save(report)
    print(json.dumps({'status': report['status'], 'ready': report['rollbackReady']}))


if __name__ == '__main__':
    action = sys.argv[1] if len(sys.argv) > 1 else 'stage'
    if action not in {'stage', 'deploy', 'verify', 'rollback'}:
        raise SystemExit('usage: stage|deploy|verify|rollback')
    session = connect()
    try:
        {'stage': stage, 'deploy': deploy, 'verify': verify, 'rollback': rollback}[action](session)
    finally:
        session.close()
