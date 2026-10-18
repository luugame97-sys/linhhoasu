"""Deploy the first safe event-rotation phase: perpetual free fishing cycles."""
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
REMOTE_STAGE = '/linhhoasu/_ai_workbench/temp/event_rotation_phase1_20260914'
BACKUP = '/linhhoasu/_ai_workbench/backups/event_rotation_phase1_20260914_pre'
LOCAL = WB / 'temp/event_rotation_phase1_20260914'
FILES = {
    'src/services/FishingEventSchedule.js': ROOT / 'src/services/FishingEventSchedule.js',
    'src/services/EventRewardSettlementService.js': ROOT / 'src/services/EventRewardSettlementService.js',
    'src/services/EventRotationRegistry.js': ROOT / 'src/services/EventRotationRegistry.js',
    'src/config/eventRotation.json': ROOT / 'src/config/eventRotation.json',
    'ecosystem.config.js': ROOT / 'ecosystem.config.js',
}
EXPECTED = {
    'src/services/FishingEventSchedule.js': 'f52c6e2accc850ec7791f07d49713f11168120fa331ee88c0e1e2b79c6974fb0',
    'src/services/EventRewardSettlementService.js': '636204f8bc38ba6963b815557c54f9a9997e60500d8be9c74adca4a7d5de18c2',
    'ecosystem.config.js': '103569877a7e8b516ebc5f6a540a4b0f9f486b156776492c7169792d5a011909',
    'src/services/EventRotationRegistry.js': None,
    'src/config/eventRotation.json': None,
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def remote_digest(ssh, path):
    return run(ssh, 'sha256sum ' + shlex.quote(path) + " | awk '{print $1}'").strip()


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
            if expected is None:
                if run(ssh, 'test -e ' + shlex.quote(remote) + ' && echo yes || echo no').strip() != 'no':
                    raise RuntimeError('NEW_FILE_ALREADY_EXISTS:' + rel)
            elif remote_digest(ssh, remote) != expected:
                raise RuntimeError('BASELINE_MISMATCH:' + rel)
        with ssh.open_sftp() as sftp:
            for rel, data in candidates.items():
                staged = REMOTE_STAGE + '/app/' + rel
                run(ssh, 'mkdir -p ' + shlex.quote(staged.rsplit('/', 1)[0]))
                with sftp.open(staged, 'wb') as handle:
                    handle.write(data)
                if remote_digest(ssh, staged) != candidate_hashes[rel]:
                    raise RuntimeError('STAGE_HASH_MISMATCH:' + rel)
        run(ssh, 'node --check ' + shlex.quote(REMOTE_STAGE + '/app/src/services/EventRotationRegistry.js'))
        run(ssh, 'node --check ' + shlex.quote(REMOTE_STAGE + '/app/src/services/FishingEventSchedule.js'))
        run(ssh, 'node --check ' + shlex.quote(REMOTE_STAGE + '/app/src/services/EventRewardSettlementService.js'))
        for rel in FILES:
            remote = APP + '/' + rel
            dst = BACKUP + '/' + rel
            if EXPECTED[rel] is not None:
                run(ssh, 'mkdir -p ' + shlex.quote(dst.rsplit('/', 1)[0]) + ' && cp -p ' + shlex.quote(remote) + ' ' + shlex.quote(dst))
            staged = REMOTE_STAGE + '/app/' + rel
            tmp = remote + '.event-rotation-phase1'
            run(ssh, 'cp ' + shlex.quote(staged) + ' ' + shlex.quote(tmp) + ' && mv ' + shlex.quote(tmp) + ' ' + shlex.quote(remote))
        (LOCAL / 'apply-started.json').write_text(json.dumps({'at': datetime.now(timezone.utc).isoformat(), 'backup': BACKUP}, indent=2) + '\n', encoding='utf-8')
        for proc in ['lhs-s1001', 'lhs-s1002', 'lhs-s1003']:
            run(ssh, 'EVENT_ROTATION_ENABLED=1 pm2 reload ' + shlex.quote(proc) + ' --update-env')
        ready = wait_ready(ssh)
        pm2 = run(ssh, "pm2 jlist | node -e " + shlex.quote("let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-s100[123]$/.test(p.name)).map(p=>({name:p.name,status:p.pm2_env.status,rotation:p.pm2_env.EVENT_ROTATION_ENABLED,restarts:p.pm2_env.restart_time})))));"))
        result = {'at': datetime.now(timezone.utc).isoformat(), 'files': candidate_hashes, 'ready': ready, 'pm2': json.loads(pm2), 'backup': BACKUP}
        result['result'] = 'DEPLOY_VERIFIED' if set(ready.values()) == {'200'} and len(result['pm2']) == 3 and all(x['status'] == 'online' and str(x['rotation']) == '1' for x in result['pm2']) else 'HOLD'
        (LOCAL / 'deploy.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False))
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
