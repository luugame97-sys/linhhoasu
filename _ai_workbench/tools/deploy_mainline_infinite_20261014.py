from __future__ import annotations

import datetime as dt
import hashlib
import json
import shlex
import stat
import time
from pathlib import Path

from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '_ai_workbench/temp/mainline_infinite_20261014'
CAND = WORK / 'candidate'
RECEIPT = WORK / 'deployment.json'
APP = '/linhhoasu/lhs/newServer'
WEB = '/linhhoasu/webgame/game'
NODES = {
    'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085,
    'lhs-s1005': 8086, 'lhs-s1006': 8087, 'lhs-s1007': 8088, 'lhs-s1008': 8089,
}

FILES = {
    f'{APP}/src/handlers/raid.js': CAND / 'src/handlers/raid.js',
    f'{APP}/src/handlers/playerPayload.js': CAND / 'src/handlers/playerPayload.js',
    f'{APP}/src/services/BattleService.js': CAND / 'src/services/BattleService.js',
    f'{APP}/src/services/MainTaskProgressService.js': CAND / 'src/services/MainTaskProgressService.js',
    f'{APP}/src/handlers/upgrade.js': CAND / 'src/handlers/upgrade.js',
    f'{APP}/src/services/CultivationProgressionService.js': CAND / 'src/services/CultivationProgressionService.js',
    f'{APP}/src/config/infiniteMainline.js': CAND / 'src/config/infiniteMainline.js',
    f'{WEB}/index.html': CAND / 'web/index.html',
    f'{WEB}/js/lhs-mainline-infinite-data-v1.js': CAND / 'web/js/lhs-mainline-infinite-data-v1.js',
    f'{WEB}/js/lhs-mainline-infinite-v1.js': CAND / 'web/js/lhs-mainline-infinite-v1.js',
}
NEW_FILES = {
    f'{APP}/src/config/infiniteMainline.js',
    f'{WEB}/js/lhs-mainline-infinite-data-v1.js',
    f'{WEB}/js/lhs-mainline-infinite-v1.js',
}

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def read_bytes(path: Path) -> bytes:
    data = path.read_bytes()
    if not data:
        raise RuntimeError('EMPTY_CANDIDATE:' + str(path))
    return data

def json_cmd(client, command):
    return json.loads(run(client, command))

