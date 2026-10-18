"""S8 launch using the verified S7 workflow, with preserved file metadata.

prepare takes fresh live snapshots and validates staged candidates; apply uses
their exact hashes. Existing game processes receive only the S8 route delta.
On a failure, rollback closes S8 and restores only this release's file/route
changes, including original uid/gid/mode. No player data is deleted.
"""
from __future__ import annotations
import hashlib
import json
import re
import shlex
import stat
import sys
from datetime import datetime, timezone
from pathlib import Path

import deploy_server7_launch_20261003 as common

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/server8_launch_20261010'
APP = '/linhhoasu/lhs/newServer'
STAGE = '/linhhoasu/_ai_workbench/temp/server8_launch_20261010'
OPEN = 1791626400000  # 2026-10-10T17:00:00+07:00
PORTS = dict(zip([f'lhs-s100{i}' for i in range(1, 8)], [8080, 8083, 8084, 8085, 8086, 8087, 8088]))
ROUTE_KEYS = ['WS_PUBLIC_PORT_1008', 'WS_PUBLIC_PATH_1008', 'SERVER_NODE_HTTP_MAP']
FILES = {
    'ecosystem': APP + '/ecosystem.config.js',
    'nginx': '/www/server/panel/vhost/nginx/game.lhs.conf',
    'webgm_env': '/linhhoasu/webgame/gm/.env',
    'bot_template': APP + '/scripts/start-scheduled-bots-s7.js',
}
BOT_PATH = APP + '/scripts/start-scheduled-bots-s8.js'
run, node, ready = common.run, common.node, common.ready


def sha(b):
    return hashlib.sha256(b).hexdigest()


def read_files(c):
    with c.open_sftp() as s:
        result = {}
        for k, p in FILES.items():
            b = s.open(p, 'rb').read()
            # Use the VPS stat utility for canonical uid/gid/mode. SFTP servers
            # on this host have previously returned 0777 for files that were
            # actually 0640, which can reintroduce the WebGM outage on swap.
            meta = run(c, "stat -c '%a %u %g' " + shlex.quote(p)).strip().split()
            assert len(meta) == 3, 'FILE_STAT_INVALID:' + p
            result[k] = dict(path=p, data=b, sha256=sha(b), mode=int(meta[0], 8), uid=int(meta[1]), gid=int(meta[2]))
        return result


def public_files(files):
    return {k: {a: b for a, b in v.items() if a != 'data'} for k, v in files.items()}


def processes(c):
    rows = json.loads(run(c, 'pm2 jlist'))
    keys = ['SERVER_ID', 'DEFAULT_SERVER_ID', 'SERVER_NAME', 'SERVER_OPEN_TIME', 'HTTP_PORT', 'WS_PORT',
            'WS_PUBLIC_PATH', 'WS_PUBLIC_PORT', 'MONGO_URI', 'IDENTITY_MONGO_DB', 'REDIS_PREFIX',
            'AUTH_REDIS_PREFIX', 'ARENA_SETTLEMENT_ENABLED', 'ARENA_SETTLEMENT_APPROVED',
            'ARENA_SETTLEMENT_ACTIVATION_AT', 'EVENT_SETTLEMENT_ACTIVATION_AT', 'OLD_TREK_SETTLEMENT_ACTIVATION_AT',
            'OLD_TREK_SCOPED_CAS', 'CROSS_EVENT_ENABLED', 'BOT_WORKER_ENABLED', 'BOT_WORKER_COUNT',
            'BOT_WORKER_LAZY_BOTS_PER_MAP', 'BOT_WORKER_LAZY_MAX_ACTIVE', 'BOT_FLEET_MODE', 'BOT_FLEET_STATE_PATH'] + ROUTE_KEYS
    return [dict(name=p['name'], pid=p['pid'], status=p['pm2_env']['status'],
                 restarts=p['pm2_env']['restart_time'],
                 env={k: p['pm2_env'].get(k, p['pm2_env'].get('env', {}).get(k)) for k in keys}) for p in rows]


