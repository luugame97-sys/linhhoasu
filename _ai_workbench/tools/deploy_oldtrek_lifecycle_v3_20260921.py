"""Narrow OldTrek chat/lifecycle release with CAS, backup and readiness."""
import hashlib
import json
import shlex
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[2]
FILES = {
    '/linhhoasu/lhs/newServer/src/handlers/old-trek.js': ('linhhoasu/lhs/newServer/src/handlers/old-trek.js', '8d7f353a4ec49b0db3ab8930c399477b74e6a76d5363a447b4bb56e7948f581e'),
    '/linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js': ('linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js', '7c2c6f75ef3698bbac06c97c6a4c64187580ad033c568522f29b09228a212f5d'),
    '/linhhoasu/webgame/game/index.html': ('linhhoasu/webgame/game/index.html', '11bd728d915fc4bcb1bed9dac61b3cba1aa7f734ae1e0ac8df16a700451d1503'),
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/oldtrek_lifecycle_v3_{stamp}'
    report = {'at': datetime.now(timezone.utc).isoformat(), 'backup': backup, 'directPlayerWrites': 0, 'restarts': 0, 'files': {}}
    ssh = connect()
    try:
        with ssh.open_sftp() as sftp:
            before = {}
            for remote, (_, expected) in FILES.items():
                data = sftp.open(remote, 'rb').read()
                if sha(data) != expected:
                    raise RuntimeError('CAS_DRIFT:' + remote)
                before[remote] = data
            run(ssh, 'mkdir ' + shlex.quote(backup))
            for remote, (local, _) in FILES.items():
                payload = (ROOT / local).read_bytes()
                saved = backup + '/' + remote.rsplit('/', 1)[-1]
                staged = remote + '.oldtrek-stage-' + stamp + ('.js' if remote.endswith('.js') else '.html')
                with sftp.open(saved, 'wb') as handle:
                    handle.write(before[remote])
                with sftp.open(staged, 'wb') as handle:
                    handle.write(payload)
                if sha(sftp.open(saved, 'rb').read()) != sha(before[remote]):
                    raise RuntimeError('BACKUP_HASH_MISMATCH')
                if sha(sftp.open(staged, 'rb').read()) != sha(payload):
                    raise RuntimeError('STAGE_HASH_MISMATCH')
                run(ssh, 'chown --reference=' + shlex.quote(remote) + ' ' + shlex.quote(staged))
                run(ssh, 'chmod --reference=' + shlex.quote(remote) + ' ' + shlex.quote(staged))
                if remote.endswith('.js'):
                    run(ssh, 'node --check ' + shlex.quote(staged))
                if sha(sftp.open(remote, 'rb').read()) != sha(before[remote]):
                    raise RuntimeError('PRE_SWAP_CAS_DRIFT')
                sftp.posix_rename(staged, remote)
                if sha(sftp.open(remote, 'rb').read()) != sha(payload):
                    raise RuntimeError('LIVE_HASH_MISMATCH')
                report['files'][remote] = {'before': sha(before[remote]), 'after': sha(payload)}
        for name, port in [('lhs-s1001',8080),('lhs-s1002',8083),('lhs-s1003',8084),('lhs-s1004',8085),('lhs-s1005',8086)]:
            run(ssh, 'pm2 restart ' + name)
            report['restarts'] += 1
            ready = False
            for _ in range(10):
                code = run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 3 http://127.0.0.1:{port}/ready || true").strip()
                if code == '200':
                    ready = True
                    break
                time.sleep(2)
            report.setdefault('readiness', {})[str(port)] = code
            if not ready:
                raise RuntimeError('READY_FAILED:' + name)
        addon = run(ssh, 'curl -fsS --max-time 10 http://127.0.0.1:81/js/lhs-oldtrek-errors-v1.js').encode()
        index = run(ssh, 'curl -fsS --max-time 10 http://127.0.0.1:81/').encode()
        report['servedAddonHash'] = sha(addon)
        report['servedIndexHash'] = sha(index)
        if sha(addon) != report['files']['/linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js']['after']:
            raise RuntimeError('SERVED_ADDON_HASH_MISMATCH')
        if sha(index) != report['files']['/linhhoasu/webgame/game/index.html']['after']:
            raise RuntimeError('SERVED_INDEX_HASH_MISMATCH')
        report['status'] = 'DEPLOYED'
        print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
    finally:
        ssh.close()
        (ROOT / '_ai_workbench/temp/oldtrek_lifecycle_v3_deploy_20260921.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
