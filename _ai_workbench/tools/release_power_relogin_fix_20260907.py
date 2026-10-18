"""Scoped client-only rollout for relog power synchronization; no DB or process mutation."""
import hashlib
import json
import shlex
import stat
import sys
import urllib.request
from datetime import datetime, timezone

from snapshot_web_multiserver_20260906 import WB, connect, run
from release_huyenvu_daily_20260906 import pm2, ready

ROOT = WB / 'temp/power_relogin_fix_20260907'
LOCAL = WB.parent / 'linhhoasu/webgame/game'
GAME = '/linhhoasu/webgame/game'
PATCH = 'js/lhs-power-relogin-v1.js'
INDEX = 'index.html'
STATE = ROOT / 'release.json'
STAGE = ROOT / 'stage.json'
GUARDS = [
    'js/main.min_a6195824.js',
    'js/lhs-item-quantity-v1.js',
    'js/egret.min_7d668222.js',
    'js/start.min_52ac8d58.js',
    'update/resource/assets/excel/config_e5ac72c2.bin',
    'update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin',
]


def digest_bytes(data):
    return hashlib.sha256(data).hexdigest()


def digest_file(path):
    return digest_bytes(path.read_bytes())


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def remote_hashes(ssh, paths):
    code = (
        "const fs=require('fs'),c=require('crypto');"
        "console.log(JSON.stringify(Object.fromEntries("
        + json.dumps(paths)
        + ".map(p=>[p,fs.existsSync(p)?c.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null]))));"
    )
    return json.loads(run(ssh, 'node -', code))


def fetch_hash(url):
    request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return digest_bytes(response.read())


def local_test():
    raw = __import__('subprocess').check_output(
        ['node', str(WB / 'tools/test_power_relogin_fix_20260907.js')],
        cwd=str(WB.parent), text=True, encoding='utf-8'
    ).strip().splitlines()[-1]
    result = json.loads(raw)
    assert result['result'] == 'PASS' and result['tests'] >= 20
    assert result['patchSha256'] == digest_file(LOCAL / PATCH)
    assert result['productionWrites'] == 0
    return result


def inspect_index_scope(before, after):
    token = b'\t\t"js/lhs-power-relogin-v1.js?v=20260907_power_relogin_v1"'
    anchor = b'\t\t"js/lhs-item-quantity-v1.js?v=20260907_item_quantity_v2"'
    assert before.count(token) == 0, 'PATCH_TOKEN_ALREADY_PRESENT'
    assert before.count(anchor) == 1, 'INDEX_ANCHOR_CHANGED'
    expected = before.replace(anchor, anchor + b',\n' + token, 1)
    assert after.replace(b'\r\n', b'\n') == expected.replace(b'\r\n', b'\n'), 'INDEX_SCOPE'


