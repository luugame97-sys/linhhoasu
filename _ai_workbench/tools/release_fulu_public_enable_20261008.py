"""Open only Fulu type52 after reviewed QA, with backup/CAS and 7-node read-back."""
import base64
import hashlib
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from release_petsoul_day1_20261007 import connect, run, ready, procs

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/fulu_public_enable_20261008'
MANIFEST = OUT / 'release.json'
REMOTE = '/linhhoasu'
STAGE = REMOTE + '/_ai_workbench/temp/fulu_public_enable_20261008'
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


def main():
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8-sig'))
    if manifest.get('phase') != 'candidate':
        raise RuntimeError('BAD_PHASE')
    ssh = connect()
    try:
        manifest['preProcesses'] = procs(ssh)
        manifest['preReady'] = {name: ready(ssh, name, 3) for name in NODES}
        if len([p for p in manifest['preProcesses'] if p['name'] in NODES and p['status'] == 'online']) != 7:
            raise RuntimeError('GAME_PROCESS_BASELINE')

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

        backup = REMOTE + '/_ai_workbench/backups/fulu_public_enable_20261008_' + datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        if exists(ssh, backup):
            raise RuntimeError('BACKUP_EXISTS')
        run(ssh, 'mkdir -p ' + shlex.quote(backup))
        manifest['backup'] = backup
        for row in manifest['files']:
            target = REMOTE + '/' + row['relative']
            dest = backup + '/' + row['relative']
            run(ssh, 'mkdir -p ' + shlex.quote(dest.rsplit('/', 1)[0]) + ' && cp -p ' + shlex.quote(target) + ' ' + shlex.quote(dest))
            if rh(ssh, dest) != row['sha256']:
                raise RuntimeError('BACKUP_HASH:' + row['relative'])
        upload(ssh, backup + '/manifest-pre.json', json.dumps(manifest, ensure_ascii=False, indent=2).encode())
        manifest['phase'] = 'backed_up'
        save(manifest)

        manifest['published'] = []
        for row in manifest['files']:
            target = REMOTE + '/' + row['relative']
            if rh(ssh, target) != row['sha256']:
                raise RuntimeError('PUBLISH_CAS:' + row['relative'])
            tmp = target + '.fulu_public_enable_20261008.tmp'
            if exists(ssh, tmp):
                raise RuntimeError('TEMP_EXISTS:' + tmp)
            staged = STAGE + '/candidate/' + row['relative']
            run(ssh, 'cp ' + shlex.quote(staged) + ' ' + shlex.quote(tmp)
                + ' && chmod --reference=' + shlex.quote(target) + ' ' + shlex.quote(tmp)
                + ' && chown --reference=' + shlex.quote(target) + ' ' + shlex.quote(tmp))
            if rh(ssh, tmp) != row['candidate']:
                raise RuntimeError('TEMP_HASH:' + row['relative'])
            run(ssh, 'mv -f ' + shlex.quote(tmp) + ' ' + shlex.quote(target))
            if rh(ssh, target) != row['candidate']:
                raise RuntimeError('INSTALL_HASH:' + row['relative'])
            manifest['published'].append(row['relative'])
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

        check = """const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');c.loadAllTables();const g=require('/linhhoasu/lhs/newServer/src/services/EventExposureGate');const r=require('/linhhoasu/lhs/newServer/src/services/EventRotationRegistry');const out={};for(const id of [1001,1002,1003,1004,1005,1006,1007])out[id]={fuluBlocked:g.isBlocked(52001,{userId:'ordinary',player:{serverId:id}}),type21Blocked:g.isBlocked(21001,{userId:'ordinary',player:{serverId:id}}),type27Blocked:g.isBlocked(27001,{userId:'ordinary',player:{serverId:id}}),type30Blocked:g.isBlocked(30001,{userId:'ordinary',player:{serverId:id}})};console.log(JSON.stringify({activity:c.get('ActivityConfig')[52001],registry:r.snapshot().families.filter(x=>x.key==='fulu'),servers:out}));"""
        runtime = json.loads(run(ssh, 'EVENT_ROTATION_NATIVE_ENABLED=1 node -e ' + shlex.quote(check), 90).strip().splitlines()[-1])
        if any(row['fuluBlocked'] is not False for row in runtime['servers'].values()):
            raise RuntimeError('FULU_STILL_BLOCKED')
        if any(row['type21Blocked'] is not True or row['type27Blocked'] is not True or row['type30Blocked'] is not True for row in runtime['servers'].values()):
            raise RuntimeError('OTHER_GATE_CHANGED')
        if not runtime['registry'] or runtime['registry'][0].get('enabled') is not True:
            raise RuntimeError('FULU_REGISTRY_NOT_ENABLED')
        manifest['runtime'] = runtime

        index = run(ssh, 'curl -fsS --max-time 15 http://127.0.0.1:81/index.html', 25)
        if 'lhs-fulu-safe-v1.js?v=20261008_fulu_safe_v4' not in index:
            raise RuntimeError('CLIENT_V4_MISSING')
        manifest['phase'] = 'verified'
        manifest['result'] = 'PASS'
        manifest['productionPlayerWrites'] = 0
        manifest['verifiedAt'] = datetime.now(timezone.utc).isoformat()
        save(manifest)
        print(json.dumps({'result': 'PASS', 'phase': 'verified', 'backup': backup,
                          'servers': 7, 'fuluPublic': True, 'otherGatesPreserved': True}, ensure_ascii=False))
    except Exception as error:
        manifest['lastError'] = str(error)
        save(manifest)
        raise
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
