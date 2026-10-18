from __future__ import annotations

import datetime as dt
import hashlib
import json
import shlex
from pathlib import Path

import paramiko

from rollback_role_lian_manifest_20260930 import ssh_config

ROOT = Path(__file__).resolve().parents[2]
REMOTE_INDEX = '/linhhoasu/webgame/game/index.html'
REMOTE_ADDON = '/linhhoasu/webgame/game/js/lhs-petsoul-fix-v1.js'
REMOTE_TREK = '/linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js'
LOCAL_INDEX = ROOT / '_ai_workbench/temp/petsoul_release_20261002/index.html'
LOCAL_ADDON = ROOT / 'linhhoasu/webgame/game/js/lhs-petsoul-fix-v1.js'
LOCAL_TREK = ROOT / 'linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js'
EXPECTED_INDEX = 'b2ddd66ef5610e6e0f6c69eaa2c85e5c43953d3bbece22cf2d3c22d71827b44e'
EXPECTED_ADDON = None
EXPECTED_TREK = '6cd8a1e47b6fc6c656b0ea672ccef19921e9632d4388bf42ce2ad471eb49b8b2'
OUT = ROOT / '_ai_workbench/temp/petsoul_static_release_20261002'


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    index_data = LOCAL_INDEX.read_bytes()
    addon_data = LOCAL_ADDON.read_bytes()
    trek_data = LOCAL_TREK.read_bytes()
    trek_after = sha(trek_data)
    index_after, addon_after = sha(index_data), sha(addon_data)
    args, kwargs = ssh_config()
    assert args[0] == '103.116.104.165'
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()
    stamp = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/petsoul_static_{stamp}'
    stage_index = REMOTE_INDEX + '.petsoul_' + stamp
    stage_addon = REMOTE_ADDON + '.petsoul_' + stamp + '.js'
    stage_trek = REMOTE_TREK + '.petsoul_' + stamp + '.js'
    swapped = []
    report = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'backupDir': backup, 'directPlayerWrites': 0, 'pm2Restart': False, 'files': {}}

    def run(command: str, timeout: int = 45) -> str:
        _, out, err = client.exec_command(command, timeout=timeout)
        text = out.read().decode('utf-8', 'replace')
        error = err.read().decode('utf-8', 'replace')
        rc = out.channel.recv_exit_status()
        if rc:
            raise RuntimeError(f'REMOTE({rc}):{error[-1000:]}')
        return text.strip()

    def remote_hash(path: str) -> str:
        return sha(sftp.open(path, 'rb').read())

    try:
        assert b'20261002_petsoul_box_star_v2' in index_data and b'20261002_oldtrek_guard_v4' in index_data, 'INDEX_REFERENCES'
        current_index = remote_hash(REMOTE_INDEX)
        if current_index != EXPECTED_INDEX:
            raise RuntimeError('CAS_INDEX:' + current_index)
        addon_exists = True
        try:
            current_addon = remote_hash(REMOTE_ADDON)
        except FileNotFoundError:
            addon_exists = False
            current_addon = None
        if current_addon != EXPECTED_ADDON:
            raise RuntimeError('UNEXPECTED_EXISTING_PETSOUL_ADDON:' + str(current_addon))
        assert remote_hash(REMOTE_TREK) == EXPECTED_TREK, 'OLDTREK_CAS'
        run('mkdir -m 700 -- ' + shlex.quote(backup))
        run('cp -p -- ' + shlex.quote(REMOTE_INDEX) + ' ' + shlex.quote(backup + '/index.html'))
        run('cp -p -- ' + shlex.quote(REMOTE_TREK) + ' ' + shlex.quote(backup + '/lhs-oldtrek-errors-v1.js'))
        assert remote_hash(backup + '/index.html') == EXPECTED_INDEX and remote_hash(backup + '/lhs-oldtrek-errors-v1.js') == EXPECTED_TREK, 'BACKUP_HASH'
        if addon_exists:
            run('cp -p -- ' + shlex.quote(REMOTE_ADDON) + ' ' + shlex.quote(backup + '/lhs-petsoul-fix-v1.js'))
        with sftp.open(stage_index, 'wb') as handle:
            handle.write(index_data)
        with sftp.open(stage_addon, 'wb') as handle:
            handle.write(addon_data)
        with sftp.open(stage_trek, 'wb') as handle:
            handle.write(trek_data)
        run('chmod 644 -- ' + ' '.join(map(shlex.quote, [stage_index, stage_addon, stage_trek])))
        run('node --check ' + shlex.quote(stage_addon))
        run('node --check ' + shlex.quote(stage_trek))
        if remote_hash(stage_index) != index_after or remote_hash(stage_addon) != addon_after or remote_hash(stage_trek) != trek_after:
            raise RuntimeError('STAGE_HASH_MISMATCH')
        if remote_hash(REMOTE_INDEX) != EXPECTED_INDEX:
            raise RuntimeError('CAS_INDEX_BEFORE_SWAP')
        if addon_exists and remote_hash(REMOTE_ADDON) != current_addon:
            raise RuntimeError('CAS_ADDON_BEFORE_SWAP')
        assert remote_hash(REMOTE_TREK) == EXPECTED_TREK, 'OLDTREK_CAS_BEFORE_SWAP'
        # Publish and verify addons before any new client references them.
        run('mv -f -- ' + shlex.quote(stage_addon) + ' ' + shlex.quote(REMOTE_ADDON))
        swapped.append(REMOTE_ADDON)
        run('mv -f -- ' + shlex.quote(stage_trek) + ' ' + shlex.quote(REMOTE_TREK))
        swapped.append(REMOTE_TREK)
        public_addon = run("bash -o pipefail -c " + shlex.quote('curl --compressed --max-time 20 -fsS https://linhhoasu.lol/js/lhs-petsoul-fix-v1.js?v=20261002_petsoul_box_star_v2 | sha256sum')).split()[0]
        public_trek = run("bash -o pipefail -c " + shlex.quote('curl --compressed --max-time 20 -fsS https://linhhoasu.lol/js/lhs-oldtrek-errors-v1.js?v=20261002_oldtrek_guard_v4 | sha256sum')).split()[0]
        assert public_addon == addon_after and public_trek == trek_after, 'ADDON_SERVED_HASH'
        if remote_hash(REMOTE_INDEX) != EXPECTED_INDEX:
            raise RuntimeError('CAS_INDEX_BEFORE_FINAL_SWAP')
        run('mv -f -- ' + shlex.quote(stage_index) + ' ' + shlex.quote(REMOTE_INDEX))
        swapped.append(REMOTE_INDEX)
        if remote_hash(REMOTE_INDEX) != index_after or remote_hash(REMOTE_ADDON) != addon_after:
            raise RuntimeError('LIVE_HASH_MISMATCH')
        loop_index = run('bash -o pipefail -c ' + shlex.quote('curl --max-time 15 -fsS http://127.0.0.1:81/index.html | sha256sum')).split()[0]
        public_index = run('bash -o pipefail -c ' + shlex.quote('curl --compressed --max-time 20 -fsS https://linhhoasu.lol/index.html?v=20261002_petsoul_box_star_v2 | sha256sum')).split()[0]
        if loop_index != index_after or public_index != index_after or public_addon != addon_after:
            raise RuntimeError(f'SERVED_HASH:{loop_index}:{public_index}:{public_addon}')
        report.update(result='DEPLOYED', loopbackIndexHash=loop_index, publicIndexHash=public_index, publicAddonHash=public_addon, publicOldTrekHash=public_trek, completedAt=dt.datetime.now(dt.timezone.utc).isoformat())
    except Exception as exc:
        report.update(result='FAILED', error=str(exc))
        for remote, expected, posthash, filename in [(REMOTE_INDEX, EXPECTED_INDEX, index_after, 'index.html'), (REMOTE_TREK, EXPECTED_TREK, trek_after, 'lhs-oldtrek-errors-v1.js')]:
            if remote not in swapped:
                continue
            try:
                assert remote_hash(remote) == posthash, 'ROLLBACK_CAS'
                stage = remote + '.rollback_' + stamp
                run('cp -p -- ' + shlex.quote(backup + '/' + filename) + ' ' + shlex.quote(stage))
                sftp.posix_rename(stage, remote)
                assert remote_hash(remote) == expected, 'ROLLBACK_READBACK'
            except Exception as rb:
                report.setdefault('rollbackErrors', []).append(str(rb))
        report['rollback'] = 'restored_references' if not report.get('rollbackErrors') else 'needs_attention'
        raise
    finally:
        report['files'] = {'index': {'before': EXPECTED_INDEX, 'after': index_after}, 'addon': {'before': current_addon if 'current_addon' in locals() else None, 'after': addon_after}, 'oldTrek': {'before': EXPECTED_TREK, 'after': trek_after}}
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / 'deployment.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        for stage in [stage_index, stage_addon, stage_trek]:
            try:
                sftp.remove(stage)
            except FileNotFoundError:
                pass
        sftp.close()
        client.close()
        print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
