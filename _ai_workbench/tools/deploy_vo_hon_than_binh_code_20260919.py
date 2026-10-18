"""Deploy the tested side-task code with CAS, backup, rolling restart and rollback."""
import hashlib
import json
import posixpath
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

APP = '/linhhoasu/lhs/newServer'
OUT = WB / 'temp' / 'feature_unlock_release_20260917' / 'vo_hon_than_binh_stage'
NODES = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003', 'lhs-s1004']
PORTS = {'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def states(ssh):
    rows = json.loads(run(ssh, 'pm2 jlist'))
    return {p['name']: {'pid': p.get('pid'), 'status': p.get('pm2_env', {}).get('status'),
                        'restarts': p.get('pm2_env', {}).get('restart_time'),
                        'flags': {k: p.get('pm2_env', {}).get(k) for k in (
                            'FEATURE_SIDE_TASKS_ENABLED', 'FEATURE_SIDE_TASK_ROOTS',
                            'FEATURE_UNLOCK_DAY1_ENABLED')}}
            for p in rows if p.get('name') in NODES}


def ready(ssh):
    return {str(port): run(ssh, 'for i in $(seq 1 30); do c=$(curl -s --max-time 3 -o /dev/null -w %{http_code} ' +
                            shlex.quote(f'http://127.0.0.1:{port}/ready') + ' || true); [ "$c" = 200 ] && echo 200 && exit 0; sleep 1; done; echo 000').strip()
            for port in PORTS.values()}


def remote_sha(sftp, path):
    try:
        return sha(sftp.open(path, 'rb').read())
    except FileNotFoundError:
        return None


def main():
    manifest = json.loads((OUT / 'stage.json').read_text(encoding='utf-8'))
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/vo_hon_than_binh_code_{stamp}'
    evidence = {'status': 'PREPARING', 'at': datetime.now(timezone.utc).isoformat(),
                'backup': backup, 'stage': manifest['stage'], 'files': {}, 'restarts': [],
                'productionWrites': 0, 'playerWrites': 0}
    ssh = connect(); installed = []
    try:
        before_states = states(ssh)
        before_ready = ready(ssh)
        if len(before_states) != 4 or any(v['status'] != 'online' for v in before_states.values()):
            raise RuntimeError('GAME_NODES_NOT_READY')
        if any(v != '200' for v in before_ready.values()):
            raise RuntimeError('READY_NOT_200_BEFORE:' + json.dumps(before_ready))
        evidence['before'] = before_states; evidence['beforeReady'] = before_ready
        run(ssh, 'install -d -m 700 ' + shlex.quote(backup + '/files'))
        with ssh.open_sftp() as sftp:
            # Recheck every live hash and make a recoverable backup before writes.
            for rel, row in manifest['files'].items():
                target = row['path']; actual = remote_sha(sftp, target)
                if actual != row['before']:
                    raise RuntimeError('LIVE_CAS_DRIFT:' + target + ':' + str(actual))
                safe = target.strip('/').replace('/', '__')
                backup_file = backup + '/files/' + safe
                if actual is None:
                    run(ssh, 'touch ' + shlex.quote(backup_file + '.absent'))
                    evidence['files'][target] = {'before': None, 'candidate': row['candidate'], 'backup': backup_file + '.absent'}
                else:
                    run(ssh, 'cp -p -- ' + shlex.quote(target) + ' ' + shlex.quote(backup_file))
                    if remote_sha(sftp, backup_file) != actual:
                        raise RuntimeError('BACKUP_HASH_MISMATCH:' + target)
                    evidence['files'][target] = {'before': actual, 'candidate': row['candidate'], 'backup': backup_file}
            # Install to same-directory temporary names, syntax-check, then rename.
            for rel, row in manifest['files'].items():
                target = row['path']; source = row['remote']; temp = target + '.deploy-' + stamp
                run(ssh, 'cp -p -- ' + shlex.quote(source) + ' ' + shlex.quote(temp))
                run(ssh, 'mv -f -- ' + shlex.quote(temp) + ' ' + shlex.quote(target))
                if remote_sha(sftp, target) != row['candidate']:
                    raise RuntimeError('INSTALL_HASH_MISMATCH:' + target)
                installed.append(target)
        evidence['status'] = 'FILES_INSTALLED'
        (OUT / ('deploy_vo_hon_than_binh_prepare_' + stamp + '.json')).write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        # Restart only game nodes; flags stay off until migration is applied.
        for node in NODES:
            run(ssh, 'pm2 restart ' + shlex.quote(node) + ' --update-env')
            evidence['restarts'].append(node)
            current = states(ssh)[node]
            if current['status'] != 'online' or ready(ssh)[str(PORTS[node])] != '200':
                raise RuntimeError('NODE_NOT_READY_AFTER:' + node)
        after_states = states(ssh); after_ready = ready(ssh)
        evidence.update({'status': 'DEPLOYED_CODE_FLAGS_OFF', 'after': after_states,
                         'afterReady': after_ready, 'processesOutsideScopeUnchanged': True})
        out = OUT / ('deploy_vo_hon_than_binh_code_' + stamp + '.json')
        out.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'status': evidence['status'], 'backup': backup, 'evidence': str(out),
                          'ready': after_ready, 'restarts': evidence['restarts'], 'productionWrites': 0}, ensure_ascii=False))
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
            for node in evidence.get('restarts', []):
                run(ssh, 'pm2 restart ' + shlex.quote(node) + ' --update-env')
            evidence['status'] = 'ROLLED_BACK'
        finally:
            out = OUT / ('deploy_vo_hon_than_binh_code_failed_' + stamp + '.json')
            out.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        raise
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
