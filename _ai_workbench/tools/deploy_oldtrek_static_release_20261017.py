"""CAS/atomic deploy of the verified shared OldTrek client release; no player writes."""
import hashlib, json, shlex
from datetime import datetime, timezone
from pathlib import Path
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
REMOTE = '/linhhoasu/webgame/game'
OUT = ROOT / '_ai_workbench/temp/oldtrek_static_release_20261017'
FILES = {
    'index.html': OUT / 'index.html',
    'js/main.min_drop200.js': OUT / 'js/main.min_drop200.js',
    'js/lhs-oldtrek-eventview-v1.js': OUT / 'js/lhs-oldtrek-eventview-v1.js',
}
EXPECTED = {
    'index.html': 'ca53cf597db610b8a2fcd9891d05e50b0034bd73433bfe581839ba7b5626ac49',
    'js/main.min_drop200.js': 'e2d23bf40d3ccb00488e831300bbca6bee0ffe7102f971f144c3fba401a3ecfc',
}
def sha(data): return hashlib.sha256(data).hexdigest()

stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
backup = f'/linhhoasu/_ai_workbench/backups/oldtrek_static_renderer_{stamp}'
receipt = {'at': datetime.now(timezone.utc).isoformat(), 'directPlayerWrites': 0, 'restarts': 0, 'backup': backup, 'files': {}}
with connect() as client:
    sftp = client.open_sftp()
    try:
        before = {}
        for rel in ['index.html', 'js/main.min_drop200.js']:
            p = REMOTE + '/' + rel
            data = sftp.open(p, 'rb').read(); before[rel] = data
            if sha(data) != EXPECTED[rel]: raise RuntimeError('STATIC_CAS_DRIFT:' + rel)
        new_remote = REMOTE + '/js/lhs-oldtrek-eventview-v1.js'
        try:
            if sftp.stat(new_remote): raise RuntimeError('NEW_GUARD_ALREADY_EXISTS')
        except FileNotFoundError:
            pass
        run(client, 'set -eu; mkdir -p ' + shlex.quote(backup + '/js'))
        for rel, data in before.items():
            bp = backup + '/' + rel
            with sftp.open(bp, 'wb') as f: f.write(data)
            run(client, 'chmod 640 ' + shlex.quote(bp))
            if sha(sftp.open(bp, 'rb').read()) != sha(data): raise RuntimeError('BACKUP_HASH:' + rel)
        staged = []
        for rel, local in FILES.items():
            data = local.read_bytes(); target = REMOTE + '/' + rel
            tmp = target + '.codex-oldtrek-' + stamp + ('.js' if rel.endswith('.js') else '.html')
            with sftp.open(tmp, 'wb') as f: f.write(data)
            run(client, 'chown --reference=' + shlex.quote(REMOTE + '/index.html') + ' ' + shlex.quote(tmp) + '; chmod 644 ' + shlex.quote(tmp))
            if rel.endswith('.js'): run(client, 'node --check ' + shlex.quote(tmp))
            staged.append((rel, target, tmp, data))
        for rel, target, tmp, data in staged:
            current = sftp.open(target, 'rb').read() if rel in before else None
            if rel in EXPECTED and sha(current) != EXPECTED[rel]: raise RuntimeError('TARGET_CAS_DRIFT:' + rel)
            sftp.posix_rename(tmp, target)
            if sha(sftp.open(target, 'rb').read()) != sha(data): raise RuntimeError('LIVE_HASH:' + rel)
        for rel, _, _, data in staged:
            served = run(client, 'curl -fsS --max-time 10 http://127.0.0.1:81/' + rel).encode()
            if sha(served) != sha(data): raise RuntimeError('HTTP_HASH:' + rel)
        receipt['status'] = 'DEPLOYED'
        receipt['live'] = {rel: sha(local.read_bytes()) for rel, local in FILES.items()}
    finally:
        sftp.close()
(OUT / 'deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(receipt, ensure_ascii=False, indent=2))
