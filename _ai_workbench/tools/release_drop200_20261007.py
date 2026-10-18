"""Scoped drop200 release. stage is inert; deploy/resume/rollback are explicit modes.

Manifest: {files:[{local,remote,before,public_url?}], tests:[{local,args?,env?}]}.
Local paths are relative to drop200_20261007. before is exact SHA256 or null.
Tests run with canonical candidate remapping and outbound network disabled.
"""
from pathlib import Path
import hashlib
import json
import shlex
import sys
import time
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '_ai_workbench/temp/drop200_20261007'
STATE = WORK / 'release.json'
APP = '/linhhoasu/lhs/newServer'
INDEX = '/linhhoasu/webgame/game/index.html'
NODES = dict(zip(['lhs-s' + str(i) for i in range(1001, 1008)], [8080, 8083, 8084, 8085, 8086, 8087, 8088]))

def sha(data):
    return hashlib.sha256(data).hexdigest()

def save(state):
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf8')

def node(client, source):
    return run(client, 'node -', source)

def inventory(client):
    return json.loads(node(client, "const cp=require('child_process');console.log(JSON.stringify(JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time}))));"))

def remote_hash(client, path):
    return json.loads(node(client, "const f=require('fs'),c=require('crypto'),p=" + json.dumps(path) + ";console.log(JSON.stringify(f.existsSync(p)?c.createHash('sha256').update(f.readFileSync(p)).digest('hex'):null));"))

def mkdir(sf, path):
    try:
        sf.stat(path)
    except FileNotFoundError:
        mkdir(sf, path.rsplit('/', 1)[0])
        sf.mkdir(path)

def check_paths(entry):
    local = (WORK / entry['local']).resolve()
    if not local.is_relative_to(WORK.resolve()) or not local.is_file():
        raise RuntimeError('Invalid candidate local path: ' + str(local))
    remote = entry['remote']
    if not (remote.startswith(APP + '/src/') or remote.startswith('/linhhoasu/webgame/game/js/') or remote == INDEX):
        raise RuntimeError('Out of scope target: ' + remote)
    if '/..' in remote or 'before' not in entry:
        raise RuntimeError('Invalid target or missing baseline hash')
    return local

