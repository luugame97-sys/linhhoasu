"""Deploy FashionConfig timing guard; no game-process restart."""
import hashlib
import json
import shlex
import time
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'linhhoasu'
REMOTE = '/linhhoasu'
BACKUP = REMOTE + '/_ai_workbench/backups/fashion_content_timing_fix_20260923'
STAGE = REMOTE + '/_ai_workbench/temp/fashion_content_timing_fix_20260923'
FILES = ['webgame/game/js/lhs-fashion-content-v1.js', 'webgame/game/index.html']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    local = {rel: (APP / rel).read_bytes() for rel in FILES}
    baseline = {
        FILES[0]: (ROOT / '_ai_workbench/backups/fashion_content_timing_fix_20260923/linhhoasu__webgame__game__js__lhs-fashion-content-v1.js.before').read_bytes(),
        FILES[1]: (ROOT / '_ai_workbench/backups/fashion_content_timing_fix_20260923/linhhoasu__webgame__game__index.html.before').read_bytes(),
    }
    ssh = connect()
    old = {}
    published = []
    try:
        with ssh.open_sftp() as sf:
            stage = f'{STAGE}/{int(time.time())}'
            for rel in FILES:
                cur = sf.open(REMOTE + '/' + rel, 'rb').read()
                if cur != baseline[rel]:
                    raise RuntimeError('REMOTE_CAS_DRIFT:' + rel + ':' + sha(cur))
                old[rel] = cur
                staged = stage + '/' + rel
                run(ssh, 'install -d -m 700 ' + shlex.quote(staged.rsplit('/', 1)[0]))
                with sf.open(staged, 'wb') as handle:
                    handle.write(local[rel])
                sf.chmod(staged, 0o644)
                sf.posix_rename(staged, REMOTE + '/' + rel)
                published.append(rel)
        body = run(ssh, "curl -fsS --max-time 10 -H 'Host: 103.116.105.154' http://127.0.0.1:81/")
        source = run(ssh, "curl -fsS --max-time 10 -H 'Host: 103.116.105.154' http://127.0.0.1:81/js/lhs-fashion-content-v1.js")
        if 'lhs-fashion-content-v1.js?v=20260923_fashion_content_v2' not in body:
            raise RuntimeError('HTTP_INDEX_TOKEN_MISSING')
        if sha(source.encode()) != sha(local[FILES[0]]):
            raise RuntimeError('HTTP_SOURCE_HASH_MISMATCH')
        result = {
            'result': 'DEPLOYED_HTTP_VERIFIED',
            'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'productionWrites': 0,
            'restartOrder': [],
            'backup': BACKUP,
            'files': {rel: {'before': sha(old[rel]), 'after': sha(local[rel])} for rel in FILES},
            'http': {'index': 200, 'source': 200},
        }
        out = ROOT / '_ai_workbench/temp/fashion_content_timing_fix_20260923/release.json'
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
