"""Scoped static pet UI release with CAS, exact rollback, and HTTPS read-back."""
from pathlib import Path
import hashlib
import json
import shlex
import subprocess
import sys
import time
from auction_ops_20261015 import connect, run

TASK = Path(__file__).resolve().parents[1] / 'temp/pet_ui_fix_20261018'
PATHS = {'safety.js': 'js/lhs-pet-safety-v1.js', 'grid.js': 'js/lhs-pet-grid48-v1.js', 'index.html': 'index.html'}
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    phase = sys.argv[1]
    assert phase in ('diagnostic', 'diagnostic_trace', 'diagnostic_assets', 'final', 'final_compat')
    is_final = phase.startswith('final')
    receipt_path = TASK / (phase + '-deployment.json')
    assert not receipt_path.exists(), 'REVIEW_EXISTING_RECEIPT'
    names = list(PATHS) if is_final else ['safety.js', 'index.html']
    source = TASK / ('candidate' if is_final else phase)
    expected = json.loads((TASK / 'preflight.json').read_text())
    for previous in ['diagnostic', 'diagnostic_trace', 'diagnostic_assets', 'final']:
        if previous == phase: break
        prior_path = TASK / (previous + '-deployment.json')
        if prior_path.exists():
            prior = json.loads(prior_path.read_text())
            assert prior['status'] == 'VERIFIED'
            expected.update({n: x['after'] for n, x in prior['files'].items()})
    if is_final:
        tests = json.loads((TASK / 'tests.json').read_text())
        assert tests['status'] == 'PASS'
        for n in names:
            assert tests['files'][n] == digest(source / n), 'UNTESTED_CANDIDATE:' + n
    for n in names:
        if n.endswith('.js'):
            subprocess.run(['node', '--check', str(source / n)], check=True)
    backup = '/linhhoasu/_ai_workbench/backups/pet_ui_' + phase + '_' + time.strftime('%Y%m%d_%H%M%S')
    receipt = {'phase': phase, 'status': 'PREPARING', 'backup': backup, 'files': {}, 'playerWrites': 0, 'restarts': 0}
    c = connect(); q = shlex.quote
    def rh(p): return run(c, 'sha256sum -- ' + q(p), timeout=20).split()[0]
    try:
        with c.open_sftp() as sf:
            for n in names:
                target = '/linhhoasu/webgame/game/' + PATHS[n]
                assert rh(target) == expected[n], 'SOURCE_DRIFT:' + n
                receipt['files'][n] = {'path': target, 'before': expected[n], 'after': digest(source / n)}
            run(c, 'mkdir -p -- ' + q(backup + '/before') + ' ' + q(backup + '/stage'))
            for n, meta in receipt['files'].items():
                target = meta['path']; stage = backup + '/stage/' + n
                run(c, 'cp -p -- ' + q(target) + ' ' + q(backup + '/before/' + n))
                assert rh(backup + '/before/' + n) == meta['before']
                sf.put(str(source / n), stage)
                st = sf.stat(target); sf.chmod(stage, st.st_mode & 0o777); sf.chown(stage, st.st_uid, st.st_gid)
                assert rh(stage) == meta['after']
            for n, meta in receipt['files'].items():
                assert rh(meta['path']) == meta['before'], 'CAS:' + n
                sf.posix_rename(backup + '/stage/' + n, meta['path'])
                assert rh(meta['path']) == meta['after']
            receipt['status'] = 'APPLIED'
            for n, meta in receipt['files'].items():
                url = 'https://linhhoasu.lol/' + ('' if n == 'index.html' else PATHS[n]) + '?pet_release=' + phase + str(int(time.time()))
                got = run(c, 'set -o pipefail; curl -fsS --max-time 25 ' + q(url) + ' | sha256sum', timeout=30).split()[0]
                assert got == meta['after'], 'HTTPS_READBACK:' + n
                meta['httpsSha256'] = got
            receipt['status'] = 'VERIFIED'
    except Exception as error:
        receipt['error'] = str(error)
        for n, meta in reversed(list(receipt['files'].items())):
            if rh(meta['path']) == meta['after']:
                assert rh(backup + '/before/' + n) == meta['before']
                run(c, 'cp -p -- ' + q(backup + '/before/' + n) + ' ' + q(backup + '/stage/' + n))
                with c.open_sftp() as sf: sf.posix_rename(backup + '/stage/' + n, meta['path'])
                assert rh(meta['path']) == meta['before']
        receipt['status'] = 'ROLLED_BACK'
        raise
    finally:
        receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
        c.close()
    print(json.dumps(receipt, ensure_ascii=False))

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8'); main()
