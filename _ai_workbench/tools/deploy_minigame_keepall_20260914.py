"""Keep all eight mini-game entries visible, preserving old and new items."""
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run


WB = Path(__file__).resolve().parents[1]
ROOT = WB.parent / 'linhhoasu'
WEB = '/linhhoasu/webgame/game'
STAGE = '/linhhoasu/_ai_workbench/temp/minigame_keepall_20260914'
BACKUP = '/linhhoasu/_ai_workbench/backups/minigame_keepall_20260914_pre'
OUT = WB / 'temp/minigame_keepall_20260914'
FILES = {
    'webgame/game/js/start.min_52ac8d58.js': 'js/start.min_52ac8d58.js',
    'webgame/game/js/main.min_a6195824.js': 'js/main.min_a6195824.js',
    'webgame/game/index.html': 'index.html',
}
EXPECTED = {
    'webgame/game/js/start.min_52ac8d58.js': '854054f5ed73eddb54fde2ddd1fb2471b005acc25667e37a28391acd9cbf8992',
    'webgame/game/js/main.min_a6195824.js': '33f8a135d7614bcbea7cd436e2cf2fa7aa1f9e8b4c02276c82a18e26612139af',
    'webgame/game/index.html': 'd8ed4fef0336ae5f5a6cac36606b445e784dce5c22c3f18fa197c7760f9aa994',
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    candidates = {
        rel: (ROOT / rel).read_bytes()
        for rel in FILES
    }
    candidate_hashes = {rel: sha(data) for rel, data in candidates.items()}
    ssh = connect()
    try:
        if run(ssh, 'test -e ' + shlex.quote(BACKUP) + ' && echo yes || echo no').strip() != 'no':
            raise RuntimeError('REMOTE_BACKUP_ALREADY_EXISTS')
        for rel in FILES:
            remote = WEB + '/' + rel.split('webgame/game/', 1)[1]
            actual = run(ssh, 'sha256sum ' + shlex.quote(remote) + " | awk '{print $1}'").strip()
            if actual != EXPECTED[rel]:
                raise RuntimeError('BASELINE_MISMATCH:' + rel + ':' + actual)
        run(ssh, 'mkdir -p ' + shlex.quote(STAGE + '/js'))
        # Upload the small start/index files; derive the large main bundle on
        # the VPS from its verified baseline to avoid a slow SFTP transfer.
        with ssh.open_sftp() as sftp:
            for rel in [
                'webgame/game/js/start.min_52ac8d58.js',
                'webgame/game/index.html',
            ]:
                staged = STAGE + '/' + FILES[rel]
                with sftp.open(staged, 'wb') as handle:
                    handle.write(candidates[rel])
        main_remote = WEB + '/js/main.min_a6195824.js'
        main_stage = STAGE + '/js/main.min_a6195824.js'
        transform = (
            "const fs=require('fs');const p=" + repr(main_remote) + ";const q=" + repr(main_stage) + ";"
            "const s=fs.readFileSync(p,'utf8');const a='e=e.splice(0,O.min(4,e.length))';"
            "if(s.split(a).length-1!==1)throw Error('MAIN_LITERAL_BASELINE_MISMATCH');"
            "fs.writeFileSync(q,s.replace(a,'e=e'),'utf8');"
        )
        run(ssh, 'cp ' + shlex.quote(main_remote) + ' ' + shlex.quote(main_stage) + ' && node -e ' + shlex.quote(transform))
        for rel in FILES:
            staged = STAGE + '/' + FILES[rel]
            staged_hash = run(ssh, 'sha256sum ' + shlex.quote(staged) + " | awk '{print $1}'").strip()
            if staged_hash != candidate_hashes[rel]:
                raise RuntimeError('STAGE_HASH_MISMATCH:' + rel + ':' + staged_hash)
        for rel in FILES:
            remote = WEB + '/' + rel.split('webgame/game/', 1)[1]
            dst = BACKUP + '/' + rel
            run(ssh, 'mkdir -p ' + shlex.quote(dst.rsplit('/', 1)[0]) + ' && cp -p ' + shlex.quote(remote) + ' ' + shlex.quote(dst))
            staged = STAGE + '/' + FILES[rel]
            tmp = remote + '.keepall-20260914'
            run(ssh, 'cp ' + shlex.quote(staged) + ' ' + shlex.quote(tmp) + ' && mv ' + shlex.quote(tmp) + ' ' + shlex.quote(remote))
        served_index = run(ssh, 'curl -fsS --max-time 10 http://127.0.0.1:81/index.html')
        served_start = run(ssh, 'curl -fsS --max-time 10 http://127.0.0.1:81/js/start.min_52ac8d58.js?v=20260914_minigame_open_v1')
        served_main = run(ssh, 'curl -fsS --max-time 10 http://127.0.0.1:81/js/main.min_a6195824.js?v=20260914_minigame_open_v1')
        ready = {
            str(port): run(ssh, "curl -fsS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:" + str(port) + '/ready').strip()
            for port in [8080, 8083, 8084]
        }
        result = {
            'at': datetime.now(timezone.utc).isoformat(),
            'files': candidate_hashes,
            'served': {
                'cacheMarker': '20260914_minigame_open_v1' in served_index,
                'allOrder': 'subGameOrder:[1,2,3,4,5,6,7,8]' in served_start,
                'noFourOnlySlice': 'O.min(4,e.length)' not in served_main,
            },
            'ready': ready,
            'restart': 'none',
            'backup': BACKUP,
        }
        result['result'] = 'DEPLOY_VERIFIED' if all(result['served'].values()) and set(ready.values()) == {'200'} else 'HOLD'
        (OUT / 'deploy.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False))
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
