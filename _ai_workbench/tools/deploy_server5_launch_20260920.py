"""Create S5 and schedule its production opening for 10:00 Asia/Bangkok today."""
import argparse
import hashlib
import json
import os
import shlex
import stat
import sys
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

WB = Path(__file__).resolve().parents[1]
APP = '/linhhoasu/lhs/newServer'
CONFIG = APP + '/ecosystem.config.js'
NGINX = '/www/server/panel/vhost/nginx/game.lhs.conf'
WEBENV = '/linhhoasu/webgame/gm/.env'
BOT_LOCAL = WB.parent / 'linhhoasu/lhs/newServer/scripts/start-scheduled-bots-s5.js'
BOT_REMOTE = APP + '/scripts/start-scheduled-bots-s5.js'
BACKUP = '/linhhoasu/_ai_workbench/backups/server5_launch_20260920'
STAGE = '/linhhoasu/_ai_workbench/temp/server5_launch_20260920'
OPEN = 1789873200000  # 2026-09-20 10:00:00 Asia/Bangkok
NAMES = {CONFIG: 'ecosystem.config.js', NGINX: 'game.lhs.conf', WEBENV: 'webgm.env'}

S5_BLOCK = r'''
// S5_LAUNCH_20260920: 10:00 Asia/Bangkok; gameplay isolated from S1-S4.
const server5OpenTime = 1789873200000;
for (const app of module.exports.apps.filter(app => /^lhs-s100[1-4]$/.test(app.name))) {
  app.env.WS_PUBLIC_PORT_1005 = 81;
  app.env.WS_PUBLIC_PATH_1005 = '/ws-s5';
  const routes = JSON.parse(app.env.SERVER_NODE_HTTP_MAP || '{}');
  routes['1005'] = 'http://127.0.0.1:8086';
  app.env.SERVER_NODE_HTTP_MAP = JSON.stringify(routes);
}
const server5Template = module.exports.apps.find(app => app.name === 'lhs-s1004');
const server5BotTemplate = module.exports.apps.find(app => app.name === 'lhs-real-bots-s4');
if (!server5Template || !server5BotTemplate) throw new Error('S5_TEMPLATES_MISSING');
module.exports.apps.push({
  ...server5Template,
  name: 'lhs-s1005',
  env: {
    ...server5Template.env,
    SERVER_ID: 1005,
    DEFAULT_SERVER_ID: 1005,
    SERVER_NAME: 'S5',
    SERVER_OPEN_TIME: server5OpenTime,
    WS_PORT: 9204,
    HTTP_PORT: 8086,
    WS_PUBLIC_PATH: '/ws-s5',
    WS_PUBLIC_PORT_1005: 81,
    WS_PUBLIC_PATH_1005: '/ws-s5',
    SERVER_NODE_HTTP_MAP: '{"1001":"http://127.0.0.1:8080","1002":"http://127.0.0.1:8083","1003":"http://127.0.0.1:8084","1004":"http://127.0.0.1:8085"}',
    MONGO_URI: 'mongodb://localhost:27017/lhs_s1005',
    REDIS_PREFIX: 's1005:',
    IDENTITY_MONGO_DB: 'lhs_s1001',
    AUTH_REDIS_PREFIX: 's1001:',
    ARENA_SETTLEMENT_ENABLED: '0',
    ARENA_SETTLEMENT_APPROVED: '0',
    ARENA_SETTLEMENT_ACTIVATION_AT: server5OpenTime,
    EVENT_SETTLEMENT_ACTIVATION_AT: server5OpenTime,
  },
}, {
  ...server5BotTemplate,
  name: 'lhs-real-bots-s5',
  script: 'scripts/start-scheduled-bots-s5.js',
  env: {
    ...server5BotTemplate.env,
    SERVER_OPEN_TIME: server5OpenTime,
    BOT_WORKER_SERVER_ID: 1005,
    BOT_WORKER_WS_URL: 'ws://127.0.0.1:9204',
    BOT_WORKER_ACTIVITY_URL: 'http://127.0.0.1:9204/bot-activity',
  },
});
'''


def node(ssh, source):
    return run(ssh, 'node -e ' + shlex.quote(source))


def processes(ssh):
    js = """const ps=JSON.parse(require('child_process').execSync('pm2 jlist',{encoding:'utf8'}));
console.log(JSON.stringify(ps.filter(p=>/^lhs-(s100[1-5]|real-bots-s[1-5])$/.test(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,env:{SERVER_ID:p.pm2_env.env.SERVER_ID,HTTP_PORT:p.pm2_env.env.HTTP_PORT,WS_PORT:p.pm2_env.env.WS_PORT,SERVER_OPEN_TIME:p.pm2_env.env.SERVER_OPEN_TIME,SERVER_NODE_HTTP_MAP:p.pm2_env.env.SERVER_NODE_HTTP_MAP}}))));"""
    return json.loads(node(ssh, js))


