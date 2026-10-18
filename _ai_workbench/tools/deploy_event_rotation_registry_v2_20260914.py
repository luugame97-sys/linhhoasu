"""Sync the fishing registry's complete rotation list without restarting nodes."""
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run


WB = Path(__file__).resolve().parents[1]
LOCAL_FILE = WB.parent / 'linhhoasu/lhs/newServer/src/config/eventRotation.json'
REMOTE_FILE = '/linhhoasu/lhs/newServer/src/config/eventRotation.json'
STAGE_FILE = '/linhhoasu/_ai_workbench/temp/event_rotation_registry_v2_20260914/eventRotation.json'
BACKUP_FILE = '/linhhoasu/_ai_workbench/backups/event_rotation_registry_v2_20260914_pre/src/config/eventRotation.json'
EXPECTED_BASELINE = '655e40dd08d8d04e6834b52698256f038430a3512f0a294aed157fcb123974a1'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
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
        tmp = REMOTE_FILE + '.registry-v2'
        run(ssh, 'cp ' + shlex.quote(STAGE_FILE) + ' ' + shlex.quote(tmp) + ' && mv ' + shlex.quote(tmp) + ' ' + shlex.quote(REMOTE_FILE))
        after = run(ssh, 'sha256sum ' + shlex.quote(REMOTE_FILE) + " | awk '{print $1}'").strip()
        result = {'at': datetime.now(timezone.utc).isoformat(), 'baseline': baseline, 'candidate': candidate_sha, 'remoteAfter': after, 'restart': 'none', 'backup': BACKUP_FILE}
        result['result'] = 'DEPLOY_VERIFIED' if after == candidate_sha else 'HOLD'
        out = WB / 'temp/event_rotation_registry_v2_20260914'; out.mkdir(parents=True, exist_ok=True)
        (out / 'deploy.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False))
    finally:
        ssh.close()


if __name__ == '__main__': main()
