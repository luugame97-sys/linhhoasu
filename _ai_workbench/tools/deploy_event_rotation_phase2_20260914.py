"""Deploy native activity cycle seeding for the first non-paid event families."""
import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run


WB = Path(__file__).resolve().parents[1]
ROOT = WB.parent / 'linhhoasu/lhs/newServer'
APP = '/linhhoasu/lhs/newServer'
STAGE = '/linhhoasu/_ai_workbench/temp/event_rotation_phase2_20260914'
BACKUP = '/linhhoasu/_ai_workbench/backups/event_rotation_phase2_20260914_pre'
LOCAL = WB / 'temp/event_rotation_phase2_20260914'
FILES = {
    'src/services/EventRotationRegistry.js': ROOT / 'src/services/EventRotationRegistry.js',
    'src/services/ActivityCycleSchedule.js': ROOT / 'src/services/ActivityCycleSchedule.js',
    'src/handlers/account.js': ROOT / 'src/handlers/account.js',
    'src/handlers/basic.js': ROOT / 'src/handlers/basic.js',
    'src/config/eventRotation.json': ROOT / 'src/config/eventRotation.json',
    'ecosystem.config.js': ROOT / 'ecosystem.config.js',
}
EXPECTED = {
    'src/services/EventRotationRegistry.js': '697035cced5b00972ab7b6a87ea957706c45832621e1f280587f4522a7192d14',
    'src/handlers/account.js': '0152e767495cb9e60638a7ab6a84e6ed825a61014c17cd5e595f1f2966c54fd3',
    'src/handlers/basic.js': '873762fe47f755338339d490dfede4303869697d5b29fe3dd5576b956d5b9653',
    'src/config/eventRotation.json': 'fcde2d6dedf00e42c351d9366c0a267f3cb2dab6bd556fbe68de4973ceca3808',
    'ecosystem.config.js': '55dd4e4ae923286e48564bd7aad45f548f3bc2152ad76845f48aed841a14229f',
    'src/services/ActivityCycleSchedule.js': None,
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def wait_ready(ssh):
    last = {}
    for _ in range(15):
        last = {}
        for port in [8080, 8083, 8084]:
            try:
                last[str(port)] = run(ssh, "curl -fsS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:" + str(port) + '/ready').strip()
            except RuntimeError:
                last[str(port)] = '000'
        if set(last.values()) == {'200'}:
            return last
        time.sleep(2)
    return last


def main():
    LOCAL.mkdir(parents=True, exist_ok=True)
    candidates = {rel: path.read_bytes() for rel, path in FILES.items()}
    candidate_hashes = {rel: sha(data) for rel, data in candidates.items()}
    ssh = connect()
    try:
        if run(ssh, 'test -e ' + shlex.quote(BACKUP) + ' && echo yes || echo no').strip() != 'no':
            raise RuntimeError('REMOTE_BACKUP_ALREADY_EXISTS')
        for rel, expected in EXPECTED.items():
            remote = APP + '/' + rel
            exists = run(ssh, 'test -e ' + shlex.quote(remote) + ' && echo yes || echo no').strip() == 'yes'
            if expected is None:
                if exists:
                    raise RuntimeError('NEW_FILE_ALREADY_EXISTS:' + rel)
            elif not exists or run(ssh, 'sha256sum ' + shlex.quote(remote) + " | awk '{print $1}'").strip() != expected:
                raise RuntimeError('BASELINE_MISMATCH:' + rel)
        with ssh.open_sftp() as sftp:
            for rel, data in candidates.items():
                staged = STAGE + '/app/' + rel
                run(ssh, 'mkdir -p ' + shlex.quote(staged.rsplit('/', 1)[0]))
                with sftp.open(staged, 'wb') as handle:
                    handle.write(data)
                if run(ssh, 'sha256sum ' + shlex.quote(staged) + " | awk '{print $1}'").strip() != candidate_hashes[rel]:
                    raise RuntimeError('STAGE_HASH_MISMATCH:' + rel)
        for rel in FILES:
            if rel.endswith('.js'):
                run(ssh, 'node --check ' + shlex.quote(STAGE + '/app/' + rel))
        for rel in FILES:
            remote = APP + '/' + rel
            staged = STAGE + '/app/' + rel
            if EXPECTED[rel] is not None:
                dst = BACKUP + '/' + rel
                run(ssh, 'mkdir -p ' + shlex.quote(dst.rsplit('/', 1)[0]) + ' && cp -p ' + shlex.quote(remote) + ' ' + shlex.quote(dst))
            tmp = remote + '.event-rotation-phase2'
            run(ssh, 'cp ' + shlex.quote(staged) + ' ' + shlex.quote(tmp) + ' && mv ' + shlex.quote(tmp) + ' ' + shlex.quote(remote))
        (LOCAL / 'apply-started.json').write_text(json.dumps({'at': datetime.now(timezone.utc).isoformat(), 'backup': BACKUP}, indent=2) + '\n', encoding='utf-8')
        for proc in ['lhs-s1001', 'lhs-s1002', 'lhs-s1003']:
            run(ssh, 'EVENT_ROTATION_ENABLED=1 EVENT_ROTATION_NATIVE_ENABLED=1 pm2 reload ' + shlex.quote(proc) + ' --update-env')
        ready = wait_ready(ssh)
        ps = json.loads(run(ssh, 'pm2 jlist'))
        pm2 = [{'name': p['name'], 'status': p['pm2_env']['status'], 'rotation': p['pm2_env'].get('EVENT_ROTATION_ENABLED'), 'native': p['pm2_env'].get('EVENT_ROTATION_NATIVE_ENABLED'), 'restarts': p['pm2_env']['restart_time']} for p in ps if p['name'] in ['lhs-s1001', 'lhs-s1002', 'lhs-s1003']]
        result = {'at': datetime.now(timezone.utc).isoformat(), 'files': candidate_hashes, 'ready': ready, 'pm2': pm2, 'backup': BACKUP}
        result['result'] = 'DEPLOY_VERIFIED' if set(ready.values()) == {'200'} and len(pm2) == 3 and all(x['status'] == 'online' and str(x['rotation']) == '1' and str(x['native']) == '1' for x in pm2) else 'HOLD'
        (LOCAL / 'deploy.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False))
    finally:
        ssh.close()


if __name__ == '__main__': main()