def mongo(c):
    js = r"""const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();
const id=c.db('lhs_s1001'),db=c.db('lhs_s1008');
console.log(JSON.stringify({now:Date.now(),rows:await id.collection('gameservers').find({}).sort({serverId:1}).toArray(),
collections:await db.listCollections({},{nameOnly:true}).toArray(),players:await db.collection('players').countDocuments({}),
roles:await id.collection('accounts').countDocuments({'roles.serverId':1008})}));await c.close()})().catch(e=>{console.error(e.message);process.exit(1)});"""
    return json.loads(node(c, js))


def write_receipt(name, value):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def candidates(files):
    eco = files['ecosystem']['data']
    assert b'S8_LAUNCH_' not in eco and b"name: 'lhs-s1008'" not in eco
    block = r'''
// S8_LAUNCH_20261010: 17:00 Asia/Bangkok. Runtime and persistence follow S7.
const server8OpenTime = 1791626400000;
for (const app of module.exports.apps.filter(app => /^lhs-s100[1-7]$/.test(app.name))) {
  app.env.WS_PUBLIC_PORT_1008 = 81;
  app.env.WS_PUBLIC_PATH_1008 = '/ws-s8';
  const routes = JSON.parse(app.env.SERVER_NODE_HTTP_MAP || '{}');
  routes['1008'] = 'http://127.0.0.1:8089';
  app.env.SERVER_NODE_HTTP_MAP = JSON.stringify(routes);
}
const server8Template = module.exports.apps.find(app => app.name === 'lhs-s1007');
const server8BotTemplate = module.exports.apps.find(app => app.name === 'lhs-real-bots-s7');
if (!server8Template || !server8BotTemplate) throw new Error('S8_TEMPLATES_MISSING');
module.exports.apps.push({
  ...server8Template,
  name: 'lhs-s1008',
  env: {
    ...server8Template.env,
    SERVER_ID: 1008, DEFAULT_SERVER_ID: 1008, SERVER_NAME: 'S8',
    SERVER_OPEN_TIME: server8OpenTime, HTTP_PORT: 8089, WS_PORT: 9207,
    WS_PUBLIC_PATH: '/ws-s8', WS_PUBLIC_PORT_1008: 81, WS_PUBLIC_PATH_1008: '/ws-s8',
    WS_PUBLIC_PORT_1005: 81, WS_PUBLIC_PATH_1005: '/ws-s5',
    SERVER_NODE_HTTP_MAP: '{"1001":"http://127.0.0.1:8080","1002":"http://127.0.0.1:8083","1003":"http://127.0.0.1:8084","1004":"http://127.0.0.1:8085","1005":"http://127.0.0.1:8086","1006":"http://127.0.0.1:8087","1007":"http://127.0.0.1:8088"}',
    MONGO_URI: 'mongodb://localhost:27017/lhs_s1008', REDIS_PREFIX: 's1008:',
    IDENTITY_MONGO_DB: 'lhs_s1001', AUTH_REDIS_PREFIX: 's1001:',
    ARENA_SETTLEMENT_ACTIVATION_AT: server8OpenTime,
    EVENT_SETTLEMENT_ACTIVATION_AT: server8OpenTime,
    OLD_TREK_SETTLEMENT_ACTIVATION_AT: String(server8OpenTime),
    // Match the additional runtime flag deployed on S7 on 08/10.
    OLD_TREK_SCOPED_CAS: '1',
  },
}, {
  ...server8BotTemplate,
  name: 'lhs-real-bots-s8', script: 'scripts/start-scheduled-bots-s8.js',
  env: {
    ...server8BotTemplate.env,
    SERVER_OPEN_TIME: server8OpenTime, BOT_WORKER_SERVER_ID: 1008,
    BOT_WORKER_WS_URL: 'ws://127.0.0.1:9207',
    BOT_WORKER_ACTIVITY_URL: 'http://127.0.0.1:9207/bot-activity',
  },
});
'''
    ng = files['nginx']['data']
    assert b'/ws-s8' not in ng
    m = re.search(rb'    location /ws-s7 \{.*?\n    \}', ng, re.S)
    assert m, 'S7_NGINX_BLOCK_MISSING'
    newblock = m.group().replace(b'/ws-s7', b'/ws-s8').replace(b':9206', b':9207')
    ng = ng[:m.end()] + b'\n\n' + newblock + ng[m.end():]
    env = files['webgm_env']['data']
    assert env.count(b'LHS_SERVER_COUNT=7') == 1 and b'LHS_SERVER_8_' not in env
    env = env.replace(b'LHS_SERVER_COUNT=7', b'LHS_SERVER_COUNT=8', 1)
    env += ('\nLHS_SERVER_8_ID=1008\nLHS_SERVER_8_KEY=1008\nLHS_SERVER_8_NAME=Linh Họa Sư - S8\n'
            'LHS_SERVER_8_API_BASE=http://127.0.0.1:8089\n').encode()
    bot = files['bot_template']['data']
    assert b'const S7_OPEN_TIME = 1791028800000;' in bot
    bot = bot.replace(b'S7', b'S8').replace(b'1007', b'1008').replace(b'1791028800000', str(OPEN).encode())
    return dict(ecosystem=eco + block.encode(), nginx=ng, webgm_env=env, bot=bot)


