"""Repair the live game manifest to use the authoritative level100 bundle."""
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / 'linhhoasu/webgame/game/index.html'
REMOTE = '/linhhoasu/webgame/game/index.html'
EXPECTED_LIVE = 'c69e460f8fd7bc1857eed5305be5167d762c1dc39133351c97d4ac7e10232227'
EXPECTED_MAIN = '32789554f25db0a06ee614e45b47356f8e800a23b0955386029ff0e6630a3e46'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    candidate = LOCAL.read_bytes()
    text = candidate.decode('utf-8')
    if text.count('js/main.min_drop100.js?v=20260915_drop100_restore_v2') != 1:
        raise RuntimeError('LOCAL_MAIN_DROP100_MARKER_MISSING')
    if 'js/main.min_a6195824.js' in text:
        raise RuntimeError('LOCAL_STALE_MAIN_REFERENCE')
    for marker in [
        '20260915_auto_sale_reconcile_v1',
        '20260915_player_healthbar_hud_v6',
        '20260915_formation_singleflight_v3',
        '20260915_mount_singleflight_v2',
    ]:
        if text.count(marker) != 1:
            raise RuntimeError('LOCAL_MARKER_MISSING:' + marker)

    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/index_main_bundle_guard_{stamp}'
    stage = f'/linhhoasu/_ai_workbench/temp/index_main_bundle_guard_{stamp}'
    evidence = {
        'startedAt': datetime.now(timezone.utc).isoformat(),
        'backup': backup,
        'stage': stage,
        'candidateSha256': sha(candidate),
        'mainSha256': EXPECTED_MAIN,
        'realPlayerWrites': 0,
        'serverRestarted': [],
    }
    ssh = connect()
    try:
        with ssh.open_sftp() as sftp:
            old = sftp.open(REMOTE, 'rb').read()
            if sha(old) != EXPECTED_LIVE:
                raise RuntimeError('LIVE_INDEX_CAS_CHANGED:' + sha(old))
            old_text = old.decode('utf-8')
            if old_text.count('js/main.min_a6195824.js') != 1:
                raise RuntimeError('LIVE_STALE_MARKER_NOT_FOUND')
        run(ssh, 'mkdir -p ' + shlex.quote(backup) + ' ' + shlex.quote(stage))
        with ssh.open_sftp() as sftp:
            with sftp.open(backup + '/index.html.before', 'wb') as handle:
                handle.write(old)
            with sftp.open(stage + '/index.html', 'wb') as handle:
                handle.write(candidate)
            temp = REMOTE + '.main_bundle_guard_tmp'
            with sftp.open(temp, 'wb') as handle:
                handle.write(candidate)
            if sha(sftp.open(temp, 'rb').read()) != sha(candidate):
                raise RuntimeError('STAGE_HASH_MISMATCH')
            sftp.posix_rename(temp, REMOTE)
        served_index = run(ssh, 'curl -fsS --max-time 15 http://127.0.0.1:81/index.html')
        served_main = run(
            ssh,
            "curl -fsS --max-time 20 'http://127.0.0.1:81/update/resource/assets/excel/config_e5ac72c2.bin?v=20260915_drop100_restore_v2' | sha256sum",
        ).split()[0]
        if served_index.count('js/main.min_drop100.js?v=20260915_drop100_restore_v2') != 1:
            raise RuntimeError('SERVED_MAIN_MARKER_MISSING')
        if 'js/main.min_a6195824.js' in served_index:
            raise RuntimeError('SERVED_STALE_MAIN_REFERENCE')
        if served_main != EXPECTED_MAIN:
            raise RuntimeError('SERVED_CONFIG_HASH_MISMATCH:' + served_main)
        evidence.update({
            'result': 'REPAIRED_VERIFIED',
            'servedIndexSha256': sha(served_index.encode('utf-8')),
            'servedMainConfigSha256': served_main,
            'indexMarker': True,
            'finishedAt': datetime.now(timezone.utc).isoformat(),
        })
    except Exception as error:
        evidence['result'] = 'FAILED'
        evidence['error'] = str(error)
        try:
            if evidence.get('result') == 'FAILED':
                with ssh.open_sftp() as sftp:
                    current = sftp.open(REMOTE, 'rb').read()
                    if sha(current) == sha(candidate):
                        temp = REMOTE + '.main_bundle_guard_rollback'
                        with sftp.open(temp, 'wb') as handle:
                            handle.write(old)
                        sftp.posix_rename(temp, REMOTE)
        finally:
            pass
        raise
    finally:
        ssh.close()
        out = ROOT / '_ai_workbench/temp/index_main_bundle_guard_20260915'
        out.mkdir(parents=True, exist_ok=True)
        (out / 'release.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(evidence, ensure_ascii=False))


if __name__ == '__main__':
    main()