def verify(ssh, state, write=True):
    assert not state.get('rolledBack'), 'RELEASE_ROLLED_BACK'
    expected = dict(state['guards'])
    expected[GAME + '/' + INDEX] = state['indexHash']
    expected[GAME + '/' + PATCH] = state['patchHash']
    assert remote_hashes(ssh, list(expected)) == expected, 'DISK_HASH_MISMATCH'
    internal = {
        PATCH: run(
            ssh,
            'bash -c ' + shlex.quote(
                "set -o pipefail; curl -fsS --max-time 20 "
                "'http://127.0.0.1:81/js/lhs-power-relogin-v1.js?verify=20260907_power_relogin_v1' | sha256sum"
            ),
        ).split()[0],
        INDEX: run(
            ssh,
            'bash -c ' + shlex.quote(
                "set -o pipefail; curl -fsS --max-time 20 "
                "'http://127.0.0.1:81/?verify=20260907_power_relogin_v1' | sha256sum"
            ),
        ).split()[0],
    }
    assert internal == {PATCH: state['patchHash'], INDEX: state['indexHash']}, 'INTERNAL_HTTP_HASH'
    public = {
        PATCH: fetch_hash('http://103.116.105.154:81/' + PATCH + '?verify=20260907_power_relogin_v1'),
        INDEX: fetch_hash('http://103.116.105.154:81/?verify=20260907_power_relogin_v1'),
    }
    assert public == internal, 'PUBLIC_HTTP_HASH'
    assert pm2(ssh) == state['beforePm2'], 'PROCESS_CHANGED'
    assert ready(ssh) == {'8080': 200, '8083': 200}, 'READY_FAILED'
    state.update(
        verifiedAt=datetime.now(timezone.utc).isoformat(),
        ready={'8080': 200, '8083': 200},
        pm2Unchanged=True,
        diskAndHttpVerified=True,
        publicHttpHashes=public,
    )
    if write:
        save(STATE, state)
    return state


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    mode = sys.argv[1] if len(sys.argv) > 1 else 'stage'
    ssh = connect()
    state = None
    installed_patch = False
    installed_index = False
    try:
        if mode == 'stage':
            assert not STATE.exists(), 'RELEASE_ALREADY_EXISTS'
            paths = [GAME + '/' + rel for rel in [INDEX, PATCH] + GUARDS]
            baseline = remote_hashes(ssh, paths)
            assert baseline[GAME + '/' + PATCH] is None, 'PATCH_PATH_ALREADY_EXISTS'
            for rel in GUARDS:
                assert baseline[GAME + '/' + rel] == digest_file(LOCAL / rel), 'LOCAL_LIVE_DRIFT_' + rel
            with ssh.open_sftp() as sftp:
                with sftp.open(GAME + '/' + INDEX, 'rb') as handle:
                    remote_index = handle.read()
            assert baseline[GAME + '/' + INDEX] == digest_bytes(remote_index), 'REMOTE_INDEX_HASH'
            local_index = (LOCAL / INDEX).read_bytes()
            inspect_index_scope(remote_index, local_index)
            test = local_test()
            before_pm2 = pm2(ssh)
            health = ready(ssh)
            assert health == {'8080': 200, '8083': 200}
            result = {
                'result': 'STAGED',
                'at': datetime.now(timezone.utc).isoformat(),
                'baseline': baseline,
                'beforePm2': before_pm2,
                'ready': health,
                'test': test,
                'indexHash': digest_file(LOCAL / INDEX),
                'patchHash': digest_file(LOCAL / PATCH),
            }
            save(STAGE, result)
            print(json.dumps({'result': 'STAGED', 'tests': test['tests'], 'ready': health}))
            return

        if mode == 'verify':
            state = json.loads(STATE.read_text(encoding='utf-8'))
            verify(ssh, state)
            print(json.dumps({
                'result': 'VERIFIED', 'ready': state['ready'],
                'pm2Unchanged': state['pm2Unchanged'], 'diskAndHttpVerified': True,
            }))
            return

        if mode == 'rollback':
            state = json.loads(STATE.read_text(encoding='utf-8'))
            verify(ssh, state, write=False)
            current = remote_hashes(ssh, [GAME + '/' + INDEX, GAME + '/' + PATCH])
            assert current[GAME + '/' + INDEX] == state['indexHash'], 'ROLLBACK_INDEX_DRIFT'
            assert current[GAME + '/' + PATCH] == state['patchHash'], 'ROLLBACK_PATCH_DRIFT'
            backup = state['backup']
            run(ssh, 'cp -p ' + backup + '/index.before.html ' + backup + '/index.restore.html')
            with ssh.open_sftp() as sftp:
                sftp.posix_rename(backup + '/index.restore.html', GAME + '/' + INDEX)
                sftp.posix_rename(GAME + '/' + PATCH, backup + '/patch.rolled-back.js')
            restored = remote_hashes(ssh, [GAME + '/' + INDEX, GAME + '/' + PATCH])
            assert restored == {
                GAME + '/' + INDEX: state['beforeIndexHash'],
                GAME + '/' + PATCH: None,
            }
            state['rolledBack'] = True
            state['rolledBackAt'] = datetime.now(timezone.utc).isoformat()
            save(STATE, state)
            print(json.dumps({'result': 'ROLLED_BACK', 'ready': ready(ssh)}))
            return

        assert mode == 'deploy', 'UNKNOWN_MODE'
        assert not STATE.exists(), 'RELEASE_ALREADY_EXISTS'
        stage = json.loads(STAGE.read_text(encoding='utf-8'))
        assert stage['result'] == 'STAGED'
        assert remote_hashes(ssh, list(stage['baseline'])) == stage['baseline'], 'PRODUCTION_DRIFT'
        test = local_test()
        assert test['patchSha256'] == stage['patchHash'], 'PATCH_CHANGED_RESTAGE_REQUIRED'
        assert digest_file(LOCAL / INDEX) == stage['indexHash'], 'INDEX_CHANGED_RESTAGE_REQUIRED'
        assert pm2(ssh) == stage['beforePm2'], 'PROCESS_DRIFT'

        stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        backup = '/linhhoasu/_ai_workbench/backups/power_relogin_fix_' + stamp
        run(ssh, 'install -d -m 700 ' + backup)
        run(ssh, 'cp -p ' + GAME + '/' + INDEX + ' ' + backup + '/index.before.html')
        state = {
            'result': 'PREPARING',
            'at': datetime.now(timezone.utc).isoformat(),
            'backup': backup,
            'baseline': stage['baseline'],
            'guards': {
                path: value for path, value in stage['baseline'].items()
                if path not in [GAME + '/' + INDEX, GAME + '/' + PATCH]
            },
            'beforeIndexHash': stage['baseline'][GAME + '/' + INDEX],
            'indexHash': stage['indexHash'],
            'patchHash': stage['patchHash'],
            'beforePm2': stage['beforePm2'],
            'test': test,
            'activated': False,
        }
        save(STATE, state)

        with ssh.open_sftp() as sftp:
            main_attrs = sftp.stat(GAME + '/js/main.min_a6195824.js')
            index_attrs = sftp.stat(GAME + '/' + INDEX)
            patch_next = backup + '/patch.next.js'
            index_next = backup + '/index.next.html'
            sftp.put(str(LOCAL / PATCH), patch_next)
            sftp.chmod(patch_next, stat.S_IMODE(main_attrs.st_mode))
            sftp.chown(patch_next, main_attrs.st_uid, main_attrs.st_gid)
            sftp.put(str(LOCAL / INDEX), index_next)
            sftp.chmod(index_next, stat.S_IMODE(index_attrs.st_mode))
            sftp.chown(index_next, index_attrs.st_uid, index_attrs.st_gid)
            assert remote_hashes(ssh, [patch_next, index_next]) == {
                patch_next: state['patchHash'], index_next: state['indexHash'],
            }
            run(ssh, 'node --check ' + patch_next)
            assert remote_hashes(ssh, list(stage['baseline'])) == stage['baseline'], 'FINAL_CAS_FAILED'
            sftp.posix_rename(patch_next, GAME + '/' + PATCH)
            installed_patch = True
            sftp.posix_rename(index_next, GAME + '/' + INDEX)
            installed_index = True
            state['activated'] = True
            save(STATE, state)

        state['result'] = 'DEPLOYED'
        verify(ssh, state)
        print(json.dumps({
            'result': 'DEPLOYED', 'backup': backup, 'ready': state['ready'],
            'tests': test['tests'], 'pm2Unchanged': state['pm2Unchanged'],
        }))
    except Exception as error:
        if mode == 'deploy' and state is not None:
            state.update(result='FAILED', error=str(error))
            if installed_patch or installed_index:
                current = remote_hashes(ssh, [GAME + '/' + INDEX, GAME + '/' + PATCH])
                if installed_index:
                    assert current[GAME + '/' + INDEX] == state['indexHash'], 'AUTO_ROLLBACK_INDEX_DRIFT'
                    run(ssh, 'cp -p ' + state['backup'] + '/index.before.html ' + state['backup'] + '/index.restore.html')
                    with ssh.open_sftp() as sftp:
                        sftp.posix_rename(state['backup'] + '/index.restore.html', GAME + '/' + INDEX)
                if installed_patch:
                    current_patch = remote_hashes(ssh, [GAME + '/' + PATCH])[GAME + '/' + PATCH]
                    assert current_patch == state['patchHash'], 'AUTO_ROLLBACK_PATCH_DRIFT'
                    with ssh.open_sftp() as sftp:
                        sftp.posix_rename(GAME + '/' + PATCH, state['backup'] + '/patch.failed.js')
                state['rolledBack'] = True
                state['rollbackReady'] = ready(ssh)
            save(STATE, state)
        raise
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