def state(ssh):
    js = r"""const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();
const admin=c.db('admin');const dbs=await admin.admin().listDatabases();
const identity=c.db('lhs_s1001');const rows=await identity.collection('gameservers').find({}).sort({serverId:1}).toArray();
const s5=c.db('lhs_s1005');let players=0,collections=[];if(dbs.databases.some(x=>x.name==='lhs_s1005')){collections=await s5.listCollections({},{nameOnly:true}).toArray();players=await s5.collection('players').countDocuments({});}
const roles=await identity.collection('accounts').countDocuments({'roles.serverId':1005});
console.log(JSON.stringify({now:Date.now(),rows,dbs:dbs.databases.filter(x=>/^lhs_s100[1-5]$/.test(x.name)).map(x=>x.name),collections,players,roles}));await c.close()})().catch(e=>{console.error(e.message);process.exit(1)});"""
    return json.loads(node(ssh, js))


def ready(ssh, port):
    last = None
    for _ in range(20):
        try:
            result = json.loads(run(ssh, f'curl -fsS --max-time 5 http://127.0.0.1:{port}/ready'))
            last = result
            if result.get('status') == 'ok' and result.get('checks') == {'mongo': True, 'redis': True}:
                return result
        except Exception as error:
            last = str(error)
            import time
            time.sleep(1)
            continue
        import time
        time.sleep(1)
    raise RuntimeError('NOT_READY:' + str(port) + ':' + json.dumps(last, ensure_ascii=False))


def read_files(ssh):
    with ssh.open_sftp() as sftp:
        data = {p: sftp.open(p, 'rb').read() for p in NAMES}
        attrs = {p: sftp.stat(p) for p in NAMES}
    return data, attrs


