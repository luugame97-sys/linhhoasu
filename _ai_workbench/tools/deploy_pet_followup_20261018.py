"""Deploy the tested four-file pet follow-up with scoped failure recovery."""
from pathlib import Path
import hashlib
import json
import shlex
import sys
import time
import deploy_mount_star_progress_20261017 as release

TASK = Path(__file__).resolve().parents[1] / 'temp/pet_followup_20261018'
FILES = {
    'lhs/newServer/src/handlers/pet.js': 'pet.js',
    'webgame/game/js/lhs-pet-grid48-v1.js': 'grid.js',
    'webgame/game/js/lhs-pet-safety-v1.js': 'safety.js',
    'webgame/game/index.html': 'index.html',
}


def validate():
    tests = json.loads((TASK / 'tests.json').read_text(encoding='utf-8'))
    server = json.loads((TASK / 'server-tests.json').read_text(encoding='utf-8'))
    assert tests['status'] == server['status'] == 'PASS'
    assert len(tests['cases']) == 12 and server['checks'] == 24
    assert not server['regressionFailures'] and server['networkAttempts'] == 0
    assert tests['productionWrites'] == server['productionWrites'] == 0
    assert set(tests['files']) == set(FILES.values())
    for name, digest in tests['files'].items():
        assert hashlib.sha256((TASK / 'candidate' / name).read_bytes()).hexdigest() == digest, 'UNTESTED_CANDIDATE:' + name
    assert tests['files']['pet.js'] == server['sourceSha256']
    assert not (TASK / 'deployment.json').exists(), 'REVIEW_EXISTING_DEPLOYMENT_FIRST'


def recover(receipt):
    """Restore exact preimages only if all targets still match this release."""
    q = shlex.quote
    c = release.connect()
    try:
        def rh(path):
            return release.run(c, 'sha256sum -- ' + q(path), timeout=15).split()[0]
        for rel, meta in receipt['files'].items():
            assert rh('/linhhoasu/' + rel) in (meta['before'], meta['after']), 'RECOVERY_DRIFT:' + rel
            assert rh(receipt['backup'] + '/before/' + rel) == meta['before'], 'BACKUP_DRIFT:' + rel
        receipt['failedDeploymentRestarts'] = receipt['restarts']
        receipt['recoveryRestarts'] = []
        with c.open_sftp() as s:
            for rel, meta in reversed(list(receipt['files'].items())):
                target = '/linhhoasu/' + rel
                if rh(target) == meta['before']:
                    continue
                assert rh(target) == meta['after'], 'RECOVERY_CAS:' + rel
                stage = receipt['backup'] + '/stage/' + rel
                release.run(c, 'cp -p -- ' + q(receipt['backup'] + '/before/' + rel) + ' ' + q(stage))
                s.posix_rename(stage, target)
                assert rh(target) == meta['before'], 'RECOVERY_HASH:' + rel
            nodes = sorted([n for n in json.loads(release.run(c, release.SNAP)) if n['name'].startswith('lhs-s') and n['name'][5:].isdigit()], key=lambda n: n['name'])
            assert len(nodes) == 9
            assert all(n['cwd'] == '/linhhoasu/lhs/newServer' and n['entry'] == '/linhhoasu/lhs/newServer/src/app.js' for n in nodes)
            for n in nodes:
                release.run(c, 'pm2 restart ' + q(n['name']) + ' >/dev/null', timeout=30)
                ready = None
                for _ in range(100):
                    try:
                        body = json.loads(release.run(c, 'curl -fsS --max-time 3 http://127.0.0.1:' + str(n['port']) + '/ready', timeout=5))
                        if body['checks']['mongo'] and body['checks']['redis']:
                            ready = body
                            break
                    except RuntimeError:
                        pass
                    time.sleep(.5)
                assert ready, 'RECOVERY_READY_TIMEOUT:' + n['name']
                receipt['recoveryRestarts'].append({'name': n['name'], 'ready': ready})
                print(json.dumps({'recoveredServer': n['name'], 'ready': True}), flush=True)
            release.run(c, 'pm2 save >/dev/null', timeout=15)
            receipt['status'] = 'ROLLED_BACK_VERIFIED'
            with s.open(receipt['backup'] + '/deployment.json', 'wb') as f:
                f.write(json.dumps(receipt, ensure_ascii=False, indent=2).encode('utf-8'))
    finally:
        (TASK / 'deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
        c.close()


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    validate()
    source = Path(release.__file__).read_text(encoding='utf-8')
    gate = " assert json.loads((TASK/'mongo-tests.json').read_text())['status']=='PASS'"
    assert source.count(gate) == 1
    # Use the actual fixture regression receipt; no claim of a Mongo write test.
    source = source.replace(gate, " assert json.loads((TASK/'server-tests.json').read_text())['status']=='PASS'")
    scope = {'__name__': 'pet_followup_release', '__file__': release.__file__}
    exec(compile(source, release.__file__, 'exec'), scope)
    scope.update(TASK=TASK, FILES=FILES, VERSION='20261018_pet_followup_v1', BACKUP_PREFIX='pet_followup_', RECOVERY_POLICY='No player migration; retain pending auto intent on uncertain save; exact preimage rollback on release failure')
    try:
        scope['main']()
    except Exception as error:
        path = TASK / 'deployment.json'
        if path.exists():
            receipt = json.loads(path.read_text(encoding='utf-8'))
            receipt['error'] = str(error)
            if receipt['status'] == 'FILES_APPLIED':
                recover(receipt)
            else:
                path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
        raise


if __name__ == '__main__':
    main()
