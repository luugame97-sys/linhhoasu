"""Stage Mine server-authority fix privately with live CAS and syntax checks."""
import hashlib
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

APP = '/linhhoasu/lhs/newServer'
NODES = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003', 'lhs-s1004', 'lhs-s1005']
PORTS = {'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085, 'lhs-s1005': 8086}
FILES = [
    'src/handlers/mine.js',
    'src/services/MineExitValidationService.js',
    'src/services/FeatureMutationService.js',
    'src/services/PlayerService.js',
]
ROOT = WB / 'temp' / 'mine_fix_20260920'
CAND = ROOT / 'candidate' / 'server'


def sha(value):
    return hashlib.sha256(value).hexdigest()


def states(ssh):
    rows = json.loads(run(ssh, 'pm2 jlist'))
    return {p['name']: {'pid': p.get('pid'), 'status': p.get('pm2_env', {}).get('status'),
                        'restarts': p.get('pm2_env', {}).get('restart_time')}
            for p in rows if p.get('name') in NODES}


def ready(ssh, port):
    return run(ssh, 'curl -s --max-time 8 -o /dev/null -w %{http_code} '
               + shlex.quote(f'http://127.0.0.1:{port}/ready')).strip()


ssh = connect()
try:
    before = states(ssh)
    before_ready = {str(port): ready(ssh, port) for port in PORTS.values()}
    if len(before) != len(NODES) or any(v['status'] != 'online' for v in before.values()) \
            or any(v != '200' for v in before_ready.values()):
        raise RuntimeError('BASELINE_NOT_READY')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    remote = '/linhhoasu/_ai_workbench/temp/mine_fix_20260920_' + stamp
    manifest = {'status': 'PREPARING', 'at': datetime.now(timezone.utc).isoformat(),
                'stage': remote, 'files': {}, 'before': before,
                'beforeReady': before_ready, 'productionWrites': 0, 'playerWrites': 0}
    run(ssh, 'install -d -m 700 ' + shlex.quote(remote))
    with ssh.open_sftp() as sftp:
        for rel in FILES:
            local = CAND / rel
            data = local.read_bytes()
            target = APP + '/' + rel
            try:
                old = sftp.open(target, 'rb').read()
                before_hash = sha(old)
            except FileNotFoundError:
                before_hash = None
            staged = remote + '/' + rel
            run(ssh, 'install -d -m 700 ' + shlex.quote(str(Path(staged).parent).replace('\\', '/')))
            with sftp.open(staged, 'wb') as handle:
                handle.write(data)
            if sha(sftp.open(staged, 'rb').read()) != sha(data):
                raise RuntimeError('STAGE_HASH:' + rel)
            manifest['files'][rel] = {'path': target, 'before': before_hash,
                                      'candidate': sha(data), 'remote': staged}
    for rel in FILES:
        run(ssh, 'node --check ' + shlex.quote(remote + '/' + rel))
    if states(ssh) != before:
        raise RuntimeError('PROCESS_CHANGED')
    manifest.update({'status': 'STAGED_SYNTAX_PASS', 'processesUnchanged': True})
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'stage.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(manifest, ensure_ascii=False))
finally:
    ssh.close()