def validate_candidate(c):
    js = r'''
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),cp=require('child_process');
const root='/linhhoasu/lhs/newServer',stage='/linhhoasu/_ai_workbench/temp/server8_launch_20261010';
const live=require(root+'/ecosystem.config.js');
const sandbox={module:{exports:{}},require:require('module').createRequire(root+'/ecosystem.config.js'),__dirname:root,process};
vm.runInNewContext(fs.readFileSync(stage+'/ecosystem.js','utf8'),sandbox);
const candidate=JSON.parse(JSON.stringify(sandbox.module.exports));assert.equal(candidate.apps.length,live.apps.length+2);
for(const old of live.apps){const expected=JSON.parse(JSON.stringify(old));
 if(/^lhs-s100[1-7]$/.test(old.name)){
  expected.env.WS_PUBLIC_PORT_1008=81;expected.env.WS_PUBLIC_PATH_1008='/ws-s8';
  const routes=JSON.parse(expected.env.SERVER_NODE_HTTP_MAP||'{}');routes['1008']='http://127.0.0.1:8089';expected.env.SERVER_NODE_HTTP_MAP=JSON.stringify(routes);
 }
 assert.deepEqual(candidate.apps.find(p=>p.name===old.name),expected,'OLD_APP_CHANGED:'+old.name);
}
const game=candidate.apps.find(p=>p.name==='lhs-s1008'),bot=candidate.apps.find(p=>p.name==='lhs-real-bots-s8');
const ps=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));
const old=ps.find(p=>p.name==='lhs-s1007').pm2_env,oldBot=ps.find(p=>p.name==='lhs-real-bots-s7').pm2_env;
const changed=['SERVER_ID','DEFAULT_SERVER_ID','SERVER_NAME','SERVER_OPEN_TIME','HTTP_PORT','WS_PORT','WS_PUBLIC_PATH','WS_PUBLIC_PORT_1008','WS_PUBLIC_PATH_1008','WS_PUBLIC_PORT_1005','WS_PUBLIC_PATH_1005','SERVER_NODE_HTTP_MAP','MONGO_URI','REDIS_PREFIX','ARENA_SETTLEMENT_ACTIVATION_AT','EVENT_SETTLEMENT_ACTIVATION_AT','OLD_TREK_SETTLEMENT_ACTIVATION_AT'];
for(const [key,value] of Object.entries(game.env))if(!changed.includes(key))assert.equal(String(value),String(old[key]),'GAME_ENV_DRIFT:'+key);
for(const [key,value] of Object.entries(bot.env))if(!['SERVER_OPEN_TIME','BOT_WORKER_SERVER_ID','BOT_WORKER_WS_URL','BOT_WORKER_ACTIVITY_URL'].includes(key))assert.equal(String(value),String(oldBot[key]),'BOT_ENV_DRIFT:'+key);
for(const [key,value] of Object.entries({SERVER_ID:1008,DEFAULT_SERVER_ID:1008,SERVER_NAME:'S8',SERVER_OPEN_TIME:1791626400000,HTTP_PORT:8089,WS_PORT:9207,MONGO_URI:'mongodb://localhost:27017/lhs_s1008',REDIS_PREFIX:'s1008:',IDENTITY_MONGO_DB:'lhs_s1001',AUTH_REDIS_PREFIX:'s1001:',ARENA_SETTLEMENT_ENABLED:'1',ARENA_SETTLEMENT_APPROVED:'1',ARENA_SETTLEMENT_ACTIVATION_AT:1791626400000,EVENT_SETTLEMENT_ACTIVATION_AT:1791626400000}))assert.equal(game.env[key],value,key);
const gate=require(stage+'/bot.js');assert.equal(gate.S8_OPEN_TIME,1791626400000);
assert.equal(gate.validateConfig(bot.env).readyUrl,'http://127.0.0.1:9207/ready');
(async()=>{let now=1791626399999,callback,workers=0,readies=0;
const g=gate.createGate({env:bot.env,now:()=>now,schedule:f=>(callback=f,1),cancel:()=>{},ready:async()=>{readies++;return true;},makeWorker:()=>{workers++;return{start(){},stop(){}};},onError:e=>{throw e;}});
await g.start();assert.equal(workers,0);assert.equal(readies,0);now++;await callback();assert.equal(workers,1);g.stop();
console.log('PASS:existingAppsPreserved,templateMatchesLive,identityIsolated,botOpenBoundary');
})().catch(e=>{console.error(e.stack);process.exit(1)});
'''
    return node(c, js).strip()


