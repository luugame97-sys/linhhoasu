"""Stage the scoped Võ hồn/Thần binh server release with live CAS checks.

Staging writes only a private remote workbench directory. It never changes live
source, PM2, flags, or player data.
"""
import hashlib
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

APP = '/linhhoasu/lhs/newServer'
OUT = WB / 'temp' / 'feature_unlock_release_20260917'
STAGE_ROOT = OUT / 'vo_hon_than_binh_stage'
REMOTE_BASE = '/linhhoasu/_ai_workbench/temp'
FILES = [
    'src/handlers/account.js',
    'src/handlers/upgrade.js',
    'src/handlers/playerPayload.js',
    'src/handlers/task.js',
    'src/handlers/arena.js',
    'src/handlers/mine.js',
    'src/handlers/artifact.js',
    'src/handlers/valhalla.js',
    'src/services/SideTaskProgressService.js',
    'src/services/FeatureMutationService.js',
    'src/services/DoubleTowerLifecycleService.js',
]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def pm2_state(ssh):
    rows = json.loads(run(ssh, 'pm2 jlist'))
    names = {'lhs-s1001', 'lhs-s1002', 'lhs-s1003', 'lhs-s1004'}
    return {p['name']: {'pid': p.get('pid'), 'status': p.get('pm2_env', {}).get('status'),
                        'restarts': p.get('pm2_env', {}).get('restart_time')}
            for p in rows if p.get('name') in names}


def main():
    candidate = OUT / 'candidate' / 'server'
    for rel in FILES:
        p = candidate / rel
        if not p.is_file():
            raise SystemExit('MISSING_CANDIDATE:' + rel)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    remote = REMOTE_BASE + '/feature_vo_hon_than_binh_' + stamp
    manifest = {'status': 'PREPARING', 'at': datetime.now(timezone.utc).isoformat(),
                'stage': remote, 'files': {}, 'productionWrites': 0, 'playerWrites': 0}
    ssh = connect()
    try:
        before = pm2_state(ssh)
        if len(before) != 4 or any(v['status'] != 'online' for v in before.values()):
            raise RuntimeError('GAME_NODES_NOT_READY')
        with ssh.open_sftp() as sftp:
            run(ssh, 'install -d -m 700 ' + shlex.quote(remote))
            for rel in FILES:
                local = candidate / rel
                target = APP + '/' + rel
                try:
                    old = sftp.open(target, 'rb').read()
                    before_hash = sha(old)
                except FileNotFoundError:
                    before_hash = None
                data = local.read_bytes()
                remote_stage = remote + '/' + rel
                run(ssh, 'install -d -m 700 ' + shlex.quote(str(Path(remote_stage).parent).replace('\\', '/')))
                with sftp.open(remote_stage, 'wb') as f:
                    f.write(data)
                if sha(sftp.open(remote_stage, 'rb').read()) != sha(data):
                    raise RuntimeError('STAGE_HASH_MISMATCH:' + rel)
                manifest['files'][rel] = {'path': target, 'before': before_hash,
                                          'candidate': sha(data), 'remote': remote_stage}
        for rel in FILES:
            run(ssh, 'node --check ' + shlex.quote(remote + '/' + rel))
        after = pm2_state(ssh)
        if after != before:
            raise RuntimeError('PROCESS_CHANGED_DURING_STAGE')
        manifest.update({'status': 'STAGED_SYNTAX_PASS', 'before': before, 'after': after,
                         'processesUnchanged': True})
        STAGE_ROOT.mkdir(parents=True, exist_ok=True)
        (STAGE_ROOT / 'stage.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'status': manifest['status'], 'stage': remote, 'files': len(FILES),
                          'processesUnchanged': True, 'productionWrites': 0}, ensure_ascii=False))
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
