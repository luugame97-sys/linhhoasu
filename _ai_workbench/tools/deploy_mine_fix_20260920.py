"""Deploy Mine validation fix with CAS, backup, rolling restart and rollback."""
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
ROOT = WB / 'temp' / 'mine_fix_20260920'
NODES = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003', 'lhs-s1004', 'lhs-s1005']
PORTS = {'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085, 'lhs-s1005': 8086}


def sha(value):
    return hashlib.sha256(value).hexdigest()


def states(ssh):
    rows = json.loads(run(ssh, 'pm2 jlist'))
    return {p['name']: {'pid': p.get('pid'), 'status': p.get('pm2_env', {}).get('status'),
                        'restarts': p.get('pm2_env', {}).get('restart_time')}
            for p in rows if p.get('name') in NODES}


def ready(ssh, port):
    return run(ssh, 'for i in $(seq 1 30); do c=$(curl -s --max-time 3 -o /dev/null -w %{http_code} '
                    + shlex.quote(f'http://127.0.0.1:{port}/ready')
                    + ' || true); [ "$c" = 200 ] && echo 200 && exit 0; sleep 1; done; echo 000').strip()


manifest = json.loads((ROOT / 'stage.json').read_text(encoding='utf-8'))
ssh = connect()
installed = []
restarted = []
stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
backup = '/linhhoasu/_ai_workbench/backups/mine_fix_' + stamp
evidence = {'status': 'PREPARING', 'at': datetime.now(timezone.utc).isoformat(),
            'stage': manifest['stage'], 'backup': backup, 'files': {},
            'restarted': [], 'productionWrites': 0, 'playerWrites': 0}
try:
    before = states(ssh)
    before_ready = {str(port): ready(ssh, port) for port in PORTS.values()}
    evidence['before'] = before
    evidence['beforeReady'] = before_ready
    if len(before) != len(NODES) or any(v['status'] != 'online' for v in before.values()) \
            or any(v != '200' for v in before_ready.values()):
        raise RuntimeError('BASELINE_NOT_READY')
    run(ssh, 'install -d -m 700 ' + shlex.quote(backup + '/files'))
    with ssh.open_sftp() as sftp:
        for rel, row in manifest['files'].items():
            target = row['path']
            try:
                actual = sha(sftp.open(target, 'rb').read())
            except FileNotFoundError:
                actual = None
            if actual != row['before']:
                raise RuntimeError('LIVE_CAS_DRIFT:' + target)
            safe = target.strip('/').replace('/', '__')
            backup_file = backup + '/files/' + safe
            if actual is None:
                run(ssh, 'touch ' + shlex.quote(backup_file + '.absent'))
                backup_file += '.absent'
            else:
                run(ssh, 'cp -p -- ' + shlex.quote(target) + ' ' + shlex.quote(backup_file))
            evidence['files'][target] = {'before': actual, 'candidate': row['candidate'], 'backup': backup_file}
        for rel, row in manifest['files'].items():
            target = row['path']
            temp = target + '.deploy-' + stamp
            run(ssh, 'cp -p -- ' + shlex.quote(row['remote']) + ' ' + shlex.quote(temp))
            run(ssh, 'mv -f -- ' + shlex.quote(temp) + ' ' + shlex.quote(target))
            installed.append(target)
            if sha(sftp.open(target, 'rb').read()) != row['candidate']:
                raise RuntimeError('INSTALL_HASH:' + target)
    evidence['status'] = 'FILES_INSTALLED'
    (ROOT / ('deploy_prepare_' + stamp + '.json')).write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for node in NODES:
        run(ssh, 'pm2 restart ' + shlex.quote(node) + ' --update-env')
        restarted.append(node)
        evidence['restarted'] = restarted[:]
        if ready(ssh, PORTS[node]) != '200':
            raise RuntimeError('NOT_READY:' + node)
    after = states(ssh)
    after_ready = {str(port): ready(ssh, port) for port in PORTS.values()}
    evidence.update({'status': 'DEPLOYED', 'after': after, 'ready': after_ready})
    (ROOT / ('deploy_' + stamp + '.json')).write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': 'DEPLOYED', 'backup': backup, 'ready': after_ready,
                      'restarted': restarted, 'productionWrites': 0}, ensure_ascii=False))
except Exception as error:
    evidence['error'] = repr(error)
    evidence['status'] = 'ROLLING_BACK'
    try:
        with ssh.open_sftp() as sftp:
            for target in reversed(installed):
                backup_file = evidence['files'][target]['backup']
                if backup_file.endswith('.absent'):
                    run(ssh, 'rm -f -- ' + shlex.quote(target))
                else:
                    run(ssh, 'cp -p -- ' + shlex.quote(backup_file) + ' ' + shlex.quote(target))
        for node in restarted:
            run(ssh, 'pm2 restart ' + shlex.quote(node) + ' --update-env')
        evidence['status'] = 'ROLLED_BACK'
    finally:
        (ROOT / ('deploy_failed_' + stamp + '.json')).write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    raise
finally:
    ssh.close()
