"""Selective backup/CAS + rolling S1-S8 deployment for CrossRival safety."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shlex
import sys
import time
from auction_ops_20261015 import APP, connect, run

TASK = Path(__file__).resolve().parents[2] / '_ai_workbench/temp/cross_rival_20261015'

RELEASE = '20261015_cross_rival_safety_v1'
FILES = {
    **{name: APP + '/' + name for name in (
        'src/services/CrossRivalRules.js', 'src/services/CrossRivalReadService.js',
        'src/services/ConfigService.js', 'src/services/CrossEventScheduleService.js',
        'src/services/FarmShopService.js', 'src/handlers/item.js', 'src/handlers/cross-rival.js',
    )},
    'web/js/lhs-cross-events-v2.js': '/linhhoasu/webgame/game/js/lhs-cross-events-v2.js',
    'web/js/lhs-cross-rival-safety-v1.js': '/linhhoasu/webgame/game/js/lhs-cross-rival-safety-v1.js',
    'web/index.html': '/linhhoasu/webgame/game/index.html',
}
SERVERS = [f'lhs-s{n}' for n in range(1001, 1009)]
PORTS = [8080, 8083, 8084, 8085, 8086, 8087, 8088, 8089]
SYNC_FIX = '--sync-fix' in sys.argv
RECOVERY_FIX = '--recovery-fix' in sys.argv
NATIVE_QA = '--native-qa' in sys.argv
NATIVE_FIX = next((arg.split('=',1)[1] for arg in sys.argv if arg.startswith('--native-fix=')), '')
PUBLIC_OPEN = '--public-open' in sys.argv
if NATIVE_FIX and (not NATIVE_FIX.isdigit() or not 1 <= int(NATIVE_FIX) <= 9):
    raise ValueError('Native fix revision must be 1..9')
NATIVE = NATIVE_QA or bool(NATIVE_FIX)
PATCH = SYNC_FIX or RECOVERY_FIX
INTEGRATION = '--integration' in sys.argv or PATCH or NATIVE
INTEGRATION = INTEGRATION or PUBLIC_OPEN
if INTEGRATION:
    RELEASE = '20261015_cross_rival_integration_v2'
    FILES = {name: APP + '/' + name for name in (
        'src/config/crossRivalRelease.json', 'src/services/CrossRivalRules.js',
        'src/services/PlayerService.js', 'src/services/BattleService.js',
        'src/services/CrossRivalEconomyService.js', 'src/services/CrossRivalBattleAdapter.js',
        'src/services/CrossRivalBattlefieldService.js', 'src/services/CrossRivalProtocolService.js',
        'src/services/CrossRivalRuntimeService.js', 'src/services/CrossRivalRewardService.js',
        'src/services/CrossRivalHandlerService.js', 'src/services/CrossEventSettlementService.js',
        'src/handlers/cross-rival.js', 'src/app.js',
    )}
    FILES['web/js/lhs-cross-rival-safety-v1.js'] = '/linhhoasu/webgame/game/js/lhs-cross-rival-safety-v1.js'
    FILES['web/index.html'] = '/linhhoasu/webgame/game/index.html'
    if SYNC_FIX:
        FILES = {name: APP + '/' + name for name in (
            'src/services/CrossRivalRuntimeService.js', 'src/services/CrossRivalHandlerService.js',
        )}
        FILES['web/js/lhs-cross-rival-safety-v1.js'] = '/linhhoasu/webgame/game/js/lhs-cross-rival-safety-v1.js'
        FILES['web/index.html'] = '/linhhoasu/webgame/game/index.html'
    if RECOVERY_FIX:
        FILES = {name: APP + '/' + name for name in (
            'src/services/CrossRivalRuntimeService.js', 'src/services/CrossRivalBattlefieldService.js',
        )}
    if NATIVE_QA:
        FILES = {name: APP + '/' + name for name in (
            'src/config/crossRivalRelease.json', 'src/services/CrossRivalRules.js',
            'src/services/CrossRivalRuntimeService.js', 'src/services/CrossRivalRewardService.js',
            'src/services/CrossEventScheduleService.js', 'src/handlers/item.js',
        )}
    if NATIVE_FIX:
        FILES = {name: APP + '/' + name for name in (
            'src/services/CrossRivalHandlerService.js', 'src/services/CrossRivalReadService.js',
            'src/services/CrossRivalEconomyService.js', 'src/services/CrossRivalRuntimeService.js',
            'src/services/CrossRivalProtocolService.js', 'src/services/CrossRivalBattlefieldService.js',
        )}
    if PUBLIC_OPEN:
        FILES = {'src/config/crossRivalRelease.json': APP + '/src/config/crossRivalRelease.json'}
def sha(data): return hashlib.sha256(data).hexdigest()
def q(value): return shlex.quote(str(value))

def main():
    sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
    client = connect()
    sftp = client.open_sftp()
    tests = json.loads((TASK / ('integration-safety-tests.json' if INTEGRATION else 'safety-tests.json')).read_text(encoding='utf-8'))
    if tests.get('result') != 'PASS' or tests.get('checks', 0) < 47: raise RuntimeError('Tests required')
    if SYNC_FIX and tests.get('checks', 0) < 48: raise RuntimeError('Native rank cutoff test required')
    phase = 'integration-public-open' if PUBLIC_OPEN else 'integration-native-fix' + NATIVE_FIX if NATIVE_FIX else 'integration-native-qa' if NATIVE_QA else 'integration-recovery' if RECOVERY_FIX else 'integration-sync' if SYNC_FIX else 'integration' if INTEGRATION else 'safety'
    candidate_dir = TASK / ('next' if INTEGRATION else 'candidate')
    if INTEGRATION:
        integration = json.loads((TASK / 'integration-tests.json').read_text(encoding='utf-8'))
        if integration.get('result') != 'PASS' or integration.get('checks', 0) < 15 or not integration.get('concurrentOSProcesses'):
            raise RuntimeError('Real integration tests required')
        if SYNC_FIX and integration.get('checks', 0) < 16:
            raise RuntimeError('Per-session synchronization integration test required')
        if RECOVERY_FIX and integration.get('checks', 0) < 18:
            raise RuntimeError('Refund capacity and recovery isolation integration tests required')
        release_config = json.loads((candidate_dir / 'src/config/crossRivalRelease.json').read_text(encoding='utf-8'))
        if PUBLIC_OPEN:
            if release_config['enabled'] is not True or release_config['activationAt'] <= 0 or release_config['qaActors']:
                raise RuntimeError('Public release must be enabled with no QA actors')
            if release_config.get('activationAt',0) > time.time()*1000:
                raise RuntimeError('Public activation cannot be in the future')
        elif NATIVE:
            account = json.loads((TASK / 'admin-native-before.json').read_text(encoding='utf-8'))
            expected = {(r['serverId'],r['userId']) for r in account['roles'] if r['exists'] and account['activeRoleByServer'].get(str(r['serverId'])) == r['roleId']}
            actual = {(r['serverId'],r['userId']) for r in release_config['qaActors']}
            if account['accountId'] != 'vanduc97' or actual != expected or len(actual) != 8:
                raise RuntimeError('Only explicitly authorized active roles may enter native QA')
            if release_config['enabled'] or release_config['activationAt'] or integration.get('checks',0)<20:
                raise RuntimeError('Isolated QA tests and public maintenance required')
            if not time.time()*1000 < release_config['qaUntil'] < time.time()*1000+8*3600000:
                raise RuntimeError('QA expiry required')
        elif release_config['enabled'] or release_config['qaActors'] or release_config['activationAt']:
            raise RuntimeError('This deployment is maintenance-only; activation requires separate acceptance')
        for name, digest in integration['sourceHashes'].items():
            # The QA transport compiles Python read_text-normalized newlines.
            # Deployment receipt separately hashes the exact on-disk bytes.
            if sha((candidate_dir / name).read_text(encoding='utf-8').encode('utf-8')) != digest:
                raise RuntimeError('Source changed after integration test: ' + name)
    receipt_path = TASK / (phase + '-deployment.json')
    if receipt_path.exists(): raise RuntimeError('Existing deployment receipt; inspect before rerunning')
    nonce = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/cross_rival_{phase}_{nonce}'
    stage = f'/linhhoasu/_ai_workbench/temp/cross_rival_{phase}_{nonce}'
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
    prior = json.loads((TASK / 'integration-deployment.json').read_text(encoding='utf-8')) if PATCH else None
    if prior and prior['status'] != 'deployed': raise RuntimeError('Integration baseline was not deployed')
    if RECOVERY_FIX:
        sync = json.loads((TASK / 'integration-sync-deployment.json').read_text(encoding='utf-8'))
        if sync['status'] != 'deployed': raise RuntimeError('Synchronization baseline was not deployed')
        prior['files'].update(sync['files'])
    native_prior = {}
    if NATIVE_FIX:
        for label in ['integration-native-qa'] + ['integration-native-fix'+str(n) for n in range(1,int(NATIVE_FIX))]:
            deployed = json.loads((TASK / (label+'-deployment.json')).read_text(encoding='utf-8'))
            if deployed['status'] != 'deployed': raise RuntimeError('Native prior deployment incomplete')
            native_prior.update(deployed['files'])
    try:
        before = inventory()
        for name, port in zip(SERVERS, PORTS):
            assert before[name]['status'] == 'online' and before[name]['cwd'] == APP and before[name]['port'] == port
            ready(port)
        receipt['before'] = before
        for relative, remote in FILES.items():
            baseline_folder = 'baseline-deployed' if (PUBLIC_OPEN or NATIVE_FIX) else ('baseline-native' if NATIVE else 'baseline-integration' if INTEGRATION else 'baseline-current')
            baseline = TASK / baseline_folder / relative
            if not INTEGRATION and not baseline.exists(): baseline = TASK / 'baseline' / relative
            expected = baseline.read_bytes() if baseline.exists() else None
            current = read(remote)
            if NATIVE_FIX and relative in native_prior:
                if current is None or sha(current) != native_prior[relative]['after']:
                    raise RuntimeError('Native deployed preimage conflict: ' + remote)
            elif PATCH:
                if current is None or sha(current) != prior['files'][relative]['after']:
                    raise RuntimeError('Deployed integration preimage conflict: ' + remote)
            elif current != expected: raise RuntimeError('Preimage conflict: ' + remote)
            preimages[relative] = current
            data = (candidate_dir / relative).read_bytes()
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
            exemplar = '/linhhoasu/webgame/game/js/lhs-cross-events-v2.js' if relative.startswith('web/') else APP + '/src/services/CrossServerEventService.js'
            attrs = sftp.stat(remote) if preimages[relative] is not None else sftp.stat(exemplar)
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
        for relative in FILES:
            if relative.startswith('src/'): install(relative)
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
        for relative in FILES:
            if relative.startswith('web/'): install(relative)
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
                sftp.posix_rename(remote, stage + '/unused-' + relative.replace('/', '_'))
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
