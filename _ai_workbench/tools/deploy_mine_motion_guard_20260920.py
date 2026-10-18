import hashlib
import json
import posixpath
from datetime import datetime, timezone
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[1]
CAND = ROOT / 'temp' / 'mine_motion_callback_20260920'
REMOTE_GAME = '/linhhoasu/webgame/game'
MAIN_REL = 'js/main.min_drop100.js'
INDEX_REL = 'index.html'
OLD_MARKER = b'20260920_mine_motion_callback_v4'
NEW_MARKER = b'20260920_mine_smooth_v5'

def sha(data):
    return hashlib.sha256(data).hexdigest()

main = (CAND / 'main.min_drop100.js').read_bytes()
index = (CAND / 'index.html').read_bytes()
if b'[MineMotion] complete animationMs=' not in main or NEW_MARKER not in index:
    raise RuntimeError('CANDIDATE_MARKER_MISSING')

ssh = connect()
stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
backup = f'/linhhoasu/_ai_workbench/backups/mine_motion_guard_{stamp}'
remote_main = f'{REMOTE_GAME}/{MAIN_REL}'
remote_index = f'{REMOTE_GAME}/{INDEX_REL}'
try:
    with ssh.open_sftp() as sftp:
        old_main = sftp.open(remote_main, 'rb').read()
        old_index = sftp.open(remote_index, 'rb').read()
        if sha(old_main) != 'd19866858f7d36a8f250cffd6703156ca56cb7e660287e3e82e269015276755b':
            raise RuntimeError('REMOTE_MAIN_CAS_DRIFT:' + sha(old_main))
        if OLD_MARKER not in old_index or NEW_MARKER in old_index:
            raise RuntimeError('REMOTE_INDEX_CAS_DRIFT')
        new_index = old_index.replace(OLD_MARKER, NEW_MARKER)
        run(ssh, f'mkdir -p {backup}')
        sftp.open(posixpath.join(backup, 'main.min_drop100.js'), 'wb').write(old_main)
        sftp.open(posixpath.join(backup, 'index.html'), 'wb').write(old_index)
        tmp_main = remote_main + f'.deploy-{stamp}.js'
        tmp_index = remote_index + f'.deploy-{stamp}.html'
        sftp.open(tmp_main, 'wb').write(main)
        sftp.open(tmp_index, 'wb').write(new_index)
    run(ssh, f'node --check {tmp_main}')
    run(ssh, f'mv {tmp_main} {remote_main}; mv {tmp_index} {remote_index}; chmod 644 {remote_main} {remote_index}')
    print(json.dumps({
        'status': 'DEPLOYED', 'backup': backup, 'productionWrites': 0, 'playerWrites': 0,
        'mainBefore': sha(old_main), 'mainAfter': sha(main),
        'indexAfter': sha(new_index), 'cacheMarker': NEW_MARKER.decode(),
    }))
finally:
    ssh.close()
