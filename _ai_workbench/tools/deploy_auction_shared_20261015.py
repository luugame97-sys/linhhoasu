"""Narrow auction release: exact remote baseline, backup, CAS, rolling readiness."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import PurePosixPath
import shlex
import sys
import time
from auction_ops_20261015 import APP, ROOT, TASK, connect, run

NAMES = [f'lhs-s{n}' for n in range(1001, 1009)]
PORTS = [8080, 8083, 8084, 8085, 8086, 8087, 8088, 8089]
SOURCE = ROOT / 'linhhoasu/lhs/newServer'
SHARED = TASK / 'shared'
FILES = {
    **{p: SOURCE / p for p in ['src/db/models/AuctionListing.js', 'src/db/models/AuctionRecord.js',
                              'src/config/auctionCatalog.v1.json', 'src/services/AuctionService.js', 'src/handlers/auction.js']},
    **{p: SHARED / p for p in ['src/handlers/artifact.js', 'src/app.js', 'ecosystem.config.js',
                              'web/js/lhs-auction-status-v1.js', 'web/index.html']},
}
FLAGS = 'AUCTION_SHARED_ENABLED=1 AUCTION_SHARED_APPROVED=1 AUCTION_CATALOG_PATH=/linhhoasu/lhs/newServer/src/config/auctionCatalog.v1.json '
def q(value): return shlex.quote(str(value))
def sha(value): return hashlib.sha256(value).hexdigest() if value is not None else None
def remote_path(rel): return '/linhhoasu/webgame/game/' + rel[4:] if rel.startswith('web/') else APP + '/' + rel

def main():
    sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
    if sys.argv[1:] != ['--deploy']: raise RuntimeError('Requires --deploy')
    receipt_path = TASK / 'shared-deployment.json'
    if receipt_path.exists(): raise RuntimeError('Receipt exists; inspect before any retry')
    client = connect()
    sftp = client.open_sftp()
    nonce = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = '/linhhoasu/_ai_workbench/backups/auction_shared_' + nonce
    stage = '/linhhoasu/_ai_workbench/temp/auction_shared_' + nonce
    receipt = {'status': 'preflight', 'backup': backup, 'stage': stage, 'files': {}, 'restarted': [], 'directPlayerWrites': 0}
    changed = []
    preimages, candidates = {}, {}
    def save(): receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
    def read(p):
        try:
            with sftp.open(p, 'rb') as f: return f.read()
        except FileNotFoundError: return None
    def put(p, data, mode=0o640):
        with sftp.open(p, 'wb') as f: f.write(data)
        sftp.chmod(p, mode)
    def inventory():
        data = json.loads(run(client, 'pm2 jlist'))
        return {p['name']: {'pid': p['pid'], 'status': p['pm2_env']['status'], 'restarts': p['pm2_env']['restart_time'],
                           'cwd': p['pm2_env']['pm_cwd'], 'port': p['pm2_env'].get('HTTP_PORT'),
                           'enabled': p['pm2_env'].get('AUCTION_SHARED_ENABLED'),
                           'approved': p['pm2_env'].get('AUCTION_SHARED_APPROVED'),
                           'catalog': p['pm2_env'].get('AUCTION_CATALOG_PATH')} for p in data}
    def ready(port):
        body = json.loads(run(client, f'curl -fsS --max-time 5 http://127.0.0.1:{port}/ready'))
        if body.get('status') != 'ok' or any(body.get('checks', {}).get(k) is not True for k in ['mongo', 'redis']):
            raise RuntimeError('Readiness failed: ' + str(port))
        return body
    def await_ready(name, port, old_pid, enabled=True):
        for _ in range(25):
            try:
                p = inventory()[name]
                assert p['status'] == 'online' and p['pid'] and p['pid'] != old_pid
                if enabled: assert p['enabled'] == '1' and p['approved'] == '1' and p['catalog'] == APP + '/src/config/auctionCatalog.v1.json'
                body = ready(port)
                time.sleep(1)
                assert inventory()[name]['pid'] == p['pid']
                ready(port)
                return {'process': p, 'ready': body}
            except Exception:
                time.sleep(1)
        raise RuntimeError('New process not stable/ready: ' + name)
    try:
        before = inventory()
        for name, port in zip(NAMES, PORTS):
            assert before[name]['status'] == 'online' and before[name]['cwd'] == APP and int(before[name]['port']) == port
            ready(port)
        receipt['before'] = before
        for rel, local in FILES.items():
            old = read(remote_path(rel))
            baseline = TASK / 'baseline-shared' / rel
            expected = baseline.read_bytes() if baseline.exists() else None
            if old != expected: raise RuntimeError('Baseline CAS conflict: ' + rel)
            candidate = local.read_bytes()
            if old and b'\r\n' in old: candidate = candidate.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
            preimages[rel], candidates[rel] = old, candidate
            receipt['files'][rel] = {'remote': remote_path(rel), 'before': sha(old), 'after': sha(candidate)}
        run(client, 'mkdir -p ' + q(backup) + ' ' + q(stage))
        put(backup + '/pm2-runtime.json', run(client, 'pm2 jlist').encode(), 0o600)
        pm2home = run(client, 'node -e ' + q("process.stdout.write(process.env.PM2_HOME || require('path').join(require('os').homedir(),'.pm2'))")).strip()
        dump_path = pm2home + '/dump.pm2'
        old_dump = read(dump_path)
        if old_dump is not None: put(backup + '/pm2-dump.json', old_dump, 0o600)
        for rel, candidate in candidates.items():
            remote, target = remote_path(rel), stage + '/' + rel
            run(client, 'mkdir -p ' + q(PurePosixPath(target).parent) + ' ' + q(PurePosixPath(backup + '/' + rel).parent))
            if preimages[rel] is not None:
                run(client, 'cp -p -- ' + q(remote) + ' ' + q(backup + '/' + rel))
                if read(backup + '/' + rel) != preimages[rel]: raise RuntimeError('Backup failed: ' + rel)
            attrs = sftp.stat(remote if preimages[rel] is not None else APP + '/src/handlers/auction.js')
            put(target, candidate, attrs.st_mode & 0o777)
            sftp.chown(target, attrs.st_uid, attrs.st_gid)
            if read(target) != candidate: raise RuntimeError('Stage hash failed: ' + rel)
            if rel.endswith('.js'): run(client, 'node --check ' + q(target))
        receipt['status'] = 'staged'
        save()
        print('Preflight 8/8, exact baselines, selective backup, staged syntax: PASS')
        for rel in FILES:
            if rel.startswith('web/'): continue
            if read(remote_path(rel)) != preimages[rel]: raise RuntimeError('CAS conflict before install: ' + rel)
            sftp.posix_rename(stage + '/' + rel, remote_path(rel))
            changed.append(rel)
            if read(remote_path(rel)) != candidates[rel]: raise RuntimeError('Read-back mismatch: ' + rel)
        # S5 has always been PM2-runtime/dump-managed; preserve that design.
        # The seven ecosystem entries and all eight live processes are checked.
        check = "const e=require('./ecosystem.config.js');const a=e.apps.filter(x=>/^lhs-s100[1-8]$/.test(x.name));if(a.length!==7||a.some(x=>x.env.AUCTION_SHARED_ENABLED!=='1'||x.env.AUCTION_SHARED_APPROVED!=='1'))throw Error('ENV');const s=require('./src/services/AuctionService');console.log(JSON.stringify({catalog:s.getCatalog().catalogVersion,lots:s.getCatalog().lots.length,phase:s.cycleInfo().phase,ecosystemNodes:a.map(x=>x.name)}));"
        receipt['loadCheck'] = run(client, 'cd ' + q(APP) + ' && node -e ' + q(check))
        for name, port in zip(NAMES, PORTS):
            if inventory()[name]['pid'] != before[name]['pid']: raise RuntimeError('Process changed before restart: ' + name)
            receipt['restarted'].append(name)
            save()
            # Merge only the three auction variables into the EXISTING process
            # env, preserving runtime-only overrides not in ecosystem source.
            run(client, FLAGS + 'pm2 restart ' + q(name) + ' --update-env', timeout=45)
            receipt.setdefault('readiness', {})[name] = await_ready(name, port, before[name]['pid'])
            save()
            print(name + ' flags + new PID + Mongo/Redis readiness: PASS')
        for rel in FILES:
            if not rel.startswith('web/'): continue
            if read(remote_path(rel)) != preimages[rel]: raise RuntimeError('Web CAS conflict: ' + rel)
            sftp.posix_rename(stage + '/' + rel, remote_path(rel))
            changed.append(rel)
        after = inventory()
        for rel in FILES:
            if read(remote_path(rel)) != candidates[rel]: raise RuntimeError('Final hash mismatch: ' + rel)
        for name in NAMES:
            if after[name]['restarts'] != before[name]['restarts'] + 1: raise RuntimeError('Unstable restart count: ' + name)
        receipt['unrelatedPidChanges'] = [name for name in before if name not in NAMES and after.get(name, {}).get('pid') != before[name]['pid']]
        run(client, 'pm2 save')
        receipt.update(status='deployed', after=after, completedAt=datetime.now(timezone.utc).isoformat())
        save()
        print(json.dumps({'status': 'deployed', 'backup': backup, 'readiness': '8/8', 'files': len(FILES), 'directPlayerWrites': 0}))
    except Exception as error:
        receipt.update(status='failed', error=str(error))
        rollback = []
        for rel in reversed(changed):
            remote = remote_path(rel)
            if read(remote) != candidates[rel]:
                rollback.append({'file': rel, 'status': 'conflict-preserved'})
                continue
            if preimages[rel] is None:
                sftp.posix_rename(remote, stage + '/' + rel)
            else:
                restore = stage + '/restore-' + rel.replace('/', '_')
                run(client, 'cp -p -- ' + q(backup + '/' + rel) + ' ' + q(restore))
                sftp.posix_rename(restore, remote)
            rollback.append({'file': rel, 'status': 'restored'})
        receipt['rollback'] = rollback
        if all(r['status'] == 'restored' for r in rollback):
            for name in receipt['restarted']:
                pid = inventory()[name]['pid']
                run(client, 'AUCTION_SHARED_ENABLED=0 AUCTION_SHARED_APPROVED=0 pm2 restart ' + q(name) + ' --update-env', timeout=45)
                await_ready(name, PORTS[NAMES.index(name)], pid, False)
            if receipt['restarted']: run(client, 'pm2 save')
        save()
        raise
    finally:
        sftp.close()
        client.close()

if __name__ == '__main__': main()
