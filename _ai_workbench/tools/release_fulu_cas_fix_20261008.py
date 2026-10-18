"""Deploy the narrow Fulu CAS/conflict fix with backup, CAS, rolling restart and read-back."""
import base64
import hashlib
import json
import shlex
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from release_petsoul_day1_20261007 import connect, run, ready, procs

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/fulu_save_cas_fix_20261008b'
MANIFEST = OUT / 'release.json'
REMOTE = '/linhhoasu'
STAGE = REMOTE + '/_ai_workbench/temp/fulu_save_cas_fix_20261008b'
NODES = {f'lhs-s100{i}': 8080 if i == 1 else 8081 + i for i in range(1, 8)}


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


def publish_file(ssh, row, backup):
    target = REMOTE + '/' + row['relative']
    if rh(ssh, target) != row['sha256']:
        raise RuntimeError('PUBLISH_CAS:' + row['relative'])
    dest = backup + '/' + row['relative']
    run(ssh, 'mkdir -p ' + shlex.quote(dest.rsplit('/', 1)[0]) + ' && cp -p ' + shlex.quote(target) + ' ' + shlex.quote(dest))
    if rh(ssh, dest) != row['sha256']:
        raise RuntimeError('BACKUP_HASH:' + row['relative'])
    staged = STAGE + '/candidate/' + row['relative']
    tmp = target + '.fulu_cas_fix_20261008.tmp'
    if exists(ssh, tmp):
        raise RuntimeError('TEMP_EXISTS:' + tmp)
    run(ssh, 'cp ' + shlex.quote(staged) + ' ' + shlex.quote(tmp)
        + ' && chmod --reference=' + shlex.quote(target) + ' ' + shlex.quote(tmp)
        + ' && chown --reference=' + shlex.quote(target) + ' ' + shlex.quote(tmp))
    if rh(ssh, tmp) != row['candidate']:
        raise RuntimeError('TEMP_HASH:' + row['relative'])
    run(ssh, 'mv -f ' + shlex.quote(tmp) + ' ' + shlex.quote(target))
    if rh(ssh, target) != row['candidate']:
        raise RuntimeError('INSTALL_HASH:' + row['relative'])


def main():
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8-sig'))
    if manifest.get('phase') != 'candidate':
        raise RuntimeError('BAD_PHASE')
    ssh = connect()
    try:
        manifest['preProcesses'] = procs(ssh)
        if len([p for p in manifest['preProcesses'] if p['name'] in NODES and p['status'] == 'online']) != 7:
            raise RuntimeError('GAME_PROCESS_BASELINE')
        manifest['preReady'] = {name: ready(ssh, name, 3) for name in NODES}

        for row in manifest['files']:
            target = REMOTE + '/' + row['relative']
            if rh(ssh, target) != row['sha256']:
                raise RuntimeError('BASELINE_CAS:' + row['relative'])
            data = (OUT / 'candidate' / row['relative']).read_bytes()
            if sha(data) != row['candidate']:
                raise RuntimeError('LOCAL_CANDIDATE_HASH:' + row['relative'])
            staged = STAGE + '/candidate/' + row['relative']
            upload(ssh, staged, data)
            if row['relative'].endswith('.js'):
                run(ssh, 'node --check ' + shlex.quote(staged), 30)
        manifest['phase'] = 'staged'
        save(manifest)

        backup = REMOTE + '/_ai_workbench/backups/fulu_save_cas_fix_20261008_' + datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        if exists(ssh, backup):
            raise RuntimeError('BACKUP_EXISTS')
        run(ssh, 'mkdir -p ' + shlex.quote(backup))
        manifest['backup'] = backup
        upload(ssh, backup + '/manifest-pre.json', json.dumps(manifest, ensure_ascii=False, indent=2).encode())
        manifest['phase'] = 'backed_up'
        save(manifest)

        # Publish all files atomically before restarting the game workers. The
        # new response shape is backward-compatible with the old client.
        for row in manifest['files']:
            publish_file(ssh, row, backup)
            manifest.setdefault('published', []).append(row['relative'])
            save(manifest)

        manifest['restarted'] = []
        manifest['rollingReady'] = {}
        for name in NODES:
            run(ssh, 'pm2 restart ' + shlex.quote(name), 60)
            manifest['restarted'].append(name)
            manifest['rollingReady'][name] = ready(ssh, name, 30)
            save(manifest)
            print(json.dumps({'server': name, 'ready': 'ok'}, ensure_ascii=False), flush=True)

        manifest['finalHashes'] = {row['relative']: rh(ssh, REMOTE + '/' + row['relative']) for row in manifest['files']}
        if any(manifest['finalHashes'][row['relative']] != row['candidate'] for row in manifest['files']):
            raise RuntimeError('FINAL_HASH')
        manifest['finalReady'] = {name: ready(ssh, name, 3) for name in NODES}
        manifest['postProcesses'] = procs(ssh)
        pre_non_game = {p['name']: p for p in manifest['preProcesses'] if p['name'] not in NODES}
        post_non_game = {p['name']: p for p in manifest['postProcesses'] if p['name'] not in NODES}
        if any(post_non_game.get(name, {}).get('pid') != row.get('pid') for name, row in pre_non_game.items()):
            raise RuntimeError('NON_GAME_PROCESS_CHANGED')

        index = run(ssh, 'curl -fsS --max-time 15 http://127.0.0.1:81/index.html', 25)
        for marker in ['lhs-fulu-safe-v1.js?v=20261008_fulu_safe_v4',
                       'lhs-event-maintenance-v1.js?v=20261008_event_quiet_v1']:
            if marker not in index:
                raise RuntimeError('INDEX_MARKER:' + marker)
        manifest['servedHashes'] = {}
        for row in manifest['files']:
            if not row['relative'].startswith('webgame/game/js/'):
                continue
            route = row['relative'].removeprefix('webgame/game/')
            url = 'http://127.0.0.1:81/' + route + '?v=' + manifest['version']
            digest = run(ssh, 'curl -fsS --max-time 15 ' + shlex.quote(url) + ' | sha256sum', 25).split()[0]
            if digest != row['candidate']:
                raise RuntimeError('PUBLIC_HASH:' + row['relative'])
            manifest['servedHashes'][row['relative']] = digest
        manifest.update({'phase': 'verified', 'result': 'PASS', 'productionPlayerWrites': 0,
                         'verifiedAt': datetime.now(timezone.utc).isoformat()})
        save(manifest)
        print(json.dumps({'result': 'PASS', 'phase': 'verified', 'backup': backup,
                          'files': manifest['published'], 'servedHashes': manifest['servedHashes']}, ensure_ascii=False))
    except Exception as error:
        manifest['lastError'] = str(error)
        save(manifest)
        raise
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