def check_new_absent(c, before):
    assert before['mongo']['now'] < OPEN - 600000, 'OPEN_TOO_CLOSE_OR_PASSED'
    assert not any(x['serverId'] == 1008 for x in before['mongo']['rows']), 'S8_ALREADY_EXISTS'
    assert not before['mongo']['collections'] and before['mongo']['players'] == before['mongo']['roles'] == 0
    assert not any(x['name'] in ['lhs-s1008', 'lhs-real-bots-s8'] for x in before['processes'])
    listeners = run(c, 'ss -lnt')
    assert ':8089 ' not in listeners and ':9207 ' not in listeners, 'PORT_BUSY'
    with c.open_sftp() as s:
        try:
            s.stat(BOT_PATH)
        except FileNotFoundError:
            return
        raise RuntimeError('S8_BOT_FILE_EXISTS')


def prepare(c):
    files = read_files(c)
    assert (files['webgm_env']['mode'], files['webgm_env']['uid'], files['webgm_env']['gid']) == (0o640, 0, 1001), 'WEBGM_ENV_PERMISSIONS_UNSAFE'
    before = dict(at=datetime.now(timezone.utc).isoformat(), mongo=mongo(c), processes=processes(c), files=public_files(files))
    check_new_absent(c, before)
    before['readiness'] = {str(p): ready(c, p) for p in PORTS.values()}
    before['webgm'] = common.webgm_ready(c)
    data = candidates(files)
    run(c, 'install -d -m 700 ' + STAGE)
    with c.open_sftp() as s:
        for k, b in data.items():
            with s.open(STAGE + '/' + k + '.js', 'wb') as f:
                f.write(b)
            s.chmod(STAGE + '/' + k + '.js', 0o600)
    run(c, 'node --check ' + STAGE + '/ecosystem.js && node --check ' + STAGE + '/bot.js')
    check = validate_candidate(c)
    out = dict(result='PREPARED', openTime=OPEN, openLocal='17:00 10/10/2026 +07:00', before=before,
               hashes={k: sha(v) for k, v in data.items()}, candidateCheck=check)
    write_receipt('prepare.json', out)
    print(json.dumps(dict(result=out['result'], openTime=OPEN, candidateCheck=check, webgm=before['webgm'],
                          gameNodesReady=len(before['readiness']), envMetadata=before['files']['webgm_env']), ensure_ascii=False), flush=True)


