"""Deploy the bounded event-cycle hotfix with CAS, backup, and readiness checks."""
import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
APP = '/linhhoasu/lhs/newServer'
STAMP = 'event_cycle_hotfix_20261004_1445'
BACKUP = f'/linhhoasu/_ai_workbench/backups/{STAMP}_pre'
STAGE = f'/linhhoasu/_ai_workbench/temp/{STAMP}'
LOCAL = ROOT / '_ai_workbench/temp' / STAMP
FILES = {
    'src/services/ActivityCycleSchedule.js': ROOT / 'linhhoasu/lhs/newServer/src/services/ActivityCycleSchedule.js',
    'src/services/NewYearEventSchedule.js': ROOT / 'linhhoasu/lhs/newServer/src/services/NewYearEventSchedule.js',
}
BASELINE = {
    'src/services/ActivityCycleSchedule.js': '34d83eb4f3a61bcfdd147222489221a002d6bedeb5711d445b5cc47d2e9a9f81',
    'src/services/NewYearEventSchedule.js': '6bdef7b4d209e950461b1d32b523b5b3a34fd025ba9cc097c781797b8b7d6450',
}
PORTS = [8080, 8083, 8084, 8085, 8086, 8087, 8088]
PROCS = [f'lhs-s{sid}' for sid in [1001, 1002, 1003, 1004, 1005, 1006, 1007]]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def ready(ssh):
    result = {}
    for _ in range(10):
        result = {}
        for port in PORTS:
            try:
                body = run(ssh, f'curl -fsS --max-time 5 http://127.0.0.1:{port}/ready')
                parsed = json.loads(body)
                result[str(port)] = {
                    'http': 200,
                    'status': parsed.get('status'),
                    'mongo': parsed.get('checks', {}).get('mongo'),
                    'redis': parsed.get('checks', {}).get('redis'),
                }
            except Exception as exc:
                result[str(port)] = {'http': 0, 'error': str(exc)[-300:]}
        if all(x.get('http') == 200 and x.get('status') == 'ok' and x.get('mongo') is True and x.get('redis') is True for x in result.values()):
            return result
        time.sleep(2)
    return result


def main():
    LOCAL.mkdir(parents=True, exist_ok=True)
    candidate = {rel: path.read_bytes() for rel, path in FILES.items()}
    candidate_hashes = {rel: sha(data) for rel, data in candidate.items()}
    if candidate_hashes['src/services/ActivityCycleSchedule.js'] == BASELINE['src/services/ActivityCycleSchedule.js']:
        raise RuntimeError('candidate ActivityCycleSchedule was not changed')

    with connect() as ssh:
        if run(ssh, f'test -e {shlex.quote(BACKUP)} && echo yes || echo no').strip() != 'no':
            raise RuntimeError('remote backup already exists')
        for rel, expected in BASELINE.items():
            remote = f'{APP}/{rel}'
            actual = run(ssh, f"sha256sum {shlex.quote(remote)} | awk '{{print $1}}'").strip()
            if actual != expected:
                raise RuntimeError(f'CAS mismatch {rel}: {actual}')
        with ssh.open_sftp() as sftp:
            for rel, data in candidate.items():
                staged = f'{STAGE}/app/{rel}'
                run(ssh, f'mkdir -p {shlex.quote(staged.rsplit("/", 1)[0])}')
                with sftp.open(staged, 'wb') as handle:
                    handle.write(data)
                actual = run(ssh, f"sha256sum {shlex.quote(staged)} | awk '{{print $1}}'").strip()
                if actual != candidate_hashes[rel]:
                    raise RuntimeError(f'stage hash mismatch {rel}')
        for rel in FILES:
            run(ssh, f'node --check {shlex.quote(STAGE + "/app/" + rel)}')
        for rel in FILES:
            remote = f'{APP}/{rel}'
            backup = f'{BACKUP}/{rel}'
            staged = f'{STAGE}/app/{rel}'
            run(ssh, f'mkdir -p {shlex.quote(backup.rsplit("/", 1)[0])} && cp -p {shlex.quote(remote)} {shlex.quote(backup)}')
            tmp = remote + '.event-cycle-hotfix'
            run(ssh, f'cp {shlex.quote(staged)} {shlex.quote(tmp)} && mv {shlex.quote(tmp)} {shlex.quote(remote)}')
        for proc in PROCS:
            run(ssh, f'pm2 reload {shlex.quote(proc)} --update-env')
            time.sleep(1)
        time.sleep(2)
        readiness = ready(ssh)
        post_hashes = {rel: run(ssh, f"sha256sum {shlex.quote(APP + '/' + rel)} | awk '{{print $1}}'").strip() for rel in FILES}
        result = {
            'at': datetime.now(timezone.utc).isoformat(),
            'backup': BACKUP,
            'stage': STAGE,
            'candidate_hashes': candidate_hashes,
            'post_hashes': post_hashes,
            'readiness': readiness,
            'result': 'DEPLOY_VERIFIED' if post_hashes == candidate_hashes and all(
                x.get('http') == 200 and x.get('status') == 'ok' and x.get('mongo') is True and x.get('redis') is True
                for x in readiness.values()
            ) else 'HOLD',
        }
        (LOCAL / 'deploy.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
