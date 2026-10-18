"""Narrow client-only release. Refuse index drift, no service restarts."""
import hashlib
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[2]
CLIENT = '/linhhoasu/webgame/game'
INDEX = CLIENT + '/index.html'
ADDON = CLIENT + '/js/lhs-oldtrek-errors-v1.js'
anchor = '"js/lhs-cross-events-v2.js?v=20260917_parallel_v2",'
insertion = '\n\t\t"js/lhs-oldtrek-errors-v1.js?v=20260921_v1",'
sha = lambda b: hashlib.sha256(b).hexdigest()

def main():
    ssh = connect()
    report = {'at': datetime.now(timezone.utc).isoformat(), 'directPlayerWrites': 0, 'restarts': 0}
    backup = '/linhhoasu/_ai_workbench/backups/oldtrek_guard_' + datetime.now().strftime('%Y%m%d_%H%M%S')
    try:
        with ssh.open_sftp() as sftp:
            before = sftp.open(INDEX, 'rb').read()
            source = before.decode('utf-8')
            if source.count(anchor) != 1:
                raise RuntimeError('INDEX_ANCHOR_CHANGED')
            newline = '\r\n' if '\r\n' in source else '\n'
            candidate = source.replace(anchor, anchor + insertion.replace('\n', newline)).encode('utf-8') if 'lhs-oldtrek-errors-v1.js' not in source else before
            addon = (ROOT / 'linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js').read_bytes()
            try:
                sftp.stat(ADDON)
                raise RuntimeError('ADDON_ALREADY_EXISTS')
            except FileNotFoundError:
                pass
            run(ssh, 'mkdir ' + shlex.quote(backup))
            run(ssh, 'cp -p ' + shlex.quote(INDEX) + ' ' + shlex.quote(backup + '/index.html'))
            if sha(sftp.open(backup + '/index.html', 'rb').read()) != sha(before):
                raise RuntimeError('BACKUP_HASH_MISMATCH')
            targets = [(ADDON, addon)]
            if candidate != before:
                targets.append((INDEX, candidate))
            for target, content in targets:
                temp = target + '.oldtrek-stage-' + datetime.now().strftime('%H%M%S') if target == INDEX else target + '.oldtrek-stage-' + datetime.now().strftime('%H%M%S') + '.js'
                with sftp.open(temp, 'wb') as handle:
                    handle.write(content)
                if sha(sftp.open(temp, 'rb').read()) != sha(content):
                    raise RuntimeError('STAGE_HASH_MISMATCH')
                run(ssh, 'chown --reference=' + shlex.quote(INDEX) + ' ' + shlex.quote(temp))
                run(ssh, 'chmod 644 ' + shlex.quote(temp))
                if target == ADDON:
                    run(ssh, 'node --check ' + shlex.quote(temp))
                elif sha(sftp.open(INDEX, 'rb').read()) != sha(before):
                    raise RuntimeError('INDEX_CAS_DRIFT')
                sftp.posix_rename(temp, target)
                if sha(sftp.open(target, 'rb').read()) != sha(content):
                    raise RuntimeError('LIVE_HASH_MISMATCH')
            served = run(ssh, 'curl -fsS --max-time 10 http://127.0.0.1:81/js/lhs-oldtrek-errors-v1.js').encode('utf-8')
            if sha(served) != sha(addon):
                raise RuntimeError('HTTP_ADDON_HASH_MISMATCH')
            served_index = run(ssh, 'curl -fsS --max-time 10 http://127.0.0.1:81/').encode('utf-8')
            if sha(served_index) != sha(candidate):
                raise RuntimeError('HTTP_INDEX_HASH_MISMATCH')
            report.update(status='DEPLOYED', backup=backup, indexBefore=sha(before), indexAfter=sha(candidate), addon=sha(addon))
    finally:
        ssh.close()
        (ROOT / '_ai_workbench/temp/oldtrek_guard_release_20260921.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    main()