def file_matches(s, item):
    a = s.stat(item['path'])
    return (sha(s.open(item['path'], 'rb').read()) == item['sha256'] and
            (stat.S_IMODE(a.st_mode), a.st_uid, a.st_gid) == (item['mode'], item['uid'], item['gid']))


def swap(c, old, data):
    with c.open_sftp() as s:
        assert file_matches(s, old), 'FILE_CAS_DRIFT:' + old['path']
        tmp = STAGE + '/swap-' + Path(old['path']).name
        with s.open(tmp, 'wb') as f:
            f.write(data)
        s.chown(tmp, old['uid'], old['gid'])
        s.chmod(tmp, old['mode'])
        assert file_matches(s, old), 'FILE_CAS_DRIFT_BEFORE_RENAME:' + old['path']
        s.posix_rename(tmp, old['path'])
        assert file_matches(s, {**old, 'sha256': sha(data)}), 'POST_SWAP_METADATA_OR_CONTENT'


def metadata(c, operation):
    body = {
        'insert': "const prior=await col.findOne({serverId:1008});if(prior)throw Error('S8_EXISTS');const x=await col.insertOne({serverId:1008,pageId:1,pageName:'MEGAME365',serverName:'S8',running:false,status:0,isNew:true,isRecommend:false,openTime:1791626400000,rechargeArea:1});console.log(JSON.stringify({id:String(x.insertedId)}));",
        'publish': "const x=await col.updateOne({serverId:1008,openTime:1791626400000,running:false,status:0},{$set:{running:true,status:1}});if(Number(x.matchedCount??x.n??0)!==1)throw Error('PUBLISH_CAS');console.log('PUBLISHED');",
        'close': "const x=await col.updateOne({serverId:1008,openTime:1791626400000},{$set:{running:false,status:0}});console.log(JSON.stringify({closed:x.matchedCount??x.n??0}));",
    }[operation]
    return node(c, "const {MongoClient}=require('" + APP + "/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const col=c.db('lhs_s1001').collection('gameservers');" + body + "await c.close()})().catch(e=>{console.error(e.message);process.exit(1)});").strip()


def change_route(c, old, add):
    latest = next(x for x in processes(c) if x['name'] == old['name'])
    original = old['env']
    routes = json.loads(original['SERVER_NODE_HTTP_MAP'] or '{}')
    routes['1008'] = 'http://127.0.0.1:8089'
    delta = dict(SERVER_NODE_HTTP_MAP=json.dumps(routes, separators=(',', ':')), WS_PUBLIC_PORT_1008='81', WS_PUBLIC_PATH_1008='/ws-s8')
    if add:
        assert latest['status'] == 'online' and latest['env'] == original, 'ROUTE_ENV_DRIFT:' + old['name']
    else:
        assert all(str(latest['env'][k]) == v for k, v in delta.items()), 'ROLLBACK_ROUTE_DRIFT'
        delta = {k: original[k] if original[k] is not None else '' for k in ROUTE_KEYS}
    prefix = ' '.join(k + '=' + shlex.quote(str(v)) for k, v in delta.items())
    run(c, prefix + ' pm2 restart ' + old['name'] + ' --update-env')
    return ready(c, PORTS[old['name']])


