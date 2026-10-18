"""S4 scheduled launch. Derive candidates from live files; exact CAS and backups."""
import argparse
import hashlib
import json
import shlex
import sys
import time
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

WB = Path(__file__).resolve().parents[1]
APP = '/linhhoasu/lhs/newServer'
BACKUP = '/linhhoasu/_ai_workbench/backups/server4_launch_20260916'
STAGE = '/linhhoasu/_ai_workbench/temp/server4_launch_20260916'
OPEN = 1789552800000
CONFIG = APP + '/ecosystem.config.js'
NGINX = '/www/server/panel/vhost/nginx/game.lhs.conf'
WEBENV = '/linhhoasu/webgame/gm/.env'
NAMES = {CONFIG: 'ecosystem.config.js', NGINX: 'game.lhs.conf', WEBENV: 'webgm.env'}
EXPECTED_CONFIG = '2e36c255b76455f5551bc15ea39197e3e76e21b532b465b518edee85d3d41b0a'


def node(ssh, source):
    return run(ssh, 'node -e ' + shlex.quote(source))


def processes(ssh):
    return json.loads(node(ssh, "const ps=JSON.parse(require('child_process').execSync('pm2 jlist',{encoding:'utf8'}));console.log(JSON.stringify(ps.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time}))));"))


def state(ssh):
    return json.loads(node(ssh, """const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
    (async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();console.log(JSON.stringify({now:Date.now(),
    rows:await c.db('lhs_s1001').collection('gameservers').find({}).sort({serverId:1}).toArray(),
    collections:await c.db('lhs_s1004').listCollections({},{nameOnly:true}).toArray(),
    players:await c.db('lhs_s1004').collection('players').countDocuments({}),
    roles:await c.db('lhs_s1001').collection('accounts').countDocuments({'roles.serverId':1004})}));await c.close()})().catch(e=>{console.error(e.message);process.exit(1)});"""))


