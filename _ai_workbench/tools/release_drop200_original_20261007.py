"""Scoped original-gameplay restoration; stage/deploy/resume only, never auto-deploy.

Uses drop200 RAM loader and CAS publisher. A restart intent is persisted before
PM2; resume checks restart counters to avoid restarting an already rolled node.
No player writes, timer migration, downgrade, or database scanning.
"""
import json
import shlex
import sys
import time
import os
import hashlib
from pathlib import Path
import release_drop200_20261007 as base

WORK = Path(os.environ.get('DROP200_ORIGINAL_WORK', Path(__file__).resolve().parents[2] / '_ai_workbench/temp/drop200_original_20261007'))
base.WORK = WORK
base.STATE = WORK / 'release.json'
ALLOWED = {
    base.APP + '/src/config/dropLevel100.js',
    base.APP + '/src/config/roleLevel2000.js',
    base.APP + '/src/config/demonKing200.js',
    base.APP + '/src/config/demonBossDrop200.js',
    base.APP + '/src/services/DropTierMutationService.js',
    base.APP + '/src/services/EquipService.js',
    base.APP + '/src/services/ConfigService.js',
    base.APP + '/src/services/DropLevel46Service.js',
    base.APP + '/src/services/DropProgressionTimingService.js',
    base.APP + '/src/handlers/box.js',
    base.APP + '/src/handlers/account.js',
    base.APP + '/src/handlers/compat.js',
    '/linhhoasu/webgame/game/js/main.min_drop200.js',
    '/linhhoasu/webgame/game/js/lhs-box-tier100-v1.js',
    base.INDEX,
}
original_check_paths = base.check_paths

def check_paths(entry):
    if entry['remote'] not in ALLOWED:
        raise RuntimeError('Exact target not owned by this release: ' + entry['remote'])
    return original_check_paths(entry)

base.check_paths = check_paths

def flags(client):
    js = """const cp=require('child_process'),fs=require('fs');const app='/linhhoasu/lhs/newServer';const dotenv=require(app+'/node_modules/dotenv');const d=dotenv.parse(fs.readFileSync(app+'/.env'));const ps=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));let out=[];for(let i=1001;i<=1007;i++){let p=ps.find(x=>x.name==='lhs-s'+i);if(!p)throw Error('NODE_MISSING');let e={...d,...p.pm2_env,...p.pm2_env.env};if(p.pm2_env.status!=='online'||e.DROP_LEVEL_100_ENABLED!=='1'||e.ROLE_LEVEL_2000_ENABLED!=='1'||e.DROP_LEVEL_100_DISABLED==='1'||e.DROP_LEVEL_200_DISABLED==='1')throw Error('FLAGS_NOT_READY_S'+i);out.push({name:p.name,drop:e.DROP_LEVEL_100_ENABLED,role:e.ROLE_LEVEL_2000_ENABLED});}console.log(JSON.stringify(out));"""
    return json.loads(base.node(client, js))

def stage(client):
    flags(client)
    state = base.stage(client)
    for row in state['files']:
        if row['backup'] and base.remote_hash(client, row['backup']) != row['before']:
            raise RuntimeError('Backup hash failed: ' + row['remote'])
    state['runtimeFlags'] = flags(client)
    base.save(state)
    return state

def restage(client):
    state=json.loads(base.STATE.read_text(encoding='utf8'))
    if state['status'] not in ('STAGING','STAGED_TESTED'):
        raise RuntimeError('Restage requires unpublished candidate')
    manifest=json.loads((WORK/'candidate_files.json').read_text(encoding='utf8'))
    if {r['remote'] for r in manifest['files']} != {r['remote'] for r in state['files']}:
        raise RuntimeError('Restage targets differ')
    with client.open_sftp() as sf:
        for row in state['files']:
            check_paths(row)
            if base.remote_hash(client,row['remote']) != row['before']:
                raise RuntimeError('Restage live CAS')
            data=(WORK/row['local']).read_bytes()
            sf.put(str(WORK/row['local']),row['staged'])
            row['after']=hashlib.sha256(data).hexdigest()
            if base.remote_hash(client,row['staged']) != row['after']:
                raise RuntimeError('Restage hash')
            if row['remote'].endswith('.js'):base.run(client,'node --check '+shlex.quote(row['staged']))
        mapping={r['remote']:r['staged'] for r in state['files'] if r['remote'].endswith('.js')}
        for i,test in enumerate(state['tests']):
            spec=manifest['tests'][i]
            sf.put(str(WORK/spec['local']),test['target'])
            test['env']=spec.get('env',{})
            env={**test['env'],'DROP200_CANDIDATE_MAP':json.dumps(mapping),'DROP200_APP':base.APP,'DROP_LEVEL_100_ENABLED':'1','ROLE_LEVEL_2000_ENABLED':'1'}
            cmd='cd '+shlex.quote(base.APP)+' && env '+' '.join(k+'='+shlex.quote(str(v)) for k,v in env.items())+' node --require '+shlex.quote(test['loader'])+' '+shlex.quote(test['target'])
            test['output']=base.run(client,cmd)[-20000:]
    state['status']='STAGED_TESTED';base.save(state);return state