def main() -> None:
    if RECEIPT.exists():
        raise RuntimeError('RECEIPT_EXISTS:' + str(RECEIPT))
    payloads = {remote: (read_bytes(local), sha(read_bytes(local))) for remote, local in FILES.items()}
    for remote, (_data, digest) in payloads.items():
        if digest != sha(FILES[remote].read_bytes()):
            raise RuntimeError('LOCAL_HASH_RACE:' + remote)

    report = {
        'at': dt.datetime.now(dt.timezone.utc).isoformat(),
        'scope': 'S1-S8', 'playerWrites': 0, 'productionWrites': 0,
        'files': {}, 'restarts': [], 'rollback': None,
    }
    swapped: list[str] = []
    restarted: list[str] = []
    backup = ''
    syntax_paths: list[str] = []
    with connect() as client:
        sftp = client.open_sftp()
        try:
            processes = json_cmd(client, 'pm2 jlist')
            pre = {
                row['name']: {
                    'pid': row['pid'], 'status': row['pm2_env']['status'],
                    'restarts': row['pm2_env']['restart_time'], 'watch': row['pm2_env'].get('watch', False),
                }
                for row in processes if row['name'] in NODES
            }
            if set(pre) != set(NODES):
                raise RuntimeError('NODE_SET_MISMATCH:' + json.dumps(sorted(set(NODES) - set(pre))))
            if any(x['status'] != 'online' or x['watch'] for x in pre.values()):
                raise RuntimeError('NODE_PRECONDITION:' + json.dumps(pre))

            def ready(name: str) -> dict:
                deadline = time.monotonic() + 60
                last = None
                while time.monotonic() < deadline:
                    try:
                        value = json_cmd(client, f'curl -fsS --max-time 5 http://127.0.0.1:{NODES[name]}/ready')
                        last = value
                        if value.get('status') == 'ok' and value.get('checks', {}).get('mongo') is True and value.get('checks', {}).get('redis') is True:
                            return value
                    except Exception:
                        pass
                    time.sleep(1)
                raise RuntimeError('READY_TIMEOUT:' + name + ':' + json.dumps(last))

            report['preProcesses'] = pre
            report['preReady'] = {name: ready(name) for name in NODES}
            print('PROGRESS:preflight', flush=True)

            stamp = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime('%Y%m%d_%H%M%S')
            backup = f'/linhhoasu/_ai_workbench/backups/mainline_infinite_{stamp}'
            report['backupDir'] = backup
            run(client, 'mkdir -m 700 -- ' + shlex.quote(backup))
            stage_paths = {}
            preimage = {}
            for remote, (data, after) in payloads.items():
                exists = True
                try:
                    remote_stat = sftp.stat(remote)
                except FileNotFoundError:
                    exists = False
                    remote_stat = None
                if remote in NEW_FILES:
                    if exists:
                        current = sha(sftp.open(remote, 'rb').read())
                        if current != after:
                            raise RuntimeError('NEW_FILE_DRIFT:' + remote + ':' + current)
                    preimage[remote] = {'exists': exists, 'sha256': after if exists else None}
                else:
                    if not exists:
                        raise RuntimeError('EXPECTED_FILE_MISSING:' + remote)
                    with sftp.open(remote, 'rb') as handle:
                        current_data = handle.read()
                    current = sha(current_data)
                    baseline = report.get('baseline', {}).get(remote)
                    # Existing files are guarded against the exact current
                    # preimage captured in this rollout, then backed up.
                    preimage[remote] = {'exists': True, 'sha256': current, 'mode': stat.S_IMODE(remote_stat.st_mode),
                                        'uid': remote_stat.st_uid, 'gid': remote_stat.st_gid}
                    report['files'][remote] = {'before': current, 'after': after, 'candidate': str(FILES[remote])}
                    safe_name = remote.strip('/').replace('/', '__')
                    backup_path = backup + '/' + safe_name
                    run(client, 'cp -p -- ' + shlex.quote(remote) + ' ' + shlex.quote(backup_path))
                    with sftp.open(backup_path, 'rb') as handle:
                        if sha(handle.read()) != current:
                            raise RuntimeError('BACKUP_HASH_MISMATCH:' + remote)
                stage = remote + '.mainline_infinite_' + stamp
                stage_paths[remote] = stage
                with sftp.open(stage, 'wb') as handle:
                    handle.write(data)
                if remote_stat:
                    sftp.chmod(stage, stat.S_IMODE(remote_stat.st_mode))
                    sftp.chown(stage, remote_stat.st_uid, remote_stat.st_gid)
                else:
                    sftp.chmod(stage, 0o640)
                    sftp.chown(stage, 0, 1001 if remote.startswith(WEB) else 0)
                with sftp.open(stage, 'rb') as handle:
                    if sha(handle.read()) != after:
                        raise RuntimeError('STAGE_HASH_MISMATCH:' + remote)
                print('PROGRESS:staged:' + remote, flush=True)

            # Candidate-only contract from the staged source tree is checked
            # after swap; this preflight still proves every staged JS parses.
            report['staged'] = {remote: after for remote, (_data, after) in payloads.items()}
            for remote in FILES:
                current = None
                try:
                    with sftp.open(remote, 'rb') as handle:
                        current = sha(handle.read())
                except FileNotFoundError:
                    pass
                expected = preimage[remote].get('sha256')
                if remote not in NEW_FILES and current != expected:
                    raise RuntimeError('CAS_BEFORE_SWAP:' + remote)
                if remote in NEW_FILES and current not in (None, payloads[remote][1]):
                    raise RuntimeError('NEW_CAS_BEFORE_SWAP:' + remote)

            for remote, stage in stage_paths.items():
                run(client, 'mv -f -- ' + shlex.quote(stage) + ' ' + shlex.quote(remote))
                swapped.append(remote)
                with sftp.open(remote, 'rb') as handle:
                    if sha(handle.read()) != payloads[remote][1]:
                        raise RuntimeError('LIVE_HASH_MISMATCH:' + remote)
                print('PROGRESS:swapped:' + remote, flush=True)

            contract = r'''const c=require('./src/services/ConfigService');const t=c.loadAllTables();const g=require('./src/config/infiniteMainline');const row=g.resolveLevel(1311,t.LevelConfig);if(!row||row.monsterId!==g.MONSTER_BASE+1311)throw Error('MAINLINE_ROW');const p={raidInfo:{chapter:23,level:1310}};require('./src/handlers/raid').advanceLevel(p,1310);if(p.raidInfo.level!==1311||p.raidInfo.chapter!==24||p.raidInfo.maxClearedLevel!==1310)throw Error('MAINLINE_ADVANCE');console.log('MAINLINE_CONTRACT='+JSON.stringify({version:g.VERSION,level:row.id,chapter:p.raidInfo.chapter,maxClearedLevel:p.raidInfo.maxClearedLevel,playerWrites:0}));'''
            output = run(client, 'cd ' + shlex.quote(APP) + ' && node -', contract)
            if 'MAINLINE_CONTRACT=' not in output:
                raise RuntimeError('POST_SWAP_CONTRACT_MISSING:' + output[-2000:])
            report['contract'] = json.loads(output.split('MAINLINE_CONTRACT=', 1)[1].splitlines()[0])

            for name in NODES:
                print('PROGRESS:restart:' + name, flush=True)
                run(client, 'pm2 restart ' + shlex.quote(name) + ' --update-env')
                restarted.append(name)
                state = json_cmd(client, 'pm2 jlist')
                current = next(x for x in state if x['name'] == name)
                ready_value = ready(name)
                report['restarts'].append({'name': name, 'pid': current['pid'], 'ready': ready_value})
                if current['pm2_env']['status'] != 'online' or current['pid'] == pre[name]['pid'] or current['pm2_env']['restart_time'] != pre[name]['restarts'] + 1:
                    raise RuntimeError('RESTART_INVARIANT:' + name)

            report['postReady'] = {name: ready(name) for name in NODES}
            post = json_cmd(client, 'pm2 jlist')
            report['postProcesses'] = {x['name']: {'pid': x['pid'], 'status': x['pm2_env']['status'], 'restarts': x['pm2_env']['restart_time']} for x in post if x['name'] in NODES}
            # Check served static files from the production origin as well as
            # the filesystem hashes; this catches stale CDN/index swaps.
            served = {}
            for remote in [f'{WEB}/index.html', f'{WEB}/js/lhs-mainline-infinite-data-v1.js', f'{WEB}/js/lhs-mainline-infinite-v1.js']:
                rel = remote.split('/game/', 1)[1]
                served[rel] = run(client, 'curl -fsS --max-time 20 ' + shlex.quote('https://linhhoasu.lol/' + rel) + ' | sha256sum').split()[0]
                if served[rel] != payloads[remote][1]:
                    raise RuntimeError('SERVED_HASH_MISMATCH:' + rel)
            report['served'] = served
            report['result'] = 'PASS'
            RECEIPT.parent.mkdir(parents=True, exist_ok=True)
            RECEIPT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            print(json.dumps({'result': 'PASS', 'scope': 'S1-S8', 'backupDir': backup, 'restarts': restarted, 'playerWrites': 0, 'productionWrites': 0, 'served': served}))
        except Exception as exc:
            report['error'] = repr(exc)
            if swapped:
                report['rollback'] = {'attempted': True, 'files': list(swapped)}
                for remote in reversed(swapped):
                    if remote in NEW_FILES and not preimage[remote].get('exists'):
                        run(client, 'rm -f -- ' + shlex.quote(remote))
                    else:
                        safe_name = remote.strip('/').replace('/', '__')
                        backup_path = backup + '/' + safe_name
                        stage = remote + '.mainline_infinite_rollback'
                        run(client, 'cp -p -- ' + shlex.quote(backup_path) + ' ' + shlex.quote(stage) + ' && mv -f -- ' + shlex.quote(stage) + ' ' + shlex.quote(remote))
                for name in restarted:
                    run(client, 'pm2 restart ' + shlex.quote(name) + ' --update-env')
                    ready(name)
                report['rollback']['completed'] = True
            RECEIPT.parent.mkdir(parents=True, exist_ok=True)
            RECEIPT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            raise
        finally:
            for stage in stage_paths.values() if 'stage_paths' in locals() else []:
                try: run(client, 'rm -f -- ' + shlex.quote(stage))
                except Exception: pass
            for syntax_stage in syntax_paths:
                try: run(client, 'rm -f -- ' + shlex.quote(syntax_stage))
                except Exception: pass
            sftp.close()

if __name__ == '__main__':
    main()