def qa(c):
    source = (ROOT / '_ai_workbench/tools/qa_server8_launch_20261010.js').read_text(encoding='utf-8')
    raw = run(c, 'node -', input_text=source, timeout=180)
    line = next(x for x in raw.splitlines() if x.startswith('SERVER8_LAUNCH_QA='))
    return json.loads(line.split('=', 1)[1])


def rollback(c, before, changed, route_names, backed_up, created):
    results = []
    if created:
        results.append(metadata(c, 'close'))
    names = {x['name'] for x in processes(c)}
    for name in ['lhs-real-bots-s8', 'lhs-s1008']:
        if name in names:
            run(c, 'pm2 stop ' + name)
    with c.open_sftp() as s:
        for key in reversed(changed):
            old = before['files'][key]
            candidate = s.open(STAGE + '/' + key + '.js', 'rb').read()
            data = s.open(backed_up + '/' + key + '.before', 'rb').read()
            assert sha(data) == old['sha256'], 'BACKUP_DRIFT'
            swap(c, {**old, 'sha256': sha(candidate)}, data)
            results.append('RESTORED:' + key)
    run(c, 'nginx -t && nginx -s reload')
    for name in reversed(route_names):
        change_route(c, next(x for x in before['processes'] if x['name'] == name), False)
        results.append('RESTORED_ROUTE:' + name)
    run(c, 'pm2 save')
    results.append(common.webgm_ready(c))
    return results


