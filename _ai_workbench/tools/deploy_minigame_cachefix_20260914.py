"""Bump the JavaScript bundle query tokens for the mini-game release."""
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run


WB = Path(__file__).resolve().parents[1]
LOCAL_FILE = WB.parent / 'linhhoasu/webgame/game/index.html'
REMOTE_FILE = '/linhhoasu/webgame/game/index.html'
STAGE_FILE = '/linhhoasu/_ai_workbench/temp/minigame_open_cachefix_20260914/index.html'
BACKUP_FILE = '/linhhoasu/_ai_workbench/backups/minigame_open_cachefix_20260914_pre/webgame/game/index.html'
OUT = WB / 'temp/minigame_open_cachefix_20260914'
EXPECTED_BASELINE = '31962b67818644f073073100a1a181a3bc2185de8aa2cdc2941d0fc0698efee7'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    candidate = LOCAL_FILE.read_bytes()
    candidate_sha = sha(candidate)
    ssh = connect()
    try:
        if run(ssh, 'test -e ' + shlex.quote(BACKUP_FILE) + ' && echo yes || echo no').strip() != 'no':
            raise RuntimeError('REMOTE_BACKUP_ALREADY_EXISTS')
        baseline = run(ssh, 'sha256sum ' + shlex.quote(REMOTE_FILE) + " | awk '{print $1}'").strip()
        if baseline != EXPECTED_BASELINE:
            raise RuntimeError('BASELINE_MISMATCH:' + baseline)
        run(ssh, 'mkdir -p ' + shlex.quote(STAGE_FILE.rsplit('/', 1)[0]))
        with ssh.open_sftp() as sftp:
            with sftp.open(STAGE_FILE, 'wb') as handle:
                handle.write(candidate)
        staged = run(ssh, 'sha256sum ' + shlex.quote(STAGE_FILE) + " | awk '{print $1}'").strip()
        if staged != candidate_sha:
            raise RuntimeError('STAGE_HASH_MISMATCH:' + staged)
        run(ssh, 'mkdir -p ' + shlex.quote(BACKUP_FILE.rsplit('/', 1)[0]) + ' && cp -p ' + shlex.quote(REMOTE_FILE) + ' ' + shlex.quote(BACKUP_FILE))
        tmp = REMOTE_FILE + '.cachefix-20260914'
        run(ssh, 'cp ' + shlex.quote(STAGE_FILE) + ' ' + shlex.quote(tmp) + ' && mv ' + shlex.quote(tmp) + ' ' + shlex.quote(REMOTE_FILE))
        after = run(ssh, 'sha256sum ' + shlex.quote(REMOTE_FILE) + " | awk '{print $1}'").strip()
        served = run(ssh, 'curl -fsS --max-time 10 http://127.0.0.1:81/index.html')
        ready = {}
        for port in [8080, 8083, 8084]:
            ready[str(port)] = run(ssh, "curl -fsS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:" + str(port) + '/ready').strip()
        result = {
            'at': datetime.now(timezone.utc).isoformat(),
            'baseline': baseline,
            'candidate': candidate_sha,
            'remoteAfter': after,
            'served': {
                'cacheMarker': '20260914_minigame_open_v1' in served,
                'startQuery': 'js/start.min_52ac8d58.js?v=20260914_minigame_open_v1' in served,
                'mainQuery': 'js/main.min_a6195824.js?v=20260914_minigame_open_v1' in served,
            },
            'ready': ready,
            'restart': 'none',
            'backup': BACKUP_FILE,
        }
        result['result'] = 'DEPLOY_VERIFIED' if after == candidate_sha and all(result['served'].values()) and set(ready.values()) == {'200'} else 'HOLD'
        (OUT / 'deploy.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False))
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
