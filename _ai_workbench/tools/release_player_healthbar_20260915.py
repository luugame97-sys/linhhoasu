"""Deploy the player-only map health-bar add-on with CAS and rollback."""
import hashlib
import json
import shlex
import subprocess
import sys
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
EXPECTED_INDEX = '6b041dbfd785f1de85a15cbb069eea2b2d15a4760e5da33a5e735cfbe2721308'
EXPECTED_MAIN = '9b030e70cdfd3ecd1655df13b9e13cb96f2fcf81761ef969fff9a4f8a58708cb'
SCRIPT_LINE = '\t\t"js/lhs-player-healthbar-v1.js?v=20260915_player_healthbar_v3",\n'
ANCHOR = '\t\t"js/lhs-ranged-action-v1.js?v=20260908_ranged_action_v1"\n'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    subprocess.run(['node', '--check', str(ADDON)], check=True, timeout=30)
    subprocess.run(['node', str(TEST)], cwd=ROOT, check=True, timeout=30)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    stage = f'/linhhoasu/_ai_workbench/temp/player_healthbar_{stamp}'
    backup = f'/linhhoasu/_ai_workbench/backups/player_healthbar_{stamp}'
    evidence = {
        'startedAt': datetime.now(timezone.utc).isoformat(),
        'stage': stage,
        'backup': backup,
        'realPlayerWrites': 0,
        'serverRestarted': [],
    }
    ssh = connect()
    applied = []
    try:
        with ssh.open_sftp() as sftp:
            before_index = sftp.open(REMOTE_INDEX, 'rb').read()
            before_main = sftp.open(REMOTE_MAIN, 'rb').read()
            if sha(before_index) != EXPECTED_INDEX:
                raise RuntimeError('INDEX_BASELINE_CHANGED:' + sha(before_index))
            if sha(before_main) != EXPECTED_MAIN:
                raise RuntimeError('MAIN_BASELINE_CHANGED:' + sha(before_main))
            try:
                sftp.stat(REMOTE_ADDON)
                raise RuntimeError('ADDON_ALREADY_EXISTS')
            except FileNotFoundError:
                pass
            text = before_index.decode('utf-8')
            if 'js/main.min_a6195824.js' in text:
                raise RuntimeError('STALE_MAIN_REFERENCE_REJECTED')
            if text.count('js/main.min_drop100.js') != 1:
                raise RuntimeError('INDEX_MAIN_DROP100_REQUIRED')
            if text.count(ANCHOR) != 1 or 'lhs-player-healthbar-v1.js' in text:
                raise RuntimeError('INDEX_ANCHOR_MISMATCH')
            candidate_index = text.replace(ANCHOR, SCRIPT_LINE + ANCHOR).encode('utf-8')

        run(ssh, 'mkdir -p ' + shlex.quote(stage) + ' ' + shlex.quote(backup))
        with ssh.open_sftp() as sftp:
            sftp.put(str(ADDON), stage + '/lhs-player-healthbar-v1.js')
            sftp.put(str(TEST), stage + '/test.js')
            with sftp.open(stage + '/index.html', 'wb') as handle:
                handle.write(candidate_index)
            with sftp.open(backup + '/index.html.before', 'wb') as handle:
                handle.write(before_index)

        staged_hash = run(ssh, 'sha256sum ' + shlex.quote(stage + '/lhs-player-healthbar-v1.js')).split()[0]
        if staged_hash != sha(ADDON.read_bytes()):
            raise RuntimeError('STAGE_ADDON_HASH')
        run(ssh, 'node --check ' + shlex.quote(stage + '/lhs-player-healthbar-v1.js'))
        output = run(
            ssh,
            'PLAYER_HEALTHBAR_SCRIPT=' + shlex.quote(stage + '/lhs-player-healthbar-v1.js')
            + ' node ' + shlex.quote(stage + '/test.js')
        )
        test_result = json.loads(output.strip().splitlines()[-1])
        if test_result.get('result') != 'PASS':
            raise RuntimeError('REMOTE_TEST_FAILED')
        evidence['stagedTest'] = test_result

        with ssh.open_sftp() as sftp:
            if sha(sftp.open(REMOTE_INDEX, 'rb').read()) != EXPECTED_INDEX:
                raise RuntimeError('INDEX_CAS_CHANGED')
            try:
                sftp.stat(REMOTE_ADDON)
                raise RuntimeError('ADDON_CAS_CHANGED')
            except FileNotFoundError:
                pass
            addon_tmp = REMOTE_ADDON + '.healthbar_tmp'
            index_tmp = REMOTE_INDEX + '.healthbar_tmp'
            sftp.put(str(ADDON), addon_tmp)
            with sftp.open(index_tmp, 'wb') as handle:
                handle.write(candidate_index)
            sftp.posix_rename(addon_tmp, REMOTE_ADDON)
            applied.append('addon')
            sftp.posix_rename(index_tmp, REMOTE_INDEX)
            applied.append('index')

        served_addon = run(ssh, 'curl -fsS --max-time 15 http://127.0.0.1:81/js/lhs-player-healthbar-v1.js?v=20260915_player_healthbar_v1')
        served_index = run(ssh, 'curl -fsS --max-time 15 http://127.0.0.1:81/index.html')
        if sha(served_addon.encode('utf-8')) != sha(ADDON.read_bytes()):
            raise RuntimeError('SERVED_ADDON_HASH')
        if served_index.count('lhs-player-healthbar-v1.js?v=20260915_player_healthbar_v1') != 1:
            raise RuntimeError('SERVED_INDEX_MARKER')
        evidence.update({
            'result': 'DEPLOY_VERIFIED',
            'addonSha256': sha(ADDON.read_bytes()),
            'indexBeforeSha256': EXPECTED_INDEX,
            'indexAfterSha256': sha(candidate_index),
            'servedAddonSha256': sha(served_addon.encode('utf-8')),
            'servedIndexMarker': True,
            'finishedAt': datetime.now(timezone.utc).isoformat(),
        })
    except Exception as error:
        evidence['result'] = 'FAILED'
        evidence['error'] = str(error)
        if applied:
            with ssh.open_sftp() as sftp:
                if 'index' in applied:
                    current = sftp.open(REMOTE_INDEX, 'rb').read()
                    if sha(current) == sha(candidate_index):
                        tmp = REMOTE_INDEX + '.healthbar_rollback'
                        with sftp.open(tmp, 'wb') as handle:
                            handle.write(before_index)
                        sftp.posix_rename(tmp, REMOTE_INDEX)
                if 'addon' in applied:
                    try:
                        sftp.remove(REMOTE_ADDON)
                    except FileNotFoundError:
                        pass
        raise
    finally:
        try:
            payload = (json.dumps(evidence, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
            with ssh.open_sftp() as sftp:
                with sftp.open(stage + '/release.json', 'wb') as handle:
                    handle.write(payload)
        except Exception:
            pass
        ssh.close()
        output_dir = WB / 'temp/player_healthbar_20260915'
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / 'release.json').write_text(
            json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
        )
    print(json.dumps(evidence, ensure_ascii=False))


if __name__ == '__main__':
    main()
