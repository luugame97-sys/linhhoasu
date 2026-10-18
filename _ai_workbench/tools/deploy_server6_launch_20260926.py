"""Create S6 and schedule its production opening for 19:00 Asia/Bangkok today."""
import hashlib
import json
import shlex
import stat
import sys
import time
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

WB = Path(__file__).resolve().parents[1]
APP = '/linhhoasu/lhs/newServer'
CONFIG = APP + '/ecosystem.config.js'
NGINX = '/www/server/panel/vhost/nginx/game.lhs.conf'
WEBENV = '/linhhoasu/webgame/gm/.env'
BOT_LOCAL = WB.parent / 'linhhoasu/lhs/newServer/scripts/start-scheduled-bots-s6.js'
BOT_REMOTE = APP + '/scripts/start-scheduled-bots-s6.js'
BACKUP = '/linhhoasu/_ai_workbench/backups/server6_launch_20260926'
STAGE = '/linhhoasu/_ai_workbench/temp/server6_launch_20260926'
OPEN = 1790424000000  # 2026-09-26 19:00:00 Asia/Bangkok
SID = 1006
NAMES = {CONFIG: 'ecosystem.config.js', NGINX: 'game.lhs.conf', WEBENV: 'webgm.env'}

S6_BLOCK = r'''
// S6_LAUNCH_20260926: 19:00 Asia/Bangkok; gameplay isolated from S1-S5.
const server6OpenTime = 1790424000000;
for (const app of module.exports.apps.filter(app => /^lhs-s100[1-5]$/.test(app.name))) {
  app.env.WS_PUBLIC_PORT_1006 = 81;
  app.env.WS_PUBLIC_PATH_1006 = '/ws-s6';
  const routes = JSON.parse(app.env.SERVER_NODE_HTTP_MAP || '{}');
  routes['1006'] = 'http://127.0.0.1:8087';
  app.env.SERVER_NODE_HTTP_MAP = JSON.stringify(routes);
}
const server6Template = module.exports.apps.find(app => app.name === 'lhs-s1004');
const server6BotTemplate = module.exports.apps.find(app => app.name === 'lhs-real-bots-s4');
if (!server6Template || !server6BotTemplate) throw new Error('S6_TEMPLATES_MISSING');
module.exports.apps.push({
  ...server6Template,
  name: 'lhs-s1006',
  env: {
    ...server6Template.env,
    SERVER_ID: 1006,
    DEFAULT_SERVER_ID: 1006,
    SERVER_NAME: 'S6',
    SERVER_OPEN_TIME: server6OpenTime,
    WS_PORT: 9205,
    HTTP_PORT: 8087,
    WS_PUBLIC_PATH: '/ws-s6',
    WS_PUBLIC_PORT_1006: 81,
    WS_PUBLIC_PATH_1006: '/ws-s6',
    SERVER_NODE_HTTP_MAP: '{"1001":"http://127.0.0.1:8080","1002":"http://127.0.0.1:8083","1003":"http://127.0.0.1:8084","1004":"http://127.0.0.1:8085","1005":"http://127.0.0.1:8086"}',
    MONGO_URI: 'mongodb://localhost:27017/lhs_s1006',
    REDIS_PREFIX: 's1006:',
    IDENTITY_MONGO_DB: 'lhs_s1001',
    AUTH_REDIS_PREFIX: 's1001:',
    ARENA_SETTLEMENT_ENABLED: '0',
    ARENA_SETTLEMENT_APPROVED: '0',
    ARENA_SETTLEMENT_ACTIVATION_AT: server6OpenTime,
    EVENT_SETTLEMENT_ACTIVATION_AT: server6OpenTime,
  },
}, {
  ...server6BotTemplate,
  name: 'lhs-real-bots-s6',
  script: 'scripts/start-scheduled-bots-s6.js',
  env: {
    ...server6BotTemplate.env,
    SERVER_OPEN_TIME: server6OpenTime,
    BOT_WORKER_SERVER_ID: 1006,
    BOT_WORKER_WS_URL: 'ws://127.0.0.1:9205',
    BOT_WORKER_ACTIVITY_URL: 'http://127.0.0.1:9205/bot-activity',
  },
});
'''


def node(ssh, source):
    return run(ssh, 'node -e ' + shlex.quote(source))