def apply(c):
    receipt = json.loads((OUT / 'prepare.json').read_text(encoding='utf-8'))
    before = dict(mongo=mongo(c), processes=processes(c))
    files = read_files(c)
    assert (files['webgm_env']['mode'], files['webgm_env']['uid'], files['webgm_env']['gid']) == (0o640, 0, 1001), 'WEBGM_ENV_PERMISSIONS_UNSAFE'
    before.update(at=datetime.now(timezone.utc).isoformat(), files=public_files(files))
    check_new_absent(c, before)
    assert before['files'] == receipt['before']['files'], 'PREPARE_FILES_DRIFT'
    assert before['mongo']['rows'] == receipt['before']['mongo']['rows'], 'SERVER_METADATA_DRIFT'
    for name in PORTS:
        current = next(x for x in before['processes'] if x['name'] == name)
        baseline = next(x for x in receipt['before']['processes'] if x['name'] == name)
        assert current == baseline and current['status'] == 'online', 'PROCESS_DRIFT:' + name
    before['webgm'] = common.webgm_ready(c)
    data = candidates(files)
    assert {k: sha(v) for k, v in data.items()} == receipt['hashes'], 'CANDIDATE_DRIFT'
    with c.open_sftp() as s:
        for k, b in data.items():
            assert s.open(STAGE + '/' + k + '.js', 'rb').read() == b, 'STAGE_DRIFT'
    validate_candidate(c)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = '/linhhoasu/_ai_workbench/backups/server8_launch_' + stamp
    common.backup(c, files, before, backup)
    # PM2 env secrets stay in the root-only remote snapshot. No local dump.
    run(c, 'umask 077; pm2 jlist > ' + backup + '/pm2-live.before.json')
    changed, routes, created = [], [], False
    result = dict(result='APPLYING', backup=backup, before=before, openTime=OPEN)
    write_receipt('evidence.json', result)
    try:
        swap(c, files['ecosystem'], data['ecosystem']); changed.append('ecosystem')
        with c.open_sftp() as s:
            # Ordinary SFTP rename refuses an existing destination.
            temp = STAGE + '/bot.install.js'
            with s.open(temp, 'wb') as f: f.write(data['bot'])
            s.chmod(temp, 0o644)
            s.rename(temp, BOT_PATH)
        result['insert'] = metadata(c, 'insert'); created = True
        run(c, 'cd ' + APP + ' && pm2 start ecosystem.config.js --only lhs-s1008')
        ready(c, 8089)
        print('S8_READY_PRIVATE', flush=True)
        swap(c, files['nginx'], data['nginx']); changed.append('nginx')
        run(c, 'nginx -t && nginx -s reload')
        swap(c, files['webgm_env'], data['webgm_env']); changed.append('webgm_env')
        result['webgmAfterSwap'] = common.webgm_ready(c)
        print('WEBGM_CONTENT_AND_PERMISSIONS_VERIFIED', flush=True)
        for name in PORTS:
            old = next(x for x in before['processes'] if x['name'] == name)
            routes.append(name)
            change_route(c, old, True)
            print(name + '_READY_WITH_S8_ROUTE', flush=True)
        metadata(c, 'publish')
        run(c, 'cd ' + APP + ' && pm2 start ecosystem.config.js --only lhs-real-bots-s8')
        run(c, 'pm2 save')
        result['qa'] = qa(c)
        result['webgm'] = common.webgm_ready(c)
        result['readiness'] = {str(p): ready(c, p) for p in list(PORTS.values()) + [8089]}
        after = dict(mongo=mongo(c), processes=processes(c), files=public_files(read_files(c)))
        assert [x for x in after['mongo']['rows'] if x['serverId'] != 1008] == before['mongo']['rows'], 'OLD_SERVER_ROWS_CHANGED'
        assert after['mongo']['players'] == after['mongo']['roles'] == 0, 'S8_EARLY_DATA'
        for p in after['processes']:
            if p['name'] in PORTS:
                old = next(x for x in before['processes'] if x['name'] == p['name'])
                assert p['status'] == 'online'
                assert {k: v for k, v in p['env'].items() if k not in ROUTE_KEYS} == {k: v for k, v in old['env'].items() if k not in ROUTE_KEYS}
                assert json.loads(p['env']['SERVER_NODE_HTTP_MAP'])['1008'] == 'http://127.0.0.1:8089'
                assert p['env']['WS_PUBLIC_PATH_1008'] == '/ws-s8'
            elif p['name'] not in ['lhs-s1008', 'lhs-real-bots-s8']:
                old = next(x for x in before['processes'] if x['name'] == p['name'])
                assert {k: v for k, v in p.items() if k not in ['pid', 'restarts', 'status']} == {k: v for k, v in old.items() if k not in ['pid', 'restarts', 'status']}, 'OTHER_PROCESS_CHANGED:' + p['name']
        with c.open_sftp() as s:
            for key in ['ecosystem', 'nginx', 'webgm_env']:
                assert file_matches(s, {**files[key], 'sha256': sha(data[key])})
            assert s.open(BOT_PATH, 'rb').read() == data['bot']
        bot_local = ROOT / 'linhhoasu/lhs/newServer/scripts/start-scheduled-bots-s8.js'
        assert not bot_local.exists() or bot_local.read_bytes() == data['bot']
        bot_local.write_bytes(data['bot'])
        result.update(result='DEPLOYED_SCHEDULED', after=after, changes=changed, routes=routes)
        write_receipt('evidence.json', result)
        print(json.dumps(dict(result=result['result'], evidence=str(OUT / 'evidence.json'), backup=backup, qa=result['qa']['result'], ready=len(result['readiness'])), ensure_ascii=False), flush=True)
    except Exception as error:
        result.update(result='FAILED', error=str(error), changes=changed, routes=routes)
        try:
            result['rollback'] = rollback(c, before, changed, routes, backup, created)
            result['result'] = 'ROLLED_BACK'
        except Exception as rollback_error:
            result['rollbackError'] = str(rollback_error)
        write_receipt('evidence.json', result)
        raise


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    action = sys.argv[1] if len(sys.argv) > 1 else 'prepare'
    assert action in ('prepare', 'apply')
    client = common.connect()
    try:
        (prepare if action == 'prepare' else apply)(client)
    finally:
        client.close()