def stage(client):
    if STATE.exists():
        raise RuntimeError('release.json exists; inspect it before staging a second release')
    manifest = json.loads((WORK / 'candidate_files.json').read_text(encoding='utf-8-sig'))
    if not manifest.get('files') or not manifest.get('tests'):
        raise RuntimeError('Require candidate files and RAM tests')
    targets = [e['remote'] for e in manifest['files']]
    if len(targets) != len(set(targets)) or INDEX not in targets:
        raise RuntimeError('Targets must be unique and include index published last')
    stamp = time.strftime('%Y%m%d_%H%M%S', time.gmtime())
    state = {'status': 'STAGING', 'stage': '/linhhoasu/_ai_workbench/temp/drop200_' + stamp,
             'backup': '/linhhoasu/_ai_workbench/backups/drop200_' + stamp,
             'beforeProcesses': inventory(client), 'files': [], 'tests': [], 'restarted': [], 'productionPlayerWrites': 0}
    save(state)
    with client.open_sftp() as sf:
        mkdir(sf, state['stage'])
        mkdir(sf, state['backup'])
        for entry in manifest['files']:
            local = check_paths(entry)
            target = entry['remote']
            actual = remote_hash(client, target)
            if actual != entry['before']:
                raise RuntimeError('Baseline CAS: ' + target)
            rel = target.removeprefix('/linhhoasu/')
            staged = state['stage'] + '/publish/' + rel
            backup = state['backup'] + '/' + rel
            mkdir(sf, staged.rsplit('/', 1)[0])
            sf.put(str(local), staged)
            sf.chmod(staged, 0o644)
            mode, uid, gid = 0o644, 0, 0
            if actual is not None:
                stat = sf.stat(target)
                mode, uid, gid = stat.st_mode & 0o777, stat.st_uid, stat.st_gid
                mkdir(sf, backup.rsplit('/', 1)[0])
                run(client, 'cp -p -- ' + shlex.quote(target) + ' ' + shlex.quote(backup))
            row = {**entry, 'staged': staged, 'backup': backup if actual else None,
                   'after': sha(local.read_bytes()), 'mode': mode, 'uid': uid, 'gid': gid}
            state['files'].append(row)
            save(state)
            if remote_hash(client, staged) != row['after']:
                raise RuntimeError('Upload hash: ' + target)
            if target.endswith('.js'):
                run(client, 'node --check ' + shlex.quote(staged))
        # Use live module resolution, but compile every changed canonical module
        # from its staged source. Tests cannot reach DB/Redis/HTTP even by accident.
        mapping = {e['remote']: e['staged'] for e in state['files'] if e['remote'].endswith('.js')}
        loader = """'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
const map=JSON.parse(process.env.DROP200_CANDIDATE_MAP||'{}');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent){
 let candidate=request.startsWith('/')?request:request.startsWith('.')&&parent?path.resolve(path.dirname(parent.filename),request):null;
 if(candidate){if(map[candidate])return candidate;if(map[candidate+'.js'])return candidate+'.js';}
 return resolve.apply(this,arguments);
};
const original=Module._extensions['.js'];
Module._extensions['.js']=function(m,f){if(map[f])return m._compile(fs.readFileSync(map[f],'utf8'),f);return original(m,f);};
function denied(){throw Error('DROP200_TEST_NETWORK_FORBIDDEN');}
const net=require('net');net.connect=net.createConnection=denied;net.Socket.prototype.connect=denied;
const tls=require('tls');tls.connect=denied;
for(const x of ['http','https']){let m=require(x);m.request=m.get=denied;}
global.fetch=denied;
"""
        loader_path = state['stage'] + '/ram-loader.js'
        with sf.open(loader_path, 'w') as handle:
            handle.write(loader)
        for i, test in enumerate(manifest['tests']):
            local = (WORK / test['local']).resolve()
            if not local.is_relative_to(WORK.resolve()) or not local.is_file():
                raise RuntimeError('Invalid test path')
            target = state['stage'] + '/test_' + str(i) + '.js'
            sf.put(str(local), target)
            env = {**test.get('env', {}), 'DROP200_CANDIDATE_MAP': json.dumps(mapping),
                   'DROP200_APP': APP, 'DROP200_STAGE': state['stage'], 'DROP200_ROOT': state['stage'],
                   'DROP_LEVEL_100_ENABLED': '1', 'ROLE_LEVEL_2000_ENABLED': '1'}
            command = 'cd ' + shlex.quote(APP) + ' && env ' + ' '.join(k + '=' + shlex.quote(str(v)) for k, v in env.items())
            command += ' node --require ' + shlex.quote(loader_path) + ' ' + shlex.quote(target)
            command += ''.join(' ' + shlex.quote(str(a)) for a in test.get('args', []))
            output = run(client, command)
            state['tests'].append({'test': test['local'], 'output': output[-20000:], 'exitCode': 0,
                                   'target': target, 'args': test.get('args', []), 'env': test.get('env', {}), 'loader': loader_path})
            save(state)
    state['status'] = 'STAGED_TESTED'
    save(state)
    return state

def ready(client, name):
    deadline = time.monotonic() + 100
    last = ''
    while time.monotonic() < deadline:
        try:
            raw = run(client, 'curl --silent --show-error --max-time 8 http://127.0.0.1:' + str(NODES[name]) + '/ready')
            data = json.loads(raw)
            # Confirm both stores regardless of the readiness nesting version.
            flat = json.dumps(data).lower()
            mongo = data.get('mongo', data.get('checks', {}).get('mongo'))
            redis = data.get('redis', data.get('checks', {}).get('redis'))
            if mongo is None: mongo = data.get('mongodb', data.get('dependencies', {}).get('mongo'))
            if redis is None: redis = data.get('dependencies', {}).get('redis')
            if data.get('status') == 'ok' and mongo is True and redis is True:
                return data
            last = flat
        except Exception as error:
            last = str(error)
        time.sleep(2)
    raise RuntimeError('Readiness failed ' + name + ': ' + last[-500:])

def install(client, row, rollback=False):
    wanted = row['before'] if rollback else row['after']
    current = remote_hash(client, row['remote'])
    if current == wanted:
        return
    expected = row['after'] if rollback else row['before']
    if current != expected:
        raise RuntimeError('Publish CAS drift: ' + row['remote'])
    if rollback and row['before'] is None:
        # Leave an unreferenced newly introduced static asset for recovery.
        return
    source = row['backup'] if rollback else row['staged']
    if remote_hash(client, source) != wanted:
        raise RuntimeError('Frozen source changed: ' + source)
    js = "const fs=require('fs');const r=" + json.dumps(row) + ";const src=" + json.dumps(source) + ";const tmp=r.remote+'.drop200-publish';fs.copyFileSync(src,tmp);fs.chmodSync(tmp,r.mode);fs.chownSync(tmp,r.uid,r.gid);fs.renameSync(tmp,r.remote);"
    node(client, js)
    if remote_hash(client, row['remote']) != wanted:
        raise RuntimeError('Installed hash mismatch: ' + row['remote'])

