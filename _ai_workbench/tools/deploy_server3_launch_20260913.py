"""Narrow S3 launch deployment; exact backups, CAS and no S2/bot restarts."""
import argparse
import hashlib
import json
import shlex
import time
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

WB = Path(__file__).resolve().parents[1]
APP = '/linhhoasu/lhs/newServer'
BACKUP = '/linhhoasu/_ai_workbench/backups/server3_launch_20260913'
STAGE = '/linhhoasu/_ai_workbench/temp/server3_launch_20260913'
OPEN = 1789268400000
CONFIG = APP + '/ecosystem.config.js'
NGINX = '/www/server/panel/vhost/nginx/game.lhs.conf'
WEBENV = '/linhhoasu/webgame/gm/.env'
EXPECTED_CONFIG = 'a32d02db0a9221f17e92a5e2a28b4549af7b1c72bb52886827ef0dab6cbbf92b'


def node(ssh, source):
    return run(ssh, 'node -e ' + shlex.quote(source))


def processes(ssh):
    raw = run(ssh, "pm2 jlist | node -e " + shlex.quote(
        "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))));"))
    return json.loads(raw)


def snapshot(ssh):
    source = """
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();
console.log(JSON.stringify({now:Date.now(),rows:await c.db('lhs_s1001').collection('gameservers').find({}).sort({serverId:1}).toArray(),s3Collections:(await c.db('lhs_s1003').listCollections({},{nameOnly:true}).toArray()).map(x=>x.name),s3Players:await c.db('lhs_s1003').collection('players').countDocuments({})}));await c.close();})().catch(e=>{console.error(e.message);process.exit(1)});
"""
    return json.loads(node(ssh, source))