def make_candidates(baseline):
    config = baseline[CONFIG]
    if b'S5_LAUNCH_20260920' in config or b"name: 'lhs-s1005'" in config:
        raise RuntimeError('S5_CONFIG_ALREADY_PRESENT')
    if b"name: 'lhs-s1004'" not in config:
        raise RuntimeError('S4_CONFIG_TEMPLATE_MISSING')
    config = config.rstrip() + b'\n' + S5_BLOCK.encode('utf-8') + b'\n'

    nginx = baseline[NGINX]
    if b'/ws-s5' in nginx:
        raise RuntimeError('S5_NGINX_ALREADY_PRESENT')
    anchor = b'    location /ws-s4 {'
    start = nginx.find(anchor)
    if start < 0:
        raise RuntimeError('S4_NGINX_TEMPLATE_MISSING')
    end = nginx.find(b'\n    }', start)
    if end < 0:
        raise RuntimeError('S4_NGINX_BLOCK_INVALID')
    end += len(b'\n    }')
    block = nginx[start:end].replace(b'/ws-s4', b'/ws-s5').replace(b':9203', b':9204')
    nginx = nginx[:end] + b'\n\n' + block + nginx[end:]

    env = baseline[WEBENV]
    if b'LHS_SERVER_5_ID=' in env or b'LHS_SERVER_5_API_BASE=' in env:
        raise RuntimeError('S5_WEBGM_ALREADY_PRESENT')
    if env.count(b'LHS_SERVER_COUNT=4') != 1:
        raise RuntimeError('WEBGM_SERVER_COUNT_NOT_FOUR')
    env = env.replace(b'LHS_SERVER_COUNT=4', b'LHS_SERVER_COUNT=5', 1).rstrip()
    env += ('\nLHS_SERVER_5_ID=1005\nLHS_SERVER_5_KEY=1005\n'
            'LHS_SERVER_5_NAME=Linh Họa Sư - S5\n'
            'LHS_SERVER_5_API_BASE=http://127.0.0.1:8086\n').encode('utf-8')
    return {CONFIG: config, NGINX: nginx, WEBENV: env}


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not BOT_LOCAL.exists():
        raise RuntimeError('LOCAL_S5_BOT_MISSING')
    ssh = connect()
    changed = []
    try:
        before = state(ssh)
        ps = processes(ssh)
        if before['now'] >= OPEN:
            raise RuntimeError('OPEN_TIME_ALREADY_PASSED')
        if any(r['serverId'] == 1005 for r in before['rows']):
            raise RuntimeError('S5_ROW_EXISTS')
        if before['collections'] or before['players'] or before['roles']:
            raise RuntimeError('S5_DATA_EXISTS')
        if any(p['name'] in ('lhs-s1005', 'lhs-real-bots-s5') for p in ps):
            raise RuntimeError('S5_PROCESS_EXISTS')
        listeners = run(ssh, 'ss -lnt')
        if ':8086 ' in listeners or ':9204 ' in listeners:
            raise RuntimeError('S5_PORT_BUSY')
        for port in (8080, 8083, 8084, 8085):
            ready(ssh, port)
        baseline, attrs = read_files(ssh)
        candidates = make_candidates(baseline)
        with ssh.open_sftp() as sftp:
            for path in (BACKUP, STAGE):
                try:
                    sftp.stat(path)
                    raise RuntimeError('TARGET_ALREADY_EXISTS:' + path)
                except FileNotFoundError:
                    pass
        summary = {
            'openTime': OPEN, 'openLocal': '2026-09-20 10:00:00 +07:00',
            'serverId': 1005, 'httpPort': 8086, 'wsPort': 9204,
            'backup': BACKUP, 'before': before, 'processesBefore': ps,
            'hashBefore': {p: hashlib.sha256(v).hexdigest() for p, v in baseline.items()},
            'hashAfter': {p: hashlib.sha256(v).hexdigest() for p, v in candidates.items()},
            'apply': args.apply,
        }
        print(json.dumps({'preflight': summary}, ensure_ascii=False), flush=True)
        if not args.apply:
            return

        with ssh.open_sftp() as sftp:
            run(ssh, 'install -d -m 700 ' + BACKUP + ' ' + STAGE)
            for path, data in baseline.items():
                dest = BACKUP + '/' + NAMES[path] + '.before'
                with sftp.open(dest, 'wb') as handle:
                    handle.write(data)
                sftp.chmod(dest, stat.S_IMODE(attrs[path].st_mode) if attrs[path].st_mode else 0o600)
            with sftp.open(BACKUP + '/state.json', 'wb') as handle:
                handle.write(json.dumps({'state': before, 'processes': ps}, ensure_ascii=False).encode())
            sftp.chmod(BACKUP + '/state.json', 0o600)
            run(ssh, 'cp -p /root/.pm2/dump.pm2 ' + BACKUP + '/dump.pm2.before && chmod 600 ' + BACKUP + '/dump.pm2.before')
            for path, data in candidates.items():
                staged = STAGE + '/' + NAMES[path]
                with sftp.open(staged, 'wb') as handle:
                    handle.write(data)
                sftp.chmod(staged, stat.S_IMODE(attrs[path].st_mode))
                sftp.chown(staged, attrs[path].st_uid, attrs[path].st_gid)
            staged_bot = STAGE + '/start-scheduled-bots-s5.js'
            with open(BOT_LOCAL, 'rb') as handle:
                bot_data = handle.read()
            with sftp.open(staged_bot, 'wb') as handle:
                handle.write(bot_data)
            sftp.chmod(staged_bot, 0o644)
            sftp.chown(staged_bot, 0, 0)
            with sftp.open(BACKUP + '/start-scheduled-bots-s5.js.before', 'wb') as handle:
                handle.write(b'ABSENT_BEFORE_S5\n')
            sftp.chmod(BACKUP + '/start-scheduled-bots-s5.js.before', 0o600)

            run(ssh, 'node --check ' + STAGE + '/ecosystem.config.js && node --check ' + STAGE + '/start-scheduled-bots-s5.js')
            for path in NAMES:
                if sftp.open(path, 'rb').read() != baseline[path]:
                    raise RuntimeError('CAS_DRIFT:' + path)
            row = {'serverId': 1005, 'pageId': 1, 'pageName': 'MEGAME365', 'serverName': 'S5',
                   'running': False, 'status': 0, 'isNew': True, 'isRecommend': False,
                   'openTime': OPEN, 'rechargeArea': 1}
            insert = "const {MongoClient}=require('" + APP + "/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const r=" + json.dumps(row, ensure_ascii=False) + ";const x=await c.db('lhs_s1001').collection('gameservers').insertOne(r);console.log(JSON.stringify({id:String(x.insertedId)}));await c.close()})().catch(e=>{console.error(e.message);process.exit(1)});"
            print('METADATA', node(ssh, insert).strip(), flush=True)
            changed.append('S5 metadata')
            sftp.posix_rename(STAGE + '/ecosystem.config.js', CONFIG)
            changed.append(CONFIG)
            sftp.posix_rename(STAGE + '/start-scheduled-bots-s5.js', BOT_REMOTE)
            changed.append(BOT_REMOTE)

        run(ssh, 'cd ' + APP + ' && pm2 start ecosystem.config.js --only lhs-s1005')
        changed.append('lhs-s1005 start')
        ready(ssh, 8086)

        with ssh.open_sftp() as sftp:
            sftp.posix_rename(STAGE + '/game.lhs.conf', NGINX)
            changed.append(NGINX)
            sftp.posix_rename(STAGE + '/webgm.env', WEBENV)
            changed.append(WEBENV)
        run(ssh, 'nginx -t && nginx -s reload')

        # Preserve each node's effective runtime flags while adding only S5 routing.
        for item in ps:
            if not item['name'].startswith('lhs-s100') or item['name'] == 'lhs-s1005':
                continue
            routes = json.loads(item['env'].get('SERVER_NODE_HTTP_MAP') or '{}')
            routes['1005'] = 'http://127.0.0.1:8086'
            delta = 'WS_PUBLIC_PORT_1005=81 WS_PUBLIC_PATH_1005=/ws-s5 SERVER_NODE_HTTP_MAP=' + shlex.quote(json.dumps(routes, separators=(',', ':')))
            run(ssh, delta + ' pm2 restart ' + item['name'] + ' --update-env')
            ready(ssh, {'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085}[item['name']])
            print(item['name'] + '_S5_ROUTING_READY', flush=True)

        publish = "const {MongoClient}=require('" + APP + "/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const q=" + json.dumps(row, ensure_ascii=False) + ";const x=await c.db('lhs_s1001').collection('gameservers').updateOne(q,{$set:{running:true,status:1}});if(x.matchedCount!==1)throw Error('S5_CAS_PUBLISH_FAILED');await c.close();console.log('S5_PUBLISHED_TIME_GATE_ACTIVE')})().catch(e=>{console.error(e.message);process.exit(1)});"
        print(node(ssh, publish).strip(), flush=True)
        changed.append('S5 published')
        run(ssh, 'cd ' + APP + ' && pm2 start ecosystem.config.js --only lhs-real-bots-s5')
        changed.append('lhs-real-bots-s5 start')

        after = state(ssh)
        after_ps = processes(ssh)
        assert any(r['serverId'] == 1005 and r['running'] is True and r['status'] == 1 and r['openTime'] == OPEN for r in after['rows']), 'S5_ROW_NOT_PUBLISHED'
        assert after['players'] == after['roles'] == 0, 'S5_EARLY_ROLE'
        for item in ps:
            if not item['name'].startswith('lhs-s100') or item['name'] == 'lhs-s1005':
                continue
            actual = next(p for p in after_ps if p['name'] == item['name'])
            assert actual['status'] == 'online' and actual['restarts'] == item['restarts'] + 1, 'RESTART_DRIFT:' + item['name']
        assert next(p for p in after_ps if p['name'] == 'lhs-s1005')['status'] == 'online', 'S5_NOT_ONLINE'
        assert next(p for p in after_ps if p['name'] == 'lhs-real-bots-s5')['status'] == 'online', 'S5_BOTS_NOT_ONLINE'
        with ssh.open_sftp() as sftp:
            for path, data in candidates.items():
                if sftp.open(path, 'rb').read() != data:
                    raise RuntimeError('FINAL_HASH_MISMATCH:' + path)
        run(ssh, 'pm2 save')
        summary.update(result='DEPLOYED_SCHEDULED', after=after, processesAfter=after_ps,
                       changed=changed, botGate='waiting_until_open')
        with ssh.open_sftp() as sftp:
            with sftp.open(STAGE + '/evidence.json', 'wb') as handle:
                handle.write(json.dumps(summary, ensure_ascii=False, indent=2).encode())
            sftp.chmod(STAGE + '/evidence.json', 0o600)
            local_evidence = WB / 'temp/server5_launch_20260920/evidence.json'
            local_evidence.parent.mkdir(parents=True, exist_ok=True)
            sftp.get(STAGE + '/evidence.json', str(local_evidence))
        print(json.dumps(summary, ensure_ascii=False), flush=True)
    except Exception:
        print(json.dumps({'stopped': True, 'changed': changed, 'backup': BACKUP,
                          'rollback': 'CAS-restore only the S5 metadata/config/nginx/env changes after inspecting the evidence; stop only lhs-s1005/lhs-real-bots-s5; never delete player data.'}, ensure_ascii=False), flush=True)
        raise
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