def processes(ssh):
    rows = json.loads(run(ssh, 'pm2 jlist'))
    wanted = {'lhs-s1001', 'lhs-s1002', 'lhs-s1003', 'lhs-s1004', 'lhs-s1005',
              'lhs-s1006', 'lhs-real-bots-s5', 'lhs-real-bots-s6'}
    out = []
    for item in rows:
        if item.get('name') not in wanted:
            continue
        env = (item.get('pm2_env') or {}).get('env') or {}
        out.append({
            'name': item.get('name'), 'pid': item.get('pid'),
            'status': (item.get('pm2_env') or {}).get('status'),
            'restarts': (item.get('pm2_env') or {}).get('restart_time'),
            'env': {key: env.get(key) for key in (
                'SERVER_ID', 'HTTP_PORT', 'WS_PORT', 'SERVER_OPEN_TIME', 'SERVER_NODE_HTTP_MAP')},
        })
    return out


def state(ssh):
    js = r"""const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();
const admin=c.db('admin');const dbs=await admin.admin().listDatabases();
const identity=c.db('lhs_s1001');const rows=await identity.collection('gameservers').find({}).sort({serverId:1}).toArray();
const s6=c.db('lhs_s1006');let players=0,collections=[];
if(dbs.databases.some(x=>x.name==='lhs_s1006')){collections=await s6.listCollections({},{nameOnly:true}).toArray();players=await s6.collection('players').countDocuments({});}
const roles=await identity.collection('accounts').countDocuments({'roles.serverId':1006});
console.log(JSON.stringify({now:Date.now(),rows,dbs:dbs.databases.filter(x=>/^lhs_s100[1-6]$/.test(x.name)).map(x=>x.name),collections,players,roles}));
await c.close()})().catch(e=>{console.error(e.message);process.exit(1)});"""
    return json.loads(node(ssh, js))


def ready(ssh, port):
    last = None
    for _ in range(30):
        try:
            result = json.loads(run(ssh, f'curl -fsS --max-time 5 http://127.0.0.1:{port}/ready'))
            last = result
            if result.get('status') == 'ok' and result.get('checks') == {'mongo': True, 'redis': True}:
                return result
        except Exception as error:
            last = str(error)
        time.sleep(1)
    raise RuntimeError('NOT_READY:' + str(port) + ':' + json.dumps(last, ensure_ascii=False))


def read_files(ssh):
    with ssh.open_sftp() as sftp:
        data = {path: sftp.open(path, 'rb').read() for path in NAMES}
        attrs = {path: sftp.stat(path) for path in NAMES}
    return data, attrs