def installed_tests(client, state):
    results = []
    for test in state['tests']:
        env = {**test['env'], 'DROP200_CANDIDATE_MAP': '{}', 'DROP200_INSTALLED': '1',
               'DROP200_APP': APP, 'DROP200_STAGE': state['stage'], 'DROP200_ROOT': state['stage'],
               'DROP_LEVEL_100_ENABLED': '1', 'ROLE_LEVEL_2000_ENABLED': '1'}
        cmd = 'cd ' + shlex.quote(APP) + ' && env ' + ' '.join(k + '=' + shlex.quote(str(v)) for k, v in env.items())
        cmd += ' node --require ' + shlex.quote(test['loader']) + ' ' + shlex.quote(test['target'])
        cmd += ''.join(' ' + shlex.quote(str(a)) for a in test['args'])
        results.append({'test': test['test'], 'output': run(client, cmd)[-20000:], 'exitCode': 0})
    return results

def rollback_guard(client):
    # Read-only, effective dotenv + PM2 environment, Mongoose Player collection.
    # Scan nested equipment/inventory to cover open lists, presets and bags.
    # Never emit identities, connection strings or exception stacks.
    script = r"""
const fs=require('fs'),cp=require('child_process');
const app='/linhhoasu/lhs/newServer';
const dotenv=require(app+'/node_modules/dotenv');
const pm=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));
const rows=[];
for(let sid=1001;sid<=1007;sid++){
 const p=pm.find(p=>p.name==='lhs-s'+sid);if(!p)throw Error('ROLLBACK_RUNTIME_MISSING');
 const e=p.pm2_env||{};let base={};try{base=dotenv.parse(fs.readFileSync(app+'/.env'))}catch(_){}
 const env={...process.env,...base,...e,...e.env};
 const code=`const mongoose=require('./node_modules/mongoose');const Player=require('./src/db/models/Player');
 function q(v){if(!v||typeof v!=='object')return false;if(Number(v.quality)>=100)return true;
 for(const k of ['id','itemId','templateId']){let n=Number(v[k]);if(n>=200100000&&n<200200000)return true;}
 for(const [k,x] of Object.entries(v)){let n=Number(k);if(n>=200100000&&n<200200000&&Number(x)>0)return true;if(x&&typeof x==='object'&&q(x))return true;}return false;}
 (async()=>{if(!process.env.MONGO_URI)throw Error('URI_MISSING');await mongoose.connect(process.env.MONGO_URI,{serverSelectionTimeoutMS:5000});
 let count=0;const col=Player.collection;
 const filter={$or:[{'boxInfo.level':{$gt:100}},{'boxInfo.tier':{$gt:100}},{'equipInfo.equipList.quality':{$gte:100}},{'equipInfo.equipList.id':{$gte:200100000,$lt:200200000}}]};
 count=await col.countDocuments(filter);
 if(!count){const cursor=col.find({}, {projection:{boxInfo:1,equipInfo:1,items:1}});for await(const x of cursor){if(Number(x.boxInfo?.level)>100||Number(x.boxInfo?.tier)>100||q(x.equipInfo)||q(x.items)){count++;break;}}}
 console.log(JSON.stringify({server:Number(process.env.SERVER_ID),incompatible:count}));await mongoose.disconnect();})().catch(()=>{console.error('ROLLBACK_DB_AUDIT_FAILED');process.exitCode=1;});`;
 let r=cp.spawnSync('node',['-e',code],{cwd:app,env,encoding:'utf8',timeout:40000});
 if(r.status!==0)throw Error('ROLLBACK_DB_AUDIT_FAILED_S'+sid);
 rows.push(JSON.parse(r.stdout.trim().split(/\n/).pop()));
}
console.log(JSON.stringify(rows));
"""
    result = json.loads(node(client, script))
    if any(r['incompatible'] for r in result):
        raise RuntimeError('ROLLBACK_BLOCKED: persisted level/tier >100 or quality100+ found. Require forward-compatible source rollback; never reset players.')
    # Online sessions can advance between the scan and downgrade. A stopped
    # writer window must be arranged explicitly; this tool does not stop them.
    current = inventory(client)
    if any(p['name'] in NODES and p['status'] == 'online' for p in current):
        raise RuntimeError('ROLLBACK_BLOCKED: game writers online; arrange controlled quiescence and repeat DB audit before a downgrade.')
    return result

