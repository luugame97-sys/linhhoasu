"""Deploy default-avatar UI option without restarting game processes."""
import hashlib
import json
import shlex
import time
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'linhhoasu'
REMOTE = '/linhhoasu'
BACKUP = REMOTE + '/_ai_workbench/backups/avatar_default_ui_20260922'
STAGE = REMOTE + '/_ai_workbench/temp/avatar_default_ui_20260922'
FILES = ['webgame/game/index.html', 'webgame/game/js/lhs-avatar-default-fix-v1.js']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    local = {rel: (APP / rel).read_bytes() for rel in FILES}
    baseline = (ROOT / '_ai_workbench/backups/avatar_default_ui_20260922/index.html.before').read_bytes()
    ssh = connect()
    old = {}
    published = []
    try:
        with ssh.open_sftp() as sf:
            cur = sf.open(REMOTE + '/webgame/game/index.html', 'rb').read()
            if cur != baseline:
                raise RuntimeError('REMOTE_INDEX_CAS_DRIFT:' + sha(cur))
            old[FILES[0]] = cur
            try:
                old[FILES[1]] = sf.open(REMOTE + '/' + FILES[1], 'rb').read()
            except FileNotFoundError:
                old[FILES[1]] = b''
            stage = f'{STAGE}/{int(time.time())}'
            for rel in FILES:
                staged = stage + '/' + rel
                run(ssh, 'install -d -m 700 ' + shlex.quote(staged.rsplit('/', 1)[0]))
                with sf.open(staged, 'wb') as handle:
                    handle.write(local[rel])
                sf.chmod(staged, 0o644)
                sf.posix_rename(staged, REMOTE + '/' + rel)
                published.append(rel)
        body = run(ssh, "curl -fsS --max-time 10 -H 'Host: 103.116.105.154' http://127.0.0.1:81/")
        addon = run(ssh, "curl -fsS --max-time 10 -H 'Host: 103.116.105.154' http://127.0.0.1:81/js/lhs-avatar-default-fix-v1.js")
        if 'lhs-avatar-default-fix-v1.js?v=20260922_avatar_default_fix_v1' not in body:
            raise RuntimeError('HTTP_INDEX_TOKEN_MISSING')
        if sha(addon.encode()) != sha(local[FILES[1]]):
            raise RuntimeError('HTTP_ADDON_HASH_MISMATCH')
        result = {
            'result': 'DEPLOYED_HTTP_VERIFIED',
            'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'productionWrites': 0,
            'restartOrder': [],
            'backup': BACKUP,
            'files': {rel: {'before': sha(old[rel]), 'after': sha(local[rel])} for rel in FILES},
            'http': {'index': 200, 'addon': 200},
        }
        out = ROOT / '_ai_workbench/temp/avatar_default_ui_20260922/release.json'
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception:
        if published:
            with ssh.open_sftp() as sf:
                for rel in published:
                    staged = f'{STAGE}/rollback-{int(time.time())}/{rel}'
                    run(ssh, 'install -d -m 700 ' + shlex.quote(staged.rsplit('/', 1)[0]))
                    with sf.open(staged, 'wb') as handle:
                        handle.write(old[rel])
                    sf.chmod(staged, 0o644)
                    sf.posix_rename(staged, REMOTE + '/' + rel)
        raise
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