def mutate(client, state):
    if state['status'] not in ('STAGED_TESTED', 'DEPLOYING', 'FAILED'):
        raise RuntimeError('Require staged/tested or interrupted deployment')
    state['runtimeFlags'] = flags(client)
    state['preflightReadiness'] = {name: base.ready(client, name) for name in base.NODES}
    for row in state['files']:
        check_paths(row)
        current = base.remote_hash(client, row['remote'])
        permitted = (row['before'],) if state['status'] == 'STAGED_TESTED' else (row['before'], row['after'])
        if current not in permitted:
            raise RuntimeError('Predeploy CAS drift: ' + row['remote'])
        if base.remote_hash(client, row['staged']) != row['after']:
            raise RuntimeError('Staged source changed')
        if row['backup'] and base.remote_hash(client, row['backup']) != row['before']:
            raise RuntimeError('Backup source changed')
    state['status'] = 'DEPLOYING'
    base.save(state)
    for row in state['files']:
        if row['remote'] != base.INDEX:
            base.install(client, row)
    # All installed pure tests finish before first live process restart.
    state['installedRamTests'] = base.installed_tests(client, state)
    base.save(state)
    state.setdefault('restartIntents', {})
    state.setdefault('readiness', {})
    for name in base.NODES:
        process = next(p for p in base.inventory(client) if p['name'] == name)
        intent = state['restartIntents'].get(name)
        if intent is None:
            intent = {'pid': process['pid'], 'restarts': process['restarts'], 'startedAt': time.time()}
            state['restartIntents'][name] = intent
            base.save(state)
        # Crash after PM2 succeeded but before readiness/save is recognized.
        restarted = process['restarts'] > intent['restarts']
        if not restarted:
            if process['restarts'] != intent['restarts'] or process['pid'] != intent['pid']:
                raise RuntimeError('Ambiguous restart state: ' + name)
            base.run(client, 'pm2 restart ' + shlex.quote(name))
        state['readiness'][name] = base.ready(client, name)
        if name not in state['restarted']:
            state['restarted'].append(name)
        base.save(state)
    base.install(client, next(r for r in state['files'] if r['remote'] == base.INDEX))
    state['finalHashes'] = {}
    for row in state['files']:
        actual = base.remote_hash(client, row['remote'])
        if actual != row['after']:
            raise RuntimeError('Final hash drift: ' + row['remote'])
        state['finalHashes'][row['remote']] = actual
    js_files = [r['remote'].split('/webgame/game/')[1] for r in state['files'] if '/webgame/game/js/' in r['remote']]
    state['indexReferences'] = base.node(client, "const fs=require('fs');let s=fs.readFileSync(" + json.dumps(base.INDEX) + ",'utf8');for(const p of " + json.dumps(js_files) + "){if(!s.includes(p))throw Error('INDEX_REFERENCE_MISSING:'+p)}console.log('INDEX_REFERENCES_PASS');").strip()
    state['afterProcesses'] = base.inventory(client)
    before = {p['name']: p for p in state['beforeProcesses']}
    for p in state['afterProcesses']:
        if p['name'] not in base.NODES and p['name'] in before and p['pid'] != before[p['name']]['pid']:
            raise RuntimeError('Unrelated process PID changed: ' + p['name'])
    state['public'] = []
    for row in state['files']:
        if row.get('public_url'):
            command = 'set -o pipefail; curl --fail --silent --show-error --max-time 40 ' + shlex.quote(row['public_url']) + ' | sha256sum'
            actual = base.run(client, 'bash -c ' + shlex.quote(command)).split()[0]
            if actual != row['after']:
                raise RuntimeError('Public hash mismatch: ' + row['public_url'])
            state['public'].append({'url': row['public_url'], 'sha256': actual})
    state.pop('lastError', None)
    state['status'] = 'DEPLOYED'
    base.save(state)
    return state

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'stage'
    if mode not in ('stage', 'restage', 'deploy', 'resume'):
        raise SystemExit('mode: stage/deploy/resume; rollback requires reviewed forward-compatible manifest')
    with base.connect() as client:
        state = stage(client) if mode == 'stage' else restage(client) if mode == 'restage' else json.loads(base.STATE.read_text(encoding='utf8'))
        if mode not in ('stage','restage'):
            try:
                state = mutate(client, state)
            except Exception as error:
                state['lastError'] = str(error)
                base.save(state)
                raise
    print(json.dumps({'status': state['status'], 'state': str(base.STATE), 'backup': state['backup']}))

if __name__ == '__main__':
    main()
