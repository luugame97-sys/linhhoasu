"""Deploy the narrow OldTrek chat-contract fix with backup/CAS/read-back."""
import hashlib
import json
import shlex
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
SERVER_ROOT = '/linhhoasu/lhs/newServer'
CLIENT_ROOT = '/linhhoasu/webgame/game'
FILES = {
    SERVER_ROOT + '/src/handlers/old-trek.js': ROOT / 'linhhoasu/lhs/newServer/src/handlers/old-trek.js',
    CLIENT_ROOT + '/js/lhs-oldtrek-errors-v1.js': ROOT / 'linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js',
}
EXPECTED = {
    SERVER_ROOT + '/src/handlers/old-trek.js': '9b4cda8aa0efa0bfe678c2f56457740275a3684ce405117ce3d0097e059031d7',
    CLIENT_ROOT + '/js/lhs-oldtrek-errors-v1.js': '5ff7dc96feade1c7237d99c6983d9df1950cc0c8be56b7708263e54287093bfb',
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/oldtrek_chat_latency_fix_{stamp}'
    stage = f'/tmp/oldtrek_chat_latency_fix_{stamp}'
    report = {
        'at': datetime.now(timezone.utc).isoformat(),
        'backup': backup,
        'productionPlayerWrites': 0,
        'restarts': 0,
        'files': {},
    }
    ssh = connect()
    try:
        with ssh.open_sftp() as sftp:
            run(ssh, 'mkdir -p ' + shlex.quote(backup) + ' ' + shlex.quote(stage))
            for remote, local in FILES.items():
                before = sftp.open(remote, 'rb').read()
                before_sha = sha(before)
                if before_sha != EXPECTED[remote]:
                    raise RuntimeError(f'CAS:{remote}:{before_sha}')
                payload = local.read_bytes()
                staged = stage + '/' + remote.rsplit('/', 1)[-1]
                backup_path = backup + '/' + remote.rsplit('/', 1)[-1]
                with sftp.open(backup_path, 'wb') as handle:
                    handle.write(before)
                with sftp.open(staged, 'wb') as handle:
                    handle.write(payload)
                if sha(sftp.open(backup_path, 'rb').read()) != before_sha:
                    raise RuntimeError('BACKUP_HASH_MISMATCH:' + remote)
                if sha(sftp.open(staged, 'rb').read()) != sha(payload):
                    raise RuntimeError('STAGE_HASH_MISMATCH:' + remote)
                run(ssh, 'node --check ' + shlex.quote(staged))
                run(ssh, 'mv -f ' + shlex.quote(staged) + ' ' + shlex.quote(remote))
                live = sftp.open(remote, 'rb').read()
                if sha(live) != sha(payload):
                    raise RuntimeError('LIVE_HASH_MISMATCH:' + remote)
                report['files'][remote] = {'before': before_sha, 'after': sha(payload), 'bytes': len(payload)}

            # The addon is already referenced by the live index; fail closed if
            # a concurrent index edit removed it while this deploy was staged.
            index = sftp.open(CLIENT_ROOT + '/index.html', 'rb').read().decode('utf-8', 'replace')
            if 'js/lhs-oldtrek-errors-v1.js?v=20260921_v2' not in index:
                raise RuntimeError('CLIENT_INDEX_ADDON_REFERENCE_MISSING')

        for node in ['lhs-s1001', 'lhs-s1002', 'lhs-s1003', 'lhs-s1004', 'lhs-s1005']:
            run(ssh, f'OLD_TREK_EVENT_ENGINE_ENABLED=1 OLD_TREK_SETTLEMENT_ENABLED=1 OLD_TREK_SETTLEMENT_ACTIVATION_AT=1789956000000 pm2 restart {node} --update-env')
            time.sleep(2)
            rows = json.loads(run(ssh, 'pm2 jlist'))
            row = next(item for item in rows if item.get('name') == node)
            if row.get('pm2_env', {}).get('status') != 'online':
                raise RuntimeError('PM2_NOT_ONLINE:' + node)
            report['restarts'] += 1

        report['readiness'] = {}
        for port in [8080, 8083, 8084, 8085, 8086]:
            code = run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 8 http://127.0.0.1:{port}/ready").strip()
            report['readiness'][str(port)] = int(code)
            if code != '200':
                raise RuntimeError('READY:' + str(port))

        served_addon = run(ssh, 'curl -fsS --max-time 10 http://127.0.0.1:81/js/lhs-oldtrek-errors-v1.js')
        served_index = run(ssh, 'curl -fsS --max-time 10 http://127.0.0.1:81/')
        report['served'] = {
            'addonHash': sha(served_addon.encode()),
            'addonHashMatches': sha(served_addon.encode()) == report['files'][CLIENT_ROOT + '/js/lhs-oldtrek-errors-v1.js']['after'],
            'indexReferencesAddon': 'js/lhs-oldtrek-errors-v1.js?v=20260921_v2' in served_index,
        }
        report['recentOldTrekErrors'] = run(
            ssh,
            "for f in /root/.pm2/logs/lhs-s100*-error.log; do tail -n 600 \"$f\" 2>/dev/null; done | grep -E 'TypeError|OLD_TREK|OldTrek' | tail -n 40 || true",
        ).strip()
        run(ssh, 'rm -rf ' + shlex.quote(stage))
        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
