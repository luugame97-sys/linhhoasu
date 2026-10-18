"""Translate one native notice; preserve live bytes, backup/CAS, atomic swaps."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import re
import shlex
import sys
from auction_ops_20261015 import connect, run

ROOT = Path(__file__).resolve().parents[2]
TASK = ROOT / '_ai_workbench/temp/cross_rival_entry_20261017/translation'
REMOTE = '/linhhoasu/webgame/game'
VERSION = '20261017_cross_rival_notice_vi_v1'
MESSAGE = 'Hiện chưa đến giờ tham chiến.'
FILES = ['js/main.min_drop200.js', 'index.html']

def sha(data):
    return hashlib.sha256(data).hexdigest()

def build():
    before = {p: (TASK / 'baseline' / p).read_bytes() for p in FILES}
    needle = b'S.ins().showTipsByLangId(30104048)'
    replacement = ('S.ins().showTips(' + json.dumps(MESSAGE, ensure_ascii=False) + ')').encode('utf-8')
    if before[FILES[0]].count(needle) != 1:
        raise RuntimeError('NOTICE_ANCHOR_NOT_UNIQUE')
    pattern = rb'js/main\.min_drop200\.js\?v=[A-Za-z0-9_]+'
    if len(re.findall(pattern, before['index.html'])) != 1:
        raise RuntimeError('CACHE_ANCHOR_NOT_UNIQUE')
    after = {
        FILES[0]: before[FILES[0]].replace(needle, replacement, 1),
        'index.html': re.sub(pattern, ('js/main.min_drop200.js?v=' + VERSION).encode(), before['index.html']),
    }
    assert after[FILES[0]].replace(replacement, needle, 1) == before[FILES[0]]
    report = {'version': VERSION, 'message': MESSAGE, 'files': {}}
    for p in FILES:
        target = TASK / 'candidate' / p
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(after[p])
        report['files'][p] = {'before': sha(before[p]), 'after': sha(after[p])}
    (TASK / 'release.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))

def deploy():
    release = json.loads((TASK / 'release.json').read_text(encoding='utf-8'))
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = '/linhhoasu/_ai_workbench/backups/cross_rival_notice_vi_' + stamp
    receipt = {**release, 'backup': backup, 'at': datetime.now(timezone.utc).isoformat(),
               'playerWrites': 0, 'restarts': 0, 'status': 'PREPARING', 'swapped': []}
    q = shlex.quote
    c = connect()
    try:
        with c.open_sftp() as s:
            def remote_sha(path):
                return run(c, 'sha256sum -- ' + q(path), timeout=15).split()[0]
            for p in FILES:
                assert remote_sha(REMOTE + '/' + p) == release['files'][p]['before'], 'CAS_DRIFT:' + p
                assert sha((TASK / 'candidate' / p).read_bytes()) == release['files'][p]['after'], 'CANDIDATE_DRIFT:' + p
            run(c, 'install -d -m 700 -- ' + q(backup) + ' ' + q(backup + '/js') + ' ' + q(backup + '/stage/js'))
            for p in FILES:
                target, saved, staged = REMOTE + '/' + p, backup + '/' + p, backup + '/stage/' + p
                stat = s.stat(target)
                run(c, 'cp -p -- ' + q(target) + ' ' + q(saved))
                assert remote_sha(saved) == release['files'][p]['before'], 'BACKUP_HASH:' + p
                s.put(str(TASK / 'candidate' / p), staged)
                s.chmod(staged, stat.st_mode & 0o7777)
                s.chown(staged, stat.st_uid, stat.st_gid)
                assert remote_sha(staged) == release['files'][p]['after'], 'STAGE_HASH:' + p
                if p.endswith('.js'):
                    run(c, 'node --check ' + q(staged), timeout=25)
            try:
                for p in FILES:
                    target = REMOTE + '/' + p
                    assert remote_sha(target) == release['files'][p]['before'], 'SWAP_CAS:' + p
                    s.posix_rename(backup + '/stage/' + p, target)
                    receipt['swapped'].append(p)
                    assert remote_sha(target) == release['files'][p]['after'], 'LIVE_HASH:' + p
                receipt['http'] = {}
                for p in FILES:
                    url = 'https://linhhoasu.lol/' + p + '?v=' + VERSION
                    digest = run(c, 'set -o pipefail; curl -fsS --max-time 25 ' + q(url) + ' | sha256sum', timeout=30).split()[0]
                    assert digest == release['files'][p]['after'], 'HTTPS_HASH:' + p
                    receipt['http'][p] = digest
                receipt['status'] = 'DEPLOYED_VERIFIED'
            except Exception:
                for p in reversed(receipt['swapped']):
                    target = REMOTE + '/' + p
                    assert remote_sha(target) == release['files'][p]['after'], 'ROLLBACK_DRIFT:' + p
                    rollback = backup + '/stage/' + p
                    run(c, 'cp -p -- ' + q(backup + '/' + p) + ' ' + q(rollback))
                    s.posix_rename(rollback, target)
                    assert remote_sha(target) == release['files'][p]['before'], 'ROLLBACK_HASH:' + p
                receipt['status'] = 'ROLLED_BACK'
                raise
            finally:
                run(c, 'rmdir -- ' + q(backup + '/stage/js') + ' ' + q(backup + '/stage'))
    finally:
        c.close()
        (TASK / 'deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(receipt, ensure_ascii=False))

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    {'build': build, 'deploy': deploy}[sys.argv[1]]()