def ready(ssh, port):
    for _ in range(20):
        try:
            result = json.loads(run(ssh, f'curl -fsS --max-time 2 http://127.0.0.1:{port}/ready'))
            if result.get('status') == 'ok' and result['checks'] == {'mongo': True, 'redis': True}:
                return result
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError('NOT_READY:' + str(port))


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    ssh = connect()
    changed = []
    try:
        before = state(ssh)
        ps = processes(ssh)
        assert before['now'] < OPEN - 3600000, 'TOO_CLOSE_TO_OPEN'
        assert not any(r['serverId'] == 1004 for r in before['rows']), 'S4_ROW_EXISTS'
        assert not before['collections'] and before['players'] == before['roles'] == 0, 'S4_DATA_EXISTS'
        assert not any(p['name'] in ('lhs-s1004', 'lhs-real-bots-s4') for p in ps), 'S4_PROCESS_EXISTS'
        for port in (8080, 8083, 8084):
            ready(ssh, port)
        listeners = run(ssh, 'ss -lnt')
        assert ':8085 ' not in listeners and ':9203 ' not in listeners, 'S4_PORT_BUSY'
        runtime = json.loads(node(ssh, "const ps=JSON.parse(require('child_process').execSync('pm2 jlist',{encoding:'utf8'}));console.log(JSON.stringify(ps.filter(p=>/^lhs-s100[123]$/.test(p.name)).map(p=>({name:p.name,map:p.pm2_env.SERVER_NODE_HTTP_MAP||'{}'}))));"))
        with ssh.open_sftp() as f:
            baseline = {p: f.open(p, 'rb').read() for p in NAMES}
            stats = {p: f.stat(p) for p in NAMES}
            assert hashlib.sha256(baseline[CONFIG]).hexdigest() == EXPECTED_CONFIG, 'CONFIG_DRIFT'
            auth = f.open(APP + '/src/handlers/serverList.js').read().decode('utf8')
            assert 'lastSelectedServerId' not in auth, 'UNSAFE_SDK_FALLBACK'
            account = f.open(APP + '/src/services/AccountService.js').read().decode('utf8')
            assert 'const targetRoles = (account.roles || [])' in account, 'CROSS_DB_ROLE_GUARD_MISSING'
            # Only append the new routing/process block to the current production config.
            local = (WB.parent / 'linhhoasu/lhs/newServer/ecosystem.config.js').read_text('utf8')
            marker = '// S4_LAUNCH_20260916:'
            assert local.count(marker) == 1 and marker.encode() not in baseline[CONFIG]
            config = baseline[CONFIG].rstrip() + b'\n\n' + local[local.index(marker):].encode('utf8')
            nginx = baseline[NGINX]
            anchor = b'    location /ws-s3 {'
            assert nginx.count(anchor) == 1 and b'/ws-s4' not in nginx
            start = nginx.index(anchor)
            end = nginx.index(b'\n    }', start) + len(b'\n    }')
            block = nginx[start:end].replace(b'/ws-s3', b'/ws-s4').replace(b':9202', b':9203')
            nginx = nginx[:end] + b'\n\n' + block + nginx[end:]
            env = baseline[WEBENV]
            assert env.count(b'LHS_SERVER_COUNT=3') == 1 and b'LHS_SERVER_4_' not in env
            env = env.replace(b'LHS_SERVER_COUNT=3', b'LHS_SERVER_COUNT=4')
            env = env.rstrip() + ('\nLHS_SERVER_4_ID=1004\nLHS_SERVER_4_KEY=1004\nLHS_SERVER_4_NAME=Linh Họa Sư - S4\nLHS_SERVER_4_API_BASE=http://127.0.0.1:8085\n').encode('utf8')
            candidates = {CONFIG: config, NGINX: nginx, WEBENV: env}
            summary = {'openTime': OPEN, 'openLocal': '2026-09-16 17:00:00 +07:00', 'backup': BACKUP,
                       'before': {p: hashlib.sha256(b).hexdigest() for p, b in baseline.items()},
                       'after': {p: hashlib.sha256(b).hexdigest() for p, b in candidates.items()}, 'processesBefore': ps}
            print(json.dumps({'preflight': summary}), flush=True)
            if not args.apply:
                return
            for path in (BACKUP, STAGE, APP + '/scripts/start-scheduled-bots-s4.js'):
                try:
                    f.stat(path)
                    raise RuntimeError('TARGET_ALREADY_EXISTS:' + path)
                except FileNotFoundError:
                    pass
            run(ssh, 'install -d -m 700 ' + BACKUP + ' ' + STAGE)
            for p, data in baseline.items():
                with f.open(BACKUP + '/' + NAMES[p] + '.before', 'wb') as h:
                    h.write(data)
                f.chmod(BACKUP + '/' + NAMES[p] + '.before', 0o600)
            with f.open(BACKUP + '/state.json', 'wb') as h:
                h.write(json.dumps({'state': before, 'processes': ps, 'routing': runtime}).encode())
            f.chmod(BACKUP + '/state.json', 0o600)
            run(ssh, 'cp -p /root/.pm2/dump.pm2 ' + BACKUP + '/dump.pm2.before\nchmod 600 ' + BACKUP + '/dump.pm2.before')
            for p, data in candidates.items():
                staged = STAGE + '/' + NAMES[p]
                with f.open(staged, 'wb') as h:
                    h.write(data)
                f.chmod(staged, stats[p].st_mode & 0o777)
                f.chown(staged, stats[p].st_uid, stats[p].st_gid)
            bot = APP + '/scripts/start-scheduled-bots-s4.js'
            f.put(str(WB.parent / 'linhhoasu/lhs/newServer/scripts/start-scheduled-bots-s4.js'), bot)
            f.chmod(bot, 0o644)
            qa = STAGE + '/qa_server4_launch_20260916.js'
            f.put(str(WB / 'tools/qa_server4_launch_20260916.js'), qa)
            f.chmod(qa, 0o600)
            run(ssh, 'node --check ' + bot + '\nnode --check ' + qa + '\nnode --check ' + STAGE + '/ecosystem.config.js')
            # Evaluate both configs: existing app environments may change only in the three routing keys.
            print(node(ssh, "const assert=require('assert/strict');const before=require('" + CONFIG + "'),after=require('" + STAGE + "/ecosystem.config.js');for(const app of before.apps){const actual=after.apps.find(a=>a.name===app.name);const copy=JSON.parse(JSON.stringify(actual));if(/^lhs-s100[123]$/.test(app.name)){for(const k of ['WS_PUBLIC_PORT_1004','WS_PUBLIC_PATH_1004','SERVER_NODE_HTTP_MAP']){if(k in app.env)copy.env[k]=app.env[k];else delete copy.env[k]}}assert.deepEqual(copy,app)}assert.equal(after.apps.length,before.apps.length+2);console.log('CONFIG_EXISTING_APPS_PRESERVED');"))
            for p in NAMES:
                assert f.open(p, 'rb').read() == baseline[p], 'CAS_DRIFT:' + p
            row = {'serverId': 1004, 'pageId': 1, 'pageName': 'MEGAME365', 'serverName': 'S4',
                   'running': False, 'status': 0, 'isNew': True, 'isRecommend': False,
                   'openTime': OPEN, 'rechargeArea': 1}
            print(node(ssh, "const {MongoClient}=require('" + APP + "/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();await c.db('lhs_s1001').collection('gameservers').insertOne(" + json.dumps(row) + ");await c.close();console.log('S4_PRIVATE_ROW_CREATED')})().catch(e=>{console.error(e.message);process.exit(1)});"), flush=True)
            changed.append('S4 metadata')
            f.posix_rename(STAGE + '/ecosystem.config.js', CONFIG)
            changed.append(CONFIG)
            run(ssh, 'cd ' + APP + ' && pm2 start ecosystem.config.js --only lhs-s1004')
            ready(ssh, 8085)
            f.posix_rename(STAGE + '/game.lhs.conf', NGINX)
            changed.append(NGINX)
            run(ssh, 'nginx -t')
            run(ssh, 'nginx -s reload')
            f.posix_rename(STAGE + '/webgm.env', WEBENV)
            changed.append(WEBENV)
            for item in runtime:
                # Preserve effective runtime flags (some intentionally differ from ecosystem).
                routes = json.loads(item['map'])
                routes['1004'] = 'http://127.0.0.1:8085'
                delta = 'WS_PUBLIC_PORT_1004=81 WS_PUBLIC_PATH_1004=/ws-s4 SERVER_NODE_HTTP_MAP=' + shlex.quote(json.dumps(routes, separators=(',', ':')))
                run(ssh, delta + ' pm2 restart ' + item['name'] + ' --update-env')
                ready(ssh, {'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084}[item['name']])
                print(item['name'] + '_ROUTING_READY', flush=True)
            print(node(ssh, "const {MongoClient}=require('" + APP + "/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const r=await c.db('lhs_s1001').collection('gameservers').updateOne(" + json.dumps(row) + ",{$set:{running:true,status:1}});if(r.matchedCount!==1)throw Error('S4_CAS_FAILED');await c.close();console.log('S4_PUBLISHED_TIME_GATE_ACTIVE')})().catch(e=>{console.error(e.message);process.exit(1)});"), flush=True)
            run(ssh, 'cd ' + APP + ' && pm2 start ecosystem.config.js --only lhs-real-bots-s4')
            qa_output = run(ssh, 'node ' + qa)
            print(qa_output, flush=True)
            after_ps = processes(ssh)
            for item in ps:
                actual = next(p for p in after_ps if p['name'] == item['name'])
                if item['name'] in ('lhs-s1001', 'lhs-s1002', 'lhs-s1003'):
                    assert actual['restarts'] == item['restarts'] + 1 and actual['status'] == 'online', 'RESTART_DRIFT'
                else:
                    assert actual == item, 'UNRELATED_PROCESS_CHANGED'
            final = state(ssh)
            assert [r for r in final['rows'] if r['serverId'] != 1004] == before['rows'], 'OLD_ROWS_CHANGED'
            assert final['players'] == final['roles'] == 0, 'EARLY_S4_ROLE'
            for p, candidate in candidates.items():
                assert f.open(p, 'rb').read() == candidate, 'FINAL_HASH_MISMATCH'
            run(ssh, 'pm2 save')
            summary.update(result='DEPLOYED_SCHEDULED', processesAfter=after_ps, s4Players=0, s4Roles=0, qa=qa_output)
            with f.open(STAGE + '/evidence.json', 'wb') as h:
                h.write(json.dumps(summary, indent=2).encode())
            f.chmod(STAGE + '/evidence.json', 0o600)
            local_evidence = WB / 'temp/server4_launch_20260916/evidence.json'
            local_evidence.parent.mkdir(parents=True, exist_ok=True)
            f.get(STAGE + '/evidence.json', str(local_evidence))
            print(json.dumps(summary), flush=True)
    except Exception:
        print(json.dumps({'stopped': True, 'changed': changed, 'backup': BACKUP,
                          'rollback': 'Make only S4 private; stop only lhs-s1004/lhs-real-bots-s4; CAS-restore changed config/nginx/env backups and original routing env from state.json. Validate nginx and readiness. Never delete player data.'}), flush=True)
        raise
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
