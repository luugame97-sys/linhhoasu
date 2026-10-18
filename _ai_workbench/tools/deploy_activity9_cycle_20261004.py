"""Deploy the Activity9 cycle reset candidate with CAS and readiness checks."""
import hashlib
import json
import shlex
import time
from datetime import datetime, timezone
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
APP = '/linhhoasu/lhs/newServer'
STAMP = 'activity9_cycle_20261004_1448'
BACKUP = f'/linhhoasu/_ai_workbench/backups/{STAMP}_pre'
STAGE = f'/linhhoasu/_ai_workbench/temp/{STAMP}'
LOCAL = ROOT / '_ai_workbench/temp' / STAMP
FILES = {
    'src/services/Activity9Service.js': ROOT / '_ai_workbench/temp/events_full_20261004/candidate/src/services/Activity9Service.js',
    'src/handlers/activity.js': ROOT / '_ai_workbench/temp/events_full_20261004/candidate/src/handlers/activity.js',
}
BASELINE = {
    'src/services/Activity9Service.js': '688a4a59f34fe91facea9d2072ee1da8bd92b13b85668f4d7ed896376824bd71',
    'src/handlers/activity.js': '9054040dee6f5bdea8dde7324abdad2bc631620f3f2dbae28e50167f74a41582',
}
PROCS = [f'lhs-s{sid}' for sid in [1001, 1002, 1003, 1004, 1005, 1006, 1007]]
PORTS = [8080, 8083, 8084, 8085, 8086, 8087, 8088]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def readiness(ssh):
    result = {}
    for _ in range(10):
        result = {}
        for port in PORTS:
            try:
                parsed = json.loads(run(ssh, f'curl -fsS --max-time 5 http://127.0.0.1:{port}/ready'))
                result[str(port)] = {'http': 200, 'status': parsed.get('status'), 'mongo': parsed.get('checks', {}).get('mongo'), 'redis': parsed.get('checks', {}).get('redis')}
            except Exception as exc:
                result[str(port)] = {'http': 0, 'error': str(exc)[-250:]}
        if all(x.get('http') == 200 and x.get('status') == 'ok' and x.get('mongo') is True and x.get('redis') is True for x in result.values()):
            return result
        time.sleep(2)
    return result


def main():
    LOCAL.mkdir(parents=True, exist_ok=True)
    candidate = {rel: path.read_bytes() for rel, path in FILES.items()}
    candidate_hashes = {rel: sha(data) for rel, data in candidate.items()}
    with connect() as ssh:
        if run(ssh, f'test -e {shlex.quote(BACKUP)} && echo yes || echo no').strip() != 'no':
            raise RuntimeError('remote backup already exists')
        for rel, expected in BASELINE.items():
            actual = run(ssh, f"sha256sum {shlex.quote(APP + '/' + rel)} | awk '{{print $1}}'").strip()
            if actual != expected:
                raise RuntimeError(f'CAS mismatch {rel}: {actual}')
        with ssh.open_sftp() as sftp:
            for rel, data in candidate.items():
                staged = f'{STAGE}/app/{rel}'
                run(ssh, f'mkdir -p {shlex.quote(staged.rsplit("/", 1)[0])}')
                with sftp.open(staged, 'wb') as handle:
                    handle.write(data)
                if run(ssh, f"sha256sum {shlex.quote(staged)} | awk '{{print $1}}'").strip() != candidate_hashes[rel]:
                    raise RuntimeError(f'stage hash mismatch {rel}')
        for rel in FILES:
            run(ssh, f'node --check {shlex.quote(STAGE + "/app/" + rel)}')
        for rel in FILES:
            remote = APP + '/' + rel
            backup = BACKUP + '/' + rel
            staged = STAGE + '/app/' + rel
            run(ssh, f'mkdir -p {shlex.quote(backup.rsplit("/", 1)[0])} && cp -p {shlex.quote(remote)} {shlex.quote(backup)}')
            tmp = remote + '.activity9-cycle'
            run(ssh, f'cp {shlex.quote(staged)} {shlex.quote(tmp)} && mv {shlex.quote(tmp)} {shlex.quote(remote)}')
        for proc in PROCS:
            run(ssh, f'pm2 reload {shlex.quote(proc)} --update-env')
            time.sleep(1)
        result = {'at': datetime.now(timezone.utc).isoformat(), 'backup': BACKUP, 'stage': STAGE,
                  'candidate_hashes': candidate_hashes,
                  'post_hashes': {rel: run(ssh, f"sha256sum {shlex.quote(APP + '/' + rel)} | awk '{{print $1}}'").strip() for rel in FILES},
                  'readiness': readiness(ssh)}
        result['result'] = 'DEPLOY_VERIFIED' if result['post_hashes'] == candidate_hashes and all(x.get('http') == 200 and x.get('status') == 'ok' and x.get('mongo') is True and x.get('redis') is True for x in result['readiness'].values()) else 'HOLD'
        (LOCAL / 'deploy.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
