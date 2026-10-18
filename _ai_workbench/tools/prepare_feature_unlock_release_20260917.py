"""Fetch an exact live source baseline for the feature-unlock release.

Read-only: no remote file writes, DB writes, process restarts, or config changes.
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

OUT = WB / 'temp' / 'feature_unlock_release_20260917'
SERVER_ROOT = OUT / 'candidate' / 'server'
CLIENT_ROOT = OUT / 'candidate' / 'client'
REMOTE_APP = '/linhhoasu/lhs/newServer'
REMOTE_GAME = '/linhhoasu/webgame/game'

SERVER_FILES = [
    'src/handlers/account.js', 'src/handlers/index.js', 'src/handlers/upgrade.js',
    'src/handlers/playerPayload.js', 'src/handlers/task.js', 'src/handlers/farm.js',
    'src/handlers/raid.js', 'src/handlers/arena.js', 'src/handlers/mine.js',
    'src/handlers/artifact.js', 'src/handlers/valhalla.js', 'src/handlers/bloodline.js',
    'src/handlers/curios.js', 'src/handlers/elf.js', 'src/services/ConfigService.js',
    'src/services/RealmTaskProgressService.js', 'src/services/MainTaskProgressService.js',
    'src/services/BattleService.js', 'src/services/CrossArenaService.js',
    'src/services/PlayerService.js', 'src/services/PlayerMutationService.js',
    'src/services/ServerConfigService.js', 'src/services/FishingEventSchedule.js',
    'src/router.js', 'src/app.js', 'src/config/crossServerEventSchedule.json',
    'src/config/fishingGameplayBalance.json', 'package.json',
]
CLIENT_FILES = [
    'index.html', 'js/main.min_drop100.js', 'js/lhs-fashion-day1-v1.js',
    'js/lhs-fashion-gear-v1.js', 'js/lhs-fashion-content-v1.js',
]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    if (OUT / 'baseline.json').exists():
        raise RuntimeError('BASELINE_ALREADY_EXISTS_DO_NOT_OVERWRITE_CANDIDATE')
    ssh = connect()
    try:
        processes = json.loads(run(ssh, 'pm2 jlist'))
        nodes = [p for p in processes if p.get('name') in {'lhs-s1001', 'lhs-s1002', 'lhs-s1003', 'lhs-s1004'}]
        if len(nodes) != 4 or any(p.get('pm2_env', {}).get('pm_cwd') != REMOTE_APP for p in nodes):
            raise RuntimeError('FEATURE_RELEASE_RUNTIME_MISMATCH')
        ready = {}
        for port in (8080, 8083, 8084, 8085):
            ready[str(port)] = run(ssh, f'curl -s --max-time 8 -o /dev/null -w %{{http_code}} http://127.0.0.1:{port}/ready').strip()
        if any(v != '200' for v in ready.values()):
            raise RuntimeError('FEATURE_RELEASE_BASELINE_NOT_READY:' + json.dumps(ready))
        manifest = {
            'status': 'BASELINE_FETCHED',
            'at': datetime.now(timezone.utc).isoformat(),
            'remoteApp': REMOTE_APP,
            'remoteGame': REMOTE_GAME,
            'processes': [
                {'name': p['name'], 'pid': p['pid'], 'status': p['pm2_env']['status'],
                 'restarts': p['pm2_env']['restart_time'], 'startedAt': p['pm2_env']['pm_uptime'],
                 'cwd': p['pm2_env']['pm_cwd'], 'errorLog': p['pm2_env'].get('pm_err_log_path'),
                 'outLog': p['pm2_env'].get('pm_out_log_path')}
                for p in nodes
            ],
            'ready': ready,
            'productionWrites': 0,
            'realPlayerWrites': 0,
            'files': {},
        }
        with ssh.open_sftp() as sftp:
            for rel in SERVER_FILES:
                data = sftp.open(REMOTE_APP + '/' + rel, 'rb').read()
                dest = SERVER_ROOT / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(data)
                manifest['files'][REMOTE_APP + '/' + rel] = {'sha256': sha(data), 'bytes': len(data), 'kind': 'server'}
            for rel in CLIENT_FILES:
                data = sftp.open(REMOTE_GAME + '/' + rel, 'rb').read()
                dest = CLIENT_ROOT / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(data)
                manifest['files'][REMOTE_GAME + '/' + rel] = {'sha256': sha(data), 'bytes': len(data), 'kind': 'client'}
        (OUT / 'baseline.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        after = json.loads(run(ssh, 'pm2 jlist'))
        after_nodes = [p for p in after if p.get('name') in {'lhs-s1001', 'lhs-s1002', 'lhs-s1003', 'lhs-s1004'}]
        before_state = [(p['name'], p['pid'], p['pm2_env']['restart_time']) for p in nodes]
        after_state = [(p['name'], p['pid'], p['pm2_env']['restart_time']) for p in after_nodes]
        manifest['processesUnchanged'] = before_state == after_state
        if not manifest['processesUnchanged']:
            raise RuntimeError('FEATURE_RELEASE_BASELINE_PROCESS_CHANGED')
        (OUT / 'baseline.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'status': manifest['status'], 'output': str(OUT), 'ready': ready,
                          'files': len(manifest['files']), 'processesUnchanged': manifest['processesUnchanged']}))
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
