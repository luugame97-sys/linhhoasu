"""Publish the client-only silent maintenance response with backup/CAS/read-back."""
import base64
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from release_petsoul_day1_20261007 import connect, run, procs

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/event_maintenance_quiet_20261008'
REMOTE = '/linhhoasu'
STAGE = REMOTE + '/_ai_workbench/temp/event_maintenance_quiet_20261008'
MANIFEST = OUT / 'release.json'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def rh(ssh, path):
    return run(ssh, 'sha256sum ' + shlex.quote(path)).split()[0]


def exists(ssh, path):
    return run(ssh, 'test -e ' + shlex.quote(path) + ' && echo yes || echo no').strip() == 'yes'


def upload(ssh, path, data):
    run(ssh, 'mkdir -p ' + shlex.quote(path.rsplit('/', 1)[0]))
    stdin, stdout, stderr = ssh.exec_command('base64 -d > ' + shlex.quote(path), timeout=120)
    stdin.write(base64.b64encode(data))
    stdin.channel.shutdown_write()
    error = stderr.read().decode('utf-8', errors='replace')
    if stdout.channel.recv_exit_status() != 0:
        raise RuntimeError('UPLOAD_FAILED:' + error[-400:])
    if rh(ssh, path) != sha(data):
        raise RuntimeError('UPLOAD_HASH:' + path)


def save(manifest):
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8-sig'))
    if manifest.get('phase') != 'candidate':
        raise RuntimeError('BAD_PHASE')
    ssh = connect()
    try:
        manifest['preProcesses'] = procs(ssh)
        manifest['stage'] = STAGE
        manifest['staged'] = []
        for row in manifest['files']:
            target = REMOTE + '/' + row['relative']
            observed = rh(ssh, target)
            if observed != row['expected']:
                raise RuntimeError('BASELINE_CAS:' + row['relative'])
            data = Path(row['local']).read_bytes()
            if sha(data) != row['candidate']:
                raise RuntimeError('LOCAL_HASH:' + row['relative'])
            staged = STAGE + '/candidate/' + row['relative']
            upload(ssh, staged, data)
            if row['relative'].endswith('.js'):
                run(ssh, 'node --check ' + shlex.quote(staged))
            manifest['staged'].append(row['relative'])
        manifest['phase'] = 'staged'
        save(manifest)

        backup = REMOTE + '/_ai_workbench/backups/event_maintenance_quiet_20261008_' + datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        if exists(ssh, backup):
            raise RuntimeError('BACKUP_EXISTS')
        manifest['backup'] = backup
        run(ssh, 'mkdir -p ' + shlex.quote(backup))
        for row in manifest['files']:
            target = REMOTE + '/' + row['relative']
            dest = backup + '/' + row['relative']
            run(ssh, 'mkdir -p ' + shlex.quote(dest.rsplit('/', 1)[0]) + ' && cp -p ' + shlex.quote(target) + ' ' + shlex.quote(dest))
            if rh(ssh, dest) != row['expected']:
                raise RuntimeError('BACKUP_HASH:' + row['relative'])
        upload(ssh, backup + '/manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2).encode())
        manifest['phase'] = 'backed_up'
        save(manifest)

        manifest['published'] = []
        for row in manifest['files']:
            target = REMOTE + '/' + row['relative']
            observed = rh(ssh, target)
            if observed != row['expected']:
                raise RuntimeError('PUBLISH_CAS:' + row['relative'])
            staged = STAGE + '/candidate/' + row['relative']
            tmp = target + '.event_maintenance_quiet_20261008.tmp'
            if exists(ssh, tmp):
                raise RuntimeError('TEMP_EXISTS:' + tmp)
            run(ssh, 'cp ' + shlex.quote(staged) + ' ' + shlex.quote(tmp) + ' && chmod --reference=' + shlex.quote(target) + ' ' + shlex.quote(tmp) + ' && chown --reference=' + shlex.quote(target) + ' ' + shlex.quote(tmp))
            if rh(ssh, tmp) != row['candidate']:
                raise RuntimeError('TEMP_HASH:' + row['relative'])
            run(ssh, 'mv -f ' + shlex.quote(tmp) + ' ' + shlex.quote(target))
            if rh(ssh, target) != row['candidate']:
                raise RuntimeError('INSTALL_HASH:' + row['relative'])
            manifest['published'].append(row['relative'])
            save(manifest)

        manifest['finalHashes'] = {row['relative']: rh(ssh, REMOTE + '/' + row['relative']) for row in manifest['files']}
        if any(manifest['finalHashes'][row['relative']] != row['candidate'] for row in manifest['files']):
            raise RuntimeError('FINAL_HASH')
        after_processes = procs(ssh)
        if after_processes != manifest['preProcesses']:
            raise RuntimeError('PROCESS_CHANGED_STATIC_RELEASE')
        index = run(ssh, 'curl -fsS --max-time 15 http://127.0.0.1:81/index.html')
        if 'lhs-fulu-safe-v1.js?v=20261008_fulu_safe_v3' not in index or 'lhs-event-maintenance-v1.js?v=20261008_event_quiet_v1' not in index:
            raise RuntimeError('INDEX_MARKER')
        served = {}
        for row in manifest['files']:
            if not row['relative'].startswith('webgame/game/js/'):
                continue
            url = 'http://127.0.0.1:81/' + row['relative'].removeprefix('webgame/game/') + '?v=' + manifest['version']
            served[row['relative']] = run(ssh, 'curl -fsS --max-time 15 ' + shlex.quote(url) + ' | sha256sum').split()[0]
            if served[row['relative']] != row['candidate']:
                raise RuntimeError('PUBLIC_HASH:' + row['relative'])
        manifest.update({'servedHashes': served, 'postProcesses': after_processes, 'phase': 'verified', 'result': 'PASS', 'productionPlayerWrites': 0, 'restarts': []})
        save(manifest)
        print(json.dumps({'result': 'PASS', 'phase': 'verified', 'backup': backup, 'files': manifest['published'], 'servedHashes': served}, ensure_ascii=False))
    except Exception as error:
        manifest['lastError'] = str(error)
        save(manifest)
        raise
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
