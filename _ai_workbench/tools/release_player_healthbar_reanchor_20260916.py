"""Deploy the player health-bar name anchor fix with a narrow CAS."""
import hashlib
import json
import shlex
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run


ROOT = Path(__file__).resolve().parents[2]
WB = ROOT / '_ai_workbench'
ADDON = ROOT / 'linhhoasu/webgame/game/js/lhs-player-healthbar-v1.js'
TEST = WB / 'tools/test_player_healthbar_20260915.js'
REMOTE_ROOT = '/linhhoasu/webgame/game'
REMOTE_ADDON = REMOTE_ROOT + '/js/lhs-player-healthbar-v1.js'
REMOTE_INDEX = REMOTE_ROOT + '/index.html'
REMOTE_MAIN = REMOTE_ROOT + '/js/main.min_drop100.js'
OLD_ADDON_SHA = '83d3957c58b06592f030b90f7f87b80d989644bffd42c0159928270feee2a9f3'
EXPECTED_MAIN_SHA = '9b030e70cdfd3ecd1655df13b9e13cb96f2fcf81761ef969fff9a4f8a58708cb'
OLD_MARKER = 'js/lhs-player-healthbar-v1.js?v=20260916_player_healthbar_reanchor_v7'
NEW_MARKER = 'js/lhs-player-healthbar-v1.js?v=20260917_player_healthbar_reanchor_v8'
MAIN_MARKER = 'js/main.min_drop100.js'
STALE_MAIN_MARKER = 'js/main.min_a6195824.js'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_remote(sftp, path):
    with sftp.open(path, 'rb') as handle:
        return handle.read()


def write_remote(sftp, path, data):
    with sftp.open(path, 'wb') as handle:
        handle.write(data)


