"""Resume a partially completed Fulu public-enable rolling release."""
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from release_petsoul_day1_20261007 import connect, run, ready, procs

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/fulu_public_enable_20261008'
MANIFEST = OUT / 'release.json'
REMOTE = '/linhhoasu'
NODES = {f'lhs-s100{i}': 8080 if i == 1 else 8081 + i for i in range(1, 8)}


def rh(ssh, path):
    return run(ssh, 'sha256sum ' + shlex.quote(path)).split()[0]


def save(m):
    MANIFEST.write_text(json.dumps(m, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    m = json.loads(MANIFEST.read_text(encoding='utf-8-sig'))
    if m.get('phase') != 'backed_up':
        raise RuntimeError('RESUME_PHASE:' + str(m.get('phase')))
    ssh = connect()
    try:
        m.setdefault('restarted', [])
        m.setdefault('rollingReady', {})
        for name in NODES:
            if name in m['restarted']:
                continue
            run(ssh, 'pm2 restart ' + shlex.quote(name), 60)
            m['restarted'].append(name)
            m['rollingReady'][name] = ready(ssh, name, 30)
            save(m)
            print(json.dumps({'server': name, 'ready': 'ok'}, ensure_ascii=False), flush=True)
        m['finalHashes'] = {row['relative']: rh(ssh, REMOTE + '/' + row['relative']) for row in m['files']}
        if any(m['finalHashes'][row['relative']] != row['candidate'] for row in m['files']):
            raise RuntimeError('FINAL_HASH')
        m['finalReady'] = {name: ready(ssh, name, 3) for name in NODES}
        m['postProcesses'] = procs(ssh)
        pre_non_game = {p['name']: p for p in m['preProcesses'] if p['name'] not in NODES}
        post_non_game = {p['name']: p for p in m['postProcesses'] if p['name'] not in NODES}
        if any(post_non_game.get(name, {}).get('pid') != row.get('pid') for name, row in pre_non_game.items()):
            raise RuntimeError('NON_GAME_PROCESS_CHANGED')

        check = """const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');c.loadAllTables();const g=require('/linhhoasu/lhs/newServer/src/services/EventExposureGate');const r=require('/linhhoasu/lhs/newServer/src/services/EventRotationRegistry');const out={};for(const id of [1001,1002,1003,1004,1005,1006,1007])out[id]={fuluBlocked:g.isBlocked(52001,{userId:'ordinary',player:{serverId:id}}),type21Blocked:g.isBlocked(21001,{userId:'ordinary',player:{serverId:id}}),type27Blocked:g.isBlocked(27001,{userId:'ordinary',player:{serverId:id}}),type30Blocked:g.isBlocked(30001,{userId:'ordinary',player:{serverId:id}})};console.log(JSON.stringify({activity:c.get('ActivityConfig')[52001],registry:r.snapshot().families.filter(x=>x.key==='fulu'),servers:out}));"""
        m['runtime'] = json.loads(run(ssh, 'EVENT_ROTATION_NATIVE_ENABLED=1 node -e ' + shlex.quote(check), 90).strip().splitlines()[-1])
        if any(row['fuluBlocked'] is not False for row in m['runtime']['servers'].values()):
            raise RuntimeError('FULU_STILL_BLOCKED')
        if any(row['type21Blocked'] is not True or row['type27Blocked'] is not True or row['type30Blocked'] is not True for row in m['runtime']['servers'].values()):
            raise RuntimeError('OTHER_GATE_CHANGED')
        if not m['runtime']['registry'] or m['runtime']['registry'][0].get('enabled') is not True:
            raise RuntimeError('FULU_REGISTRY_NOT_ENABLED')
        index = run(ssh, 'curl -fsS --max-time 15 http://127.0.0.1:81/index.html', 25)
        if 'lhs-fulu-safe-v1.js?v=20261008_fulu_safe_v4' not in index:
            raise RuntimeError('CLIENT_V4_MISSING')
        m.update({'phase': 'verified', 'result': 'PASS', 'productionPlayerWrites': 0,
                  'verifiedAt': datetime.now(timezone.utc).isoformat()})
        save(m)
        print(json.dumps({'result': 'PASS', 'phase': 'verified', 'backup': m['backup'],
                          'servers': 7, 'fuluPublic': True, 'otherGatesPreserved': True}, ensure_ascii=False))
    except Exception as e:
        m['lastError'] = str(e)
        save(m)
        raise
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