def set_s3(ssh, previous, public):
    # Match every field being changed; never update S1/S2 or unrelated metadata.
    fields = ['serverId', 'pageId', 'pageName', 'serverName', 'openTime', 'running', 'status', 'isNew', 'isRecommend']
    before = {key: previous[key] for key in fields}
    after = dict(before, serverId=1003, pageId=1, pageName='MEGAME365', serverName='S3',
                 openTime=OPEN, running=public, status=1 if public else 0, isNew=True, isRecommend=False)
    source = """
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();try{
const before=BEFORE,after=AFTER;const col=c.db('lhs_s1001').collection('gameservers');
const result=await col.updateOne(before,{$set:after});if(result.matchedCount!==1)throw Error('S3_METADATA_CAS_FAILED');
console.log(JSON.stringify(await col.findOne({serverId:1003},{projection:{_id:0}})));
}finally{await c.close();}})().catch(e=>{console.error(e.message);process.exit(1)});
""".replace('BEFORE', json.dumps(before)).replace('AFTER', json.dumps(after))
    return json.loads(node(ssh, source))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    ssh = connect()
    changed = []
    try:
        before_processes = processes(ssh)
        state = snapshot(ssh)
        assert state['now'] < OPEN - 3600000, 'LAUNCH_WINDOW_TOO_CLOSE'
        assert not any(p['name'] in ('lhs-s1003', 'lhs-real-bots-s3') for p in before_processes), 'S3_ALREADY_EXISTS'
        assert state['s3Collections'] == [] and state['s3Players'] == 0, 'S3_NOT_EMPTY'
        row = next(r for r in state['rows'] if r['serverId'] == 1003)
        assert row['running'] is False and row['status'] == 0, 'S3_NOT_PRIVATE'
        with ssh.open_sftp() as sftp:
            baseline = {p: sftp.open(p, 'rb').read() for p in (CONFIG, NGINX, WEBENV)}
            stats = {p: sftp.stat(p) for p in baseline}
            assert hashlib.sha256(baseline[CONFIG]).hexdigest() == EXPECTED_CONFIG, 'ECOSYSTEM_DRIFT'
            candidate_config = (WB.parent / 'linhhoasu/lhs/newServer/ecosystem.config.js').read_bytes()
            candidate_nginx = baseline[NGINX]
            marker = b'    # ===== '
            anchor = b'    location /ws-s2 {'
            assert candidate_nginx.count(anchor) == 1 and b'location /ws-s3' not in candidate_nginx
            s2_start = candidate_nginx.index(anchor)
            s2_end = candidate_nginx.index(b'\n    }', s2_start) + len(b'\n    }')
            block = candidate_nginx[s2_start:s2_end].replace(b'/ws-s2', b'/ws-s3').replace(b':9201', b':9202')
            candidate_nginx = candidate_nginx[:s2_end] + b'\n\n' + block + candidate_nginx[s2_end:]
            updates = {'LHS_SERVER_COUNT': '3', 'LHS_SERVER_3_ID': '1003', 'LHS_SERVER_3_KEY': '1003',
                       'LHS_SERVER_3_NAME': 'Linh Họa Sư - S3', 'LHS_SERVER_3_API_BASE': 'http://127.0.0.1:8084'}
            lines, seen = [], set()
            for line in baseline[WEBENV].decode('utf-8-sig').splitlines():
                key = line.split('=', 1)[0].strip() if '=' in line and not line.lstrip().startswith('#') else ''
                if key in updates:
                    assert key not in seen, 'DUPLICATE_ENV_KEY'
                    lines.append(key + '=' + updates[key]); seen.add(key)
                else:
                    lines.append(line)
            lines.extend(key + '=' + value for key, value in updates.items() if key not in seen)
            candidate_env = ('\n'.join(lines).rstrip() + '\n').encode('utf-8')
            candidates = {CONFIG: candidate_config, NGINX: candidate_nginx, WEBENV: candidate_env}
            summary = {'openTime': OPEN, 'processesBefore': before_processes,
                       'beforeHashes': {p: hashlib.sha256(b).hexdigest() for p, b in baseline.items()},
                       'candidateHashes': {p: hashlib.sha256(b).hexdigest() for p, b in candidates.items()},
                       'backup': BACKUP, 's3DatabaseInitiallyEmpty': True}
            print(json.dumps({'preflight': summary}, ensure_ascii=False), flush=True)
            if not args.apply:
                return
            # The folder must not contain a prior deployment; do not overwrite backups.
            try:
                sftp.stat(BACKUP)
                raise RuntimeError('REMOTE_BACKUP_ALREADY_EXISTS')
            except FileNotFoundError:
                pass
            run(ssh, 'install -d -m 700 ' + shlex.quote(BACKUP) + ' ' + shlex.quote(STAGE))
            for p, data in baseline.items():
                name = {CONFIG: 'ecosystem.config.js.before', NGINX: 'game.lhs.conf.before', WEBENV: 'webgm.env.before'}[p]
                with sftp.open(BACKUP + '/' + name, 'wb') as f:
                    f.write(data)
                sftp.chmod(BACKUP + '/' + name, 0o600)
            with sftp.open(BACKUP + '/metadata-and-processes.json', 'wb') as f:
                f.write(json.dumps({'state': state, 'processes': before_processes}, ensure_ascii=False, indent=2).encode('utf-8'))
            sftp.chmod(BACKUP + '/metadata-and-processes.json', 0o600)
            run(ssh, 'cp -p /root/.pm2/dump.pm2 ' + shlex.quote(BACKUP + '/dump.pm2.before') + '\nchmod 600 ' + shlex.quote(BACKUP + '/dump.pm2.before'))
            for target, local in (
                (APP + '/scripts/start-scheduled-bots.js', WB.parent / 'linhhoasu/lhs/newServer/scripts/start-scheduled-bots.js'),
                (STAGE + '/qa_server3_launch_20260913.js', WB / 'tools/qa_server3_launch_20260913.js'),
            ):
                try:
                    sftp.stat(target)
                    raise RuntimeError('NEW_FILE_EXISTS:' + target)
                except FileNotFoundError:
                    pass
                sftp.put(str(local), target)
                sftp.chmod(target, 0o644 if '/scripts/' in target else 0o600)
                run(ssh, 'node --check ' + shlex.quote(target))
            for p, data in candidates.items():
                stage_path = STAGE + '/' + {CONFIG: 'ecosystem.config.js', NGINX: 'game.lhs.conf', WEBENV: 'webgm.env'}[p]
                with sftp.open(stage_path, 'wb') as f:
                    f.write(data)
                sftp.chmod(stage_path, stats[p].st_mode & 0o777)
                sftp.chown(stage_path, stats[p].st_uid, stats[p].st_gid)
                if p == CONFIG:
                    run(ssh, 'node --check ' + shlex.quote(stage_path))
                assert sftp.open(p, 'rb').read() == baseline[p], 'CAS_DRIFT:' + p
            row = set_s3(ssh, row, False)
            print('S3_PRIVATE_METADATA_READY', flush=True)
            # Install the process configuration and start only the new S3 runtime.
            sftp.posix_rename(STAGE + '/ecosystem.config.js', CONFIG); changed.append(CONFIG)
            print(run(ssh, 'cd ' + APP + ' && pm2 start ecosystem.config.js --only lhs-s1003'), flush=True)
            for attempt in range(20):
                try:
                    ready = json.loads(run(ssh, 'curl -fsS --max-time 3 http://127.0.0.1:8084/ready'))
                    if ready.get('status') == 'ok':
                        break
                except Exception:
                    pass
                time.sleep(1)
            else:
                raise RuntimeError('S3_NOT_READY')
            sftp.posix_rename(STAGE + '/game.lhs.conf', NGINX); changed.append(NGINX)
            try:
                run(ssh, 'nginx -t')
            except Exception:
                with sftp.open(NGINX, 'wb') as f:
                    f.write(baseline[NGINX])
                raise
            run(ssh, 'nginx -s reload')
            sftp.posix_rename(STAGE + '/webgm.env', WEBENV); changed.append(WEBENV)
            # .env is read with PHP file() per request, no shared PHP-FPM restart.
            print(run(ssh, 'cd ' + APP + ' && pm2 restart ecosystem.config.js --only lhs-s1001 --update-env'), flush=True)
            for attempt in range(20):
                try:
                    if json.loads(run(ssh, 'curl -fsS --max-time 3 http://127.0.0.1:8080/ready')).get('status') == 'ok':
                        break
                except Exception:
                    pass
                time.sleep(1)
            else:
                raise RuntimeError('S1_NOT_READY')
            row = set_s3(ssh, row, True)
            print('S3_SCHEDULE_PUBLISHED', flush=True)
            print(run(ssh, 'cd ' + APP + ' && pm2 start ecosystem.config.js --only lhs-real-bots-s3'), flush=True)
            after = processes(ssh)
            for item in before_processes:
                actual = next(p for p in after if p['name'] == item['name'])
                if item['name'] == 'lhs-s1001':
                    assert actual['restarts'] == item['restarts'] + 1 and actual['status'] == 'online', 'S1_RESTART_COUNT'
                else:
                    assert actual == item, 'UNRELATED_PROCESS_CHANGED:' + item['name']
            final_state = snapshot(ssh)
            assert [r for r in final_state['rows'] if r['serverId'] != 1003] == [r for r in state['rows'] if r['serverId'] != 1003], 'OTHER_SERVER_METADATA_CHANGED'
            assert final_state['s3Players'] == 0, 'EARLY_S3_PROGRESS'
            run(ssh, 'pm2 save')
            summary.update({'processesAfter': after, 'row': row, 's3Players': final_state['s3Players'], 'result': 'DEPLOYED'})
            print(json.dumps(summary, ensure_ascii=False), flush=True)
            with sftp.open(STAGE + '/deployment-evidence.json', 'wb') as f:
                f.write(json.dumps(summary, ensure_ascii=False, indent=2).encode('utf-8'))
            print(run(ssh, 'node ' + STAGE + '/qa_server3_launch_20260913.js'), flush=True)
    except Exception:
        print(json.dumps({'deploymentStopped': True, 'changedPaths': changed, 'backup': BACKUP,
                          'rollback': 'First make only serverId1003 private; stop only lhs-s1003/lhs-real-bots-s3; restore exact changed file backups after CAS; nginx -t and reload; restore S1 environment and restart only S1 if it was changed. Never delete player data.'}))
        raise
    finally:
        ssh.close()


if __name__ == '__main__':
    main()