def mutate(client, state, rollback=False):
    if not rollback and state['status'] not in ('STAGED_TESTED', 'DEPLOYING', 'FAILED'):
        raise RuntimeError('Stage and test first')
    if rollback:
        state['rollbackAudit'] = rollback_guard(client)
    else:
        state['preflightReadiness'] = {name: ready(client, name) for name in NODES}
    # Preflight all targets before installing any single file.
    for row in state['files']:
        current = remote_hash(client, row['remote'])
        allowed = (row['before'], row['after']) if rollback or state['status'] in ('DEPLOYING', 'FAILED') else (row['before'],)
        if current not in allowed:
            raise RuntimeError('Predeploy CAS drift: ' + row['remote'])
        if not rollback and remote_hash(client, row['staged']) != row['after']:
            raise RuntimeError('Staged candidate drift: ' + row['remote'])
    state['status'] = 'ROLLING_BACK' if rollback else 'DEPLOYING'
    save(state)
    rows = state['files']
    if rollback:
        install(client, next(e for e in rows if e['remote'] == INDEX), True)
    for row in rows:
        if row['remote'] != INDEX:
            install(client, row, rollback)
    state['readiness'] = {}
    # Restart every game process so code/config consumers share one release.
    for i, name in enumerate(NODES):
        run(client, 'pm2 restart ' + shlex.quote(name))
        state['readiness'][name] = ready(client, name)
        if i == 0 and not rollback:
            state['installedRamTests'] = installed_tests(client, state)
        save(state)
    if not rollback:
        install(client, next(e for e in rows if e['remote'] == INDEX))
    state['finalHashes'] = {}
    for row in rows:
        actual = remote_hash(client, row['remote'])
        expected = row['before'] if rollback else row['after']
        if rollback and expected is None:
            continue
        if actual != expected:
            raise RuntimeError('Final hash drift: ' + row['remote'])
        state['finalHashes'][row['remote']] = actual
    if not rollback:
        js_files = [r['remote'].split('/webgame/game/')[1] for r in rows if '/webgame/game/js/' in r['remote']]
        check = "const fs=require('fs');let s=fs.readFileSync(" + json.dumps(INDEX) + ",'utf8');for(const p of " + json.dumps(js_files) + "){if(!s.includes(p))throw Error('INDEX_REFERENCE_MISSING:'+p)}console.log('INDEX_REFERENCES_PASS');"
        state['indexReferences'] = node(client, check).strip()
    state['afterProcesses'] = inventory(client)
    before = {p['name']: p for p in state['beforeProcesses']}
    for p in state['afterProcesses']:
        if p['name'] not in NODES and p['name'] in before and p['pid'] != before[p['name']]['pid']:
            raise RuntimeError('Unrelated process PID changed: ' + p['name'])
    state['public'] = []
    if not rollback:
        for row in rows:
            if row.get('public_url'):
                # Index may be transformed by Cloudflare; require caller's
                # public_url only for byte-stable JS assets.
                # Stream the large JS body through sha256sum; keeping it in a
                # Node child-process buffer hits the ~1 MiB spawnSync limit.
                actual = run(client, 'curl --fail --silent --show-error --max-time 25 '
                              + shlex.quote(row['public_url'])
                              + " | sha256sum | awk '{print $1}'").strip()
                if actual != row['after']:
                    raise RuntimeError('Public hash mismatch: ' + row['public_url'])
                state['public'].append({'url': row['public_url'], 'sha256': actual})
    state.pop('lastError', None)
    state['status'] = 'ROLLED_BACK' if rollback else 'DEPLOYED'
    save(state)
    return state

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'stage'
    if mode not in ('stage', 'deploy', 'resume', 'rollback'):
        raise SystemExit('mode: stage/deploy/resume/rollback')
    state = None
    try:
        with connect() as client:
            if mode == 'stage':
                state = stage(client)
            else:
                state = json.loads(STATE.read_text(encoding='utf8'))
                state = mutate(client, state, rollback=mode == 'rollback')
        print(json.dumps({'status': state['status'], 'backup': state['backup'], 'state': str(STATE)}))
    except Exception as error:
        if state is not None:
            state['lastError'] = str(error)
            save(state)
        raise

if __name__ == '__main__':
    main()