def main():
    subprocess.run(['node', '--check', str(ADDON)], check=True, timeout=30)
    subprocess.run(['node', str(TEST)], cwd=ROOT, check=True, timeout=30)

    local_addon = ADDON.read_bytes()
    local_addon_sha = sha(local_addon)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    stage = f'/linhhoasu/_ai_workbench/temp/player_healthbar_reanchor_{stamp}'
    backup = f'/linhhoasu/_ai_workbench/backups/player_healthbar_reanchor_{stamp}'
    evidence = {
        'startedAt': datetime.now(timezone.utc).isoformat(),
        'stage': stage,
        'backup': backup,
        'realPlayerWrites': 0,
        'serverRestarted': [],
        'addonSha256': local_addon_sha,
    }

    ssh = connect()
    applied = []
    before_index = None
    before_addon = None
    candidate_index = None
    try:
        with ssh.open_sftp() as sftp:
            before_index = read_remote(sftp, REMOTE_INDEX)
            before_addon = read_remote(sftp, REMOTE_ADDON)
            before_main = read_remote(sftp, REMOTE_MAIN)

        if sha(before_main) != EXPECTED_MAIN_SHA:
            raise RuntimeError('MAIN_BASELINE_CHANGED:' + sha(before_main))
        if sha(before_addon) != OLD_ADDON_SHA and sha(before_addon) != local_addon_sha:
            raise RuntimeError('ADDON_BASELINE_CHANGED:' + sha(before_addon))

        index_text = before_index.decode('utf-8')
        if STALE_MAIN_MARKER in index_text:
            raise RuntimeError('STALE_MAIN_REFERENCE_REJECTED')
        if index_text.count(MAIN_MARKER) != 1:
            raise RuntimeError('INDEX_MAIN_DROP100_REQUIRED')
        if index_text.count(NEW_MARKER) > 1 or index_text.count(OLD_MARKER) > 1:
            raise RuntimeError('INDEX_HEALTHBAR_MARKER_DUPLICATE')
        if index_text.count(NEW_MARKER) == 1 and index_text.count(OLD_MARKER) == 0:
            candidate_index = before_index
            evidence['indexAlreadyUpdated'] = True
        elif index_text.count(OLD_MARKER) == 1 and index_text.count(NEW_MARKER) == 0:
            candidate_index = index_text.replace(OLD_MARKER, NEW_MARKER).encode('utf-8')
            evidence['indexAlreadyUpdated'] = False
        else:
            raise RuntimeError('INDEX_HEALTHBAR_MARKER_MISMATCH')

        run(ssh, 'mkdir ' + shlex.quote(stage) + ' ' + shlex.quote(backup))
        with ssh.open_sftp() as sftp:
            sftp.put(str(ADDON), stage + '/lhs-player-healthbar-v1.js')
            sftp.put(str(TEST), stage + '/test.js')
            write_remote(sftp, stage + '/index.html', candidate_index)
            write_remote(sftp, backup + '/index.html.before', before_index)
            write_remote(sftp, backup + '/lhs-player-healthbar-v1.js.before', before_addon)

        staged_sha = run(ssh, 'sha256sum ' + shlex.quote(stage + '/lhs-player-healthbar-v1.js')).split()[0]
        if staged_sha != local_addon_sha:
            raise RuntimeError('STAGE_ADDON_HASH')
        run(ssh, 'node --check ' + shlex.quote(stage + '/lhs-player-healthbar-v1.js'))
        test_cmd = (
            'PLAYER_HEALTHBAR_SCRIPT=' + shlex.quote(stage + '/lhs-player-healthbar-v1.js')
            + ' PLAYER_HEALTHBAR_BUNDLE=' + shlex.quote(REMOTE_MAIN)
            + ' PLAYER_HEALTHBAR_ENGINE=' + shlex.quote(REMOTE_ROOT + '/js/egret.min_7d668222.js')
            + ' node ' + shlex.quote(stage + '/test.js')
        )
        output = run(ssh, test_cmd)
        test_result = json.loads(output.strip().splitlines()[-1])
        if test_result.get('result') != 'PASS':
            raise RuntimeError('REMOTE_TEST_FAILED')
        evidence['stagedTest'] = test_result

        with ssh.open_sftp() as sftp:
            current_index = read_remote(sftp, REMOTE_INDEX)
            current_addon = read_remote(sftp, REMOTE_ADDON)
            current_main = read_remote(sftp, REMOTE_MAIN)
            if sha(current_index) != sha(before_index):
                raise RuntimeError('INDEX_CAS_CHANGED')
            if sha(current_main) != EXPECTED_MAIN_SHA:
                raise RuntimeError('MAIN_CAS_CHANGED')
            if sha(current_addon) != sha(before_addon):
                raise RuntimeError('ADDON_CAS_CHANGED')
            addon_tmp = REMOTE_ADDON + '.reanchor_tmp'
            index_tmp = REMOTE_INDEX + '.reanchor_tmp'
            sftp.put(str(ADDON), addon_tmp)
            write_remote(sftp, index_tmp, candidate_index)
            if sha(current_addon) != local_addon_sha:
                sftp.posix_rename(addon_tmp, REMOTE_ADDON)
                applied.append('addon')
            else:
                sftp.remove(addon_tmp)
            if sha(current_index) != sha(candidate_index):
                sftp.posix_rename(index_tmp, REMOTE_INDEX)
                applied.append('index')
            else:
                sftp.remove(index_tmp)

        served_addon = run(
            ssh,
            'curl -fsS --max-time 15 '
            + shlex.quote('http://127.0.0.1:81/' + NEW_MARKER),
        )
        served_index = run(ssh, 'curl -fsS --max-time 15 http://127.0.0.1:81/index.html')
        if sha(served_addon.encode('utf-8')) != local_addon_sha:
            raise RuntimeError('SERVED_ADDON_HASH')
        if served_index.count(NEW_MARKER) != 1 or served_index.count(OLD_MARKER) != 0:
            raise RuntimeError('SERVED_INDEX_MARKER')
        readiness = {}
        for port in (8080, 8083, 8084, 8085):
            code = run(
                ssh,
                'curl -sS --max-time 5 -o /dev/null -w %{http_code} '
                + shlex.quote(f'http://127.0.0.1:{port}/ready'),
            ).strip()
            readiness[str(port)] = code
            if code != '200':
                raise RuntimeError(f'READINESS_FAILED:{port}:{code}')
        evidence.update({
            'result': 'DEPLOY_VERIFIED',
            'indexBeforeSha256': sha(before_index),
            'indexAfterSha256': sha(candidate_index),
            'servedAddonSha256': sha(served_addon.encode('utf-8')),
            'servedIndexMarker': True,
            'readiness': readiness,
            'finishedAt': datetime.now(timezone.utc).isoformat(),
        })
    except Exception as error:
        evidence['result'] = 'FAILED'
        evidence['error'] = str(error)
        if applied and before_index is not None and before_addon is not None:
            with ssh.open_sftp() as sftp:
                if 'index' in applied:
                    current = read_remote(sftp, REMOTE_INDEX)
                    if candidate_index is not None and sha(current) == sha(candidate_index):
                        rollback = REMOTE_INDEX + '.reanchor_rollback'
                        write_remote(sftp, rollback, before_index)
                        sftp.posix_rename(rollback, REMOTE_INDEX)
                if 'addon' in applied:
                    current = read_remote(sftp, REMOTE_ADDON)
                    if sha(current) == local_addon_sha:
                        rollback = REMOTE_ADDON + '.reanchor_rollback'
                        write_remote(sftp, rollback, before_addon)
                        sftp.posix_rename(rollback, REMOTE_ADDON)
        raise
    finally:
        try:
            payload = (json.dumps(evidence, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
            with ssh.open_sftp() as sftp:
                write_remote(sftp, stage + '/release.json', payload)
        except Exception:
            pass
        ssh.close()
        output_dir = WB / 'temp/player_healthbar_reanchor_20260917'
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / 'release.json').write_text(
            json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
        )
    print(json.dumps(evidence, ensure_ascii=False))


if __name__ == '__main__':
    main()
