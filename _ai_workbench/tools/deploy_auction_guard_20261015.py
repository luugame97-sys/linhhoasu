"""Selective backup/CAS + rolling S1-S8 deployment for auction containment."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shlex
import sys
import time
from auction_ops_20261015 import APP, TASK, connect, run

RELEASE = '20261015_auction_guard_v1'
FILES = {
    'src/handlers/auction.js': APP + '/src/handlers/auction.js',
    'web/js/lhs-auction-status-v1.js': '/linhhoasu/webgame/game/js/lhs-auction-status-v1.js',
    'web/index.html': '/linhhoasu/webgame/game/index.html',
}
SERVERS = [f'lhs-s{n}' for n in range(1001, 1009)]
PORTS = [8080, 8083, 8084, 8085, 8086, 8087, 8088, 8089]
def sha(data): return hashlib.sha256(data).hexdigest()
def q(value): return shlex.quote(str(value))

def main():
    sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
    client = connect()
    sftp = client.open_sftp()
    receipt_path = TASK / 'deployment.json'
    if receipt_path.exists(): raise RuntimeError('Existing deployment receipt; inspect before rerunning')
    nonce = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/auction_guard_{nonce}'
    stage = f'/linhhoasu/_ai_workbench/temp/auction_guard_{nonce}'
    receipt = {'release': RELEASE, 'startedAt': datetime.now(timezone.utc).isoformat(), 'backup': backup, 'stage': stage,
               'files': {}, 'restarted': [], 'status': 'preflight', 'directPlayerWrites': 0}
    changed = []
    def save(): receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
    def read(p):
        try:
            with sftp.open(p, 'rb') as f: return f.read()
        except FileNotFoundError: return None
    def inventory():
        js = "const p=JSON.parse(require('child_process').execSync('pm2 jlist'));console.log(JSON.stringify(p.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,cwd:p.pm2_env.pm_cwd,port:p.pm2_env.HTTP_PORT}))));"
        return {p['name']: p for p in json.loads(run(client, 'node -e ' + q(js)))}
    def ready(port):
        raw = run(client, f'curl --silent --show-error --fail --max-time 5 http://127.0.0.1:{port}/ready')
        body = json.loads(raw)
        if body.get('status') != 'ok' or body.get('checks', {}).get('mongo') is not True or body.get('checks', {}).get('redis') is not True:
            raise RuntimeError('Not ready: ' + json.dumps(body))
        return body
    def await_ready(name, port, old_pid):
        last = ''
        for attempt in range(30):
            try:
                row = inventory()[name]
                body = ready(port)
                if row['status'] != 'online' or not row['pid'] or row['pid'] == old_pid: raise RuntimeError('PID not replaced')
                time.sleep(1)
                second = inventory()[name]
                ready(port)
                if second['pid'] != row['pid']: raise RuntimeError('PID unstable')
                return {'process': second, 'ready': body}
            except Exception as error:
                last = str(error)
                time.sleep(2)
        raise RuntimeError(f'{name} readiness failed: {last}')
    preimages = {}
    candidates = {}
    try:
        before = inventory()
        for name, port in zip(SERVERS, PORTS):
            assert before[name]['status'] == 'online' and before[name]['cwd'] == APP and before[name]['port'] == port
            ready(port)
        receipt['before'] = before
        for relative, remote in FILES.items():
            baseline = TASK / 'baseline' / relative
            expected = baseline.read_bytes() if baseline.exists() else None
            current = read(remote)
            if current != expected: raise RuntimeError('Preimage conflict: ' + remote)
            preimages[relative] = current
            data = (TASK / 'candidate' / relative).read_bytes()
            # Preserve the existing web file's newline convention. The only
            # semantic index change is one script entry after maintenance.
            if relative == 'web/index.html' and b'\r\n' in current:
                data = data.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
            candidates[relative] = data
            receipt['files'][relative] = {'remote': remote, 'before': sha(current) if current is not None else None, 'after': sha(data)}
        run(client, 'mkdir -p ' + q(backup) + ' ' + q(stage))
        for relative, remote in FILES.items():
            target = stage + '/' + relative
            run(client, 'mkdir -p ' + q(str(Path(target).parent).replace('\\', '/')) + ' ' + q(str(Path(backup + '/' + relative).parent).replace('\\', '/')))
            if preimages[relative] is not None:
                run(client, 'cp -p -- ' + q(remote) + ' ' + q(backup + '/' + relative))
                if read(backup + '/' + relative) != preimages[relative]: raise RuntimeError('Backup read-back failed')
            with sftp.open(target, 'wb') as f: f.write(candidates[relative])
            attrs = sftp.stat(remote) if preimages[relative] is not None else sftp.stat('/linhhoasu/webgame/game/js/lhs-event-maintenance-v1.js')
            sftp.chmod(target, attrs.st_mode & 0o777)
            sftp.chown(target, attrs.st_uid, attrs.st_gid)
            if read(target) != candidates[relative]: raise RuntimeError('Stage read-back failed')
            if relative.endswith('.js'): run(client, 'node --check ' + q(target))
        receipt['status'] = 'staged'
        save()
        print('Backup, source CAS, staged syntax: PASS', flush=True)
        def install(relative):
            remote = FILES[relative]
            if read(remote) != preimages[relative]: raise RuntimeError('CAS conflict before swap: ' + remote)
            sftp.posix_rename(stage + '/' + relative, remote)
            changed.append(relative)
            if read(remote) != candidates[relative]: raise RuntimeError('Install read-back failed')
        install('src/handlers/auction.js')
        for name, port in zip(SERVERS, PORTS):
            current = inventory()[name]
            if current['pid'] != before[name]['pid']: raise RuntimeError('Unexpected process replacement: ' + name)
            receipt['restarted'].append(name)
            save()
            run(client, 'pm2 restart ' + q(name), timeout=45)
            checked = await_ready(name, port, before[name]['pid'])
            receipt.setdefault('readiness', {})[name] = checked
            save()
            print(name + ' new PID + Mongo/Redis readiness: PASS', flush=True)
        install('web/js/lhs-auction-status-v1.js')
        install('web/index.html')
        after = inventory()
        for name in SERVERS:
            if after[name]['restarts'] != before[name]['restarts'] + 1: raise RuntimeError('Unexpected restart count: ' + name)
        for name in before.keys() - set(SERVERS):
            if after.get(name, {}).get('pid') != before[name]['pid']: raise RuntimeError('Unrelated process changed: ' + name)
        for relative, remote in FILES.items():
            if sha(read(remote)) != receipt['files'][relative]['after']: raise RuntimeError('Final hash mismatch: ' + remote)
        receipt['after'] = after
        receipt['status'] = 'deployed'
        receipt['completedAt'] = datetime.now(timezone.utc).isoformat()
        save()
        print(json.dumps({'status': receipt['status'], 'backup': backup, 'readiness': '8/8', 'directPlayerWrites': 0}))
    except Exception as error:
        receipt['status'] = 'failed'
        receipt['error'] = str(error)
        # Restore only our exact installed bytes; never overwrite concurrent work.
        rollback = []
        for relative in reversed(changed):
            remote = FILES[relative]
            if read(remote) != candidates[relative]:
                rollback.append({'path': remote, 'status': 'conflict-preserved'})
                continue
            if preimages[relative] is None:
                # Move the newly-created addon to the task stage, keeping recovery.
                sftp.posix_rename(remote, stage + '/unused-addon.js')
            else:
                temp = stage + '/restore-' + relative.replace('/', '_')
                run(client, 'cp -p -- ' + q(backup + '/' + relative) + ' ' + q(temp))
                sftp.posix_rename(temp, remote)
            rollback.append({'path': remote, 'status': 'restored'})
        receipt['rollback'] = rollback
        if all(row['status'] == 'restored' for row in rollback):
            for name in receipt['restarted']:
                pid = inventory()[name]['pid']
                run(client, 'pm2 restart ' + q(name), timeout=45)
                await_ready(name, PORTS[SERVERS.index(name)], pid)
        save()
        raise
    finally:
        client.close()

if __name__ == '__main__': main()
