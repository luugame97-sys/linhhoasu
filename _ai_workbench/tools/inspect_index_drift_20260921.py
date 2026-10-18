import difflib
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect

local = Path(__file__).resolve().parents[2] / 'linhhoasu' / 'webgame' / 'game' / 'index.html'
ssh = connect()
try:
    with ssh.open_sftp() as sftp:
        remote = sftp.open('/linhhoasu/webgame/game/index.html', 'rb').read().decode('utf-8')
    text = remote
    index_nl = '\r\n' if '\r\n' in text else '\n'
    old = 'js/lhs-power-relogin-v1.js?v=20260921_power_relogin_v2'
    new = 'js/lhs-power-relogin-v1.js?v=20260921_power_relogin_v3'
    anchor = '\t\t"js/lhs-oldtrek-minigames-v1.js?v=20260921_v1",'
    line = anchor + index_nl + '\t\t"js/lhs-bidking-compat-v1.js?v=20260921_bidking_compat_v1",'
    derived = text.replace(old, new, 1).replace(anchor, line, 1)
    current_bytes = local.read_bytes()
    current = current_bytes.decode('utf-8')
    print('remote_bytes', len(remote.encode()), 'derived_bytes', len(derived.encode()), 'local_bytes', len(current_bytes))
    print('old_count', text.count(old), 'anchor_count', text.count(anchor))
    print('local_equals_derived', current == derived)
    diff=''.join(difflib.unified_diff(derived.splitlines(True), current.splitlines(True), fromfile='remote-derived', tofile='local'))
    print(diff[:10000].encode('unicode_escape').decode('ascii'))
finally:
    ssh.close()