def make_candidates(baseline):
    config = baseline[CONFIG]
    if b'S6_LAUNCH_20260926' in config or b"name: 'lhs-s1006'" in config:
        raise RuntimeError('S6_CONFIG_ALREADY_PRESENT')
    if b"name: 'lhs-s1004'" not in config or b"name: 'lhs-real-bots-s4'" not in config:
        raise RuntimeError('S4_CONFIG_TEMPLATE_MISSING')
    config = config.rstrip() + b'\n' + S6_BLOCK.encode('utf-8') + b'\n'

    nginx = baseline[NGINX]
    if b'/ws-s6' in nginx:
        raise RuntimeError('S6_NGINX_ALREADY_PRESENT')
    anchor = b'    location /ws-s5 {'
    start = nginx.find(anchor)
    if start < 0:
        raise RuntimeError('S5_NGINX_TEMPLATE_MISSING')
    end = nginx.find(b'\n    }', start)
    if end < 0:
        raise RuntimeError('S5_NGINX_BLOCK_INVALID')
    end += len(b'\n    }')
    block = nginx[start:end].replace(b'/ws-s5', b'/ws-s6').replace(b':9204', b':9205')
    nginx = nginx[:end] + b'\n\n' + block + nginx[end:]

    env = baseline[WEBENV]
    if b'LHS_SERVER_6_ID=' in env or b'LHS_SERVER_6_API_BASE=' in env:
        raise RuntimeError('S6_WEBGM_ALREADY_PRESENT')
    if env.count(b'LHS_SERVER_COUNT=5') != 1:
        raise RuntimeError('WEBGM_SERVER_COUNT_NOT_FIVE')
    env = env.replace(b'LHS_SERVER_COUNT=5', b'LHS_SERVER_COUNT=6', 1).rstrip()
    env += ('\nLHS_SERVER_6_ID=1006\nLHS_SERVER_6_KEY=1006\n'
            'LHS_SERVER_6_NAME=Linh Họa Sư - S6\n'
            'LHS_SERVER_6_API_BASE=http://127.0.0.1:8087\n').encode('utf-8')
    return {CONFIG: config, NGINX: nginx, WEBENV: env}


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    apply = '--apply' in sys.argv[1:]
    if not BOT_LOCAL.exists():
        raise RuntimeError('LOCAL_S6_BOT_MISSING')
    ssh = connect()
    changed = []
    try:
        before = state(ssh)
        ps = processes(ssh)
        if before['now'] >= OPEN:
            raise RuntimeError('OPEN_TIME_ALREADY_PASSED')
        if any(int(row.get('serverId', 0)) == SID for row in before['rows']):
            raise RuntimeError('S6_ROW_EXISTS')
        if before['collections'] or before['players'] or before['roles']:
            raise RuntimeError('S6_DATA_EXISTS')
        if any(item['name'] in ('lhs-s1006', 'lhs-real-bots-s6') for item in ps):
            raise RuntimeError('S6_PROCESS_EXISTS')
        listeners = run(ssh, 'ss -lnt')
        if ':8087 ' in listeners or ':9205 ' in listeners:
            raise RuntimeError('S6_PORT_BUSY')
        ports = {'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084,
                 'lhs-s1004': 8085, 'lhs-s1005': 8086}
        for port in ports.values():
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
            'openTime': OPEN, 'openLocal': '2026-09-26 19:00:00 +07:00',
            'serverId': SID, 'httpPort': 8087, 'wsPort': 9205,
            'backup': BACKUP, 'before': before, 'processesBefore': ps,
            'hashBefore': {path: hashlib.sha256(data).hexdigest() for path, data in baseline.items()},
            'hashAfter': {path: hashlib.sha256(data).hexdigest() for path, data in candidates.items()},
            'apply': apply,
        }
        print(json.dumps({'preflight': summary}, ensure_ascii=False), flush=True)
        if not apply:
            return

        with ssh.open_sftp() as sftp:
            run(ssh, 'install -d -m 700 ' + BACKUP + ' ' + STAGE)
            for path, data in baseline.items():
                dest = BACKUP + '/' + NAMES[path] + '.before'
                with sftp.open(dest, 'wb') as handle:
                    handle.write(data)
                sftp.chmod(dest, stat.S_IMODE(attrs[path].st_mode) or 0o600)
            with sftp.open(BACKUP + '/state.json', 'wb') as handle:
                handle.write(json.dumps({'state': before, 'processes': ps}, ensure_ascii=False).encode())
            sftp.chmod(BACKUP + '/state.json', 0o600)
            run(ssh, 'cp -p /root/.pm2/dump.pm2 ' + BACKUP + '/dump.pm2.before && chmod 600 ' + BACKUP + '/dump.pm2.before')
            for path, data in candidates.items():
                staged = STAGE + '/' + NAMES[path]
                with sftp.open(staged, 'wb') as handle:
                    handle.write(data)
                sftp.chmod(staged, stat.S_IMODE(attrs[path].st_mode) or 0o600)
                sftp.chown(staged, attrs[path].st_uid, attrs[path].st_gid)
            with BOT_LOCAL.open('rb') as handle:
                bot_data = handle.read()
            staged_bot = STAGE + '/start-scheduled-bots-s6.js'
            with sftp.open(staged_bot, 'wb') as handle:
                handle.write(bot_data)
            sftp.chmod(staged_bot, 0o644)
            sftp.chown(staged_bot, 0, 0)
            with sftp.open(BACKUP + '/start-scheduled-bots-s6.js.before', 'wb') as handle:
                handle.write(b'ABSENT_BEFORE_S6\n')
            sftp.chmod(BACKUP + '/start-scheduled-bots-s6.js.before', 0o600)

            run(ssh, 'node --check ' + STAGE + '/ecosystem.config.js && node --check ' + STAGE + '/start-scheduled-bots-s6.js')
            for path in NAMES:
                if sftp.open(path, 'rb').read() != baseline[path]:
                    raise RuntimeError('CAS_DRIFT:' + path)
            row = {'serverId': SID, 'pageId': 1, 'pageName': 'MEGAME365', 'serverName': 'S6',
                   'running': False, 'status': 0, 'isNew': True, 'isRecommend': False,
                   'openTime': OPEN, 'rechargeArea': 1}
            insert = "const {MongoClient}=require('" + APP + "/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const r=" + json.dumps(row, ensure_ascii=False) + ";const x=await c.db('lhs_s1001').collection('gameservers').insertOne(r);console.log(JSON.stringify({id:String(x.insertedId)}));await c.close()})().catch(e=>{console.error(e.message);process.exit(1)});"
            print('METADATA', node(ssh, insert).strip(), flush=True)
            changed.append('S6 metadata')
            sftp.posix_rename(STAGE + '/ecosystem.config.js', CONFIG)
            changed.append(CONFIG)
            sftp.posix_rename(STAGE + '/start-scheduled-bots-s6.js', BOT_REMOTE)
            changed.append(BOT_REMOTE)

        run(ssh, 'cd ' + APP + ' && pm2 start ecosystem.config.js --only lhs-s1006')
        changed.append('lhs-s1006 start')
        ready(ssh, 8087)

        with ssh.open_sftp() as sftp:
            sftp.posix_rename(STAGE + '/game.lhs.conf', NGINX)
            changed.append(NGINX)
            sftp.posix_rename(STAGE + '/webgm.env', WEBENV)
            changed.append(WEBENV)
        run(ssh, 'nginx -t && nginx -s reload')

        for item in ps:
            name = item['name']
            if name not in ports:
                continue
            routes = json.loads(item['env'].get('SERVER_NODE_HTTP_MAP') or '{}')
            routes['1006'] = 'http://127.0.0.1:8087'
            delta = ('WS_PUBLIC_PORT_1006=81 WS_PUBLIC_PATH_1006=/ws-s6 '
                     'SERVER_NODE_HTTP_MAP=' + shlex.quote(json.dumps(routes, separators=(',', ':'))))
            run(ssh, delta + ' pm2 restart ' + name + ' --update-env')
            ready(ssh, ports[name])
            print(name + '_S6_ROUTING_READY', flush=True)

        publish = "const {MongoClient}=require('" + APP + "/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const q=" + json.dumps({'serverId': SID, 'running': False, 'status': 0, 'openTime': OPEN}, ensure_ascii=False) + ";const x=await c.db('lhs_s1001').collection('gameservers').updateOne(q,{$set:{running:true,status:1}});if(x.matchedCount!==1)throw Error('S6_CAS_PUBLISH_FAILED');await c.close();console.log('S6_PUBLISHED_TIME_GATE_ACTIVE')})().catch(e=>{console.error(e.message);process.exit(1)});"
        print(node(ssh, publish).strip(), flush=True)
        changed.append('S6 published')
        run(ssh, 'cd ' + APP + ' && pm2 start ecosystem.config.js --only lhs-real-bots-s6')
        changed.append('lhs-real-bots-s6 start')

        after = state(ssh)
        after_ps = processes(ssh)
        row_after = next((row for row in after['rows'] if int(row.get('serverId', 0)) == SID), None)
        if not row_after or not (row_after.get('running') is True and row_after.get('status') == 1
                                 and row_after.get('openTime') == OPEN):
            raise AssertionError('S6_ROW_NOT_PUBLISHED')
        if after['players'] != after['roles'] or after['players'] != 0:
            raise AssertionError('S6_EARLY_ROLE')
        for name, port in ports.items():
            actual = next((item for item in after_ps if item['name'] == name), None)
            if not actual or actual['status'] != 'online':
                raise AssertionError('NODE_NOT_ONLINE:' + name)
            if '1006' not in (actual['env'].get('SERVER_NODE_HTTP_MAP') or ''):
                raise AssertionError('S6_ROUTE_MISSING:' + name)
        s6_proc = next((item for item in after_ps if item['name'] == 'lhs-s1006'), None)
        bot_proc = next((item for item in after_ps if item['name'] == 'lhs-real-bots-s6'), None)
        if not s6_proc or s6_proc['status'] != 'online' or not bot_proc or bot_proc['status'] != 'online':
            raise AssertionError('S6_PROCESS_NOT_ONLINE')
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
            local_evidence = WB / 'temp/server6_launch_20260926/evidence.json'
            local_evidence.parent.mkdir(parents=True, exist_ok=True)
            sftp.get(STAGE + '/evidence.json', str(local_evidence))
        print(json.dumps(summary, ensure_ascii=False), flush=True)
    except Exception:
        print(json.dumps({'stopped': True, 'changed': changed, 'backup': BACKUP,
                          'rollback': 'CAS-restore only the S6 metadata/config/nginx/env changes after inspecting evidence; stop only lhs-s1006/lhs-real-bots-s6; never delete player data.'}, ensure_ascii=False), flush=True)
        raise
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
