"""Publish the native shop-index refresh without restarting game processes."""
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path
import release_pet_grid48_20261005 as release

OUT = release.ROOT / '_ai_workbench/temp/gem_shop_static_20261006'
release.OUT = OUT
release.MANIFEST = OUT / 'deployment.json'


def tests(client, manifest, candidate):
    path = manifest['stage'] + '/candidate/webgame/game/js/lhs-gem-choice-shop-v1.js' if candidate else release.GAME + '/js/lhs-gem-choice-shop-v1.js'
    env = ('GEM_SHOP_MODULE=' + shlex.quote(release.APP + '/src/config/gemChoiceShop.js')
           + ' GEM_SHOP_MAIN=' + shlex.quote(release.GAME + '/js/main.min_drop100.js')
           + ' GEM_SHOP_CLIENT=' + shlex.quote(path))
    output = release.run(client, env + ' node ' + shlex.quote(manifest['stage'] + '/test_client.js'))
    result = json.loads(output)
    assert result['passed'] and len(result['checks']) >= 25
    manifest['candidateTests' if candidate else 'installedTests'] = result
    release.save(manifest)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'stage'
    OUT.mkdir(parents=True, exist_ok=True)
    with release.connect() as client:
        if mode == 'stage':
            if release.MANIFEST.exists():
                raise RuntimeError('MANIFEST_EXISTS')
            original = json.loads((release.ROOT / '_ai_workbench/temp/gem_choice_shop_20261005/deployment.json').read_text(encoding='utf-8'))
            stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
            files = {}
            candidates = {}
            for rel in ['webgame/game/js/lhs-gem-choice-shop-v1.js', 'webgame/game/index.html']:
                path = '/linhhoasu/' + rel
                with client.open_sftp() as sf:
                    with sf.open(path, 'rb') as handle:
                        before = handle.read()
                if release.sha(before) != original['files'][rel]['after']:
                    raise RuntimeError('BASELINE_DRIFT:' + rel)
                baseline = OUT / 'baseline' / rel
                baseline.parent.mkdir(parents=True, exist_ok=True)
                baseline.write_bytes(before)
                if rel.endswith('.js'):
                    data = (release.ROOT / 'linhhoasu' / rel).read_bytes()
                else:
                    marker = b'js/lhs-gem-choice-shop-v1.js?v=20261006_gem_choice_shop_v1'
                    assert before.count(marker) == 1
                    data = before.replace(marker, b'js/lhs-gem-choice-shop-v1.js?v=20261006_gem_choice_shop_v2')
                candidate = OUT / 'candidate' / rel
                candidate.parent.mkdir(parents=True, exist_ok=True)
                candidate.write_bytes(data)
                files[rel] = {'before': release.sha(before), 'after': release.sha(data), 'bytes': len(data)}
                candidates['candidate/' + rel] = data
            candidates['test_client.js'] = (release.ROOT / '_ai_workbench/temp/gem_choice_shop_20261005/client/test_client.js').read_bytes()
            manifest = {'status': 'STAGING', 'stage': '/linhhoasu/_ai_workbench/temp/gem_shop_static_' + stamp,
                        'backup': '/linhhoasu/_ai_workbench/backups/gem_shop_static_' + stamp,
                        'files': files, 'installed': [], 'beforeProcesses': release.processes(client), 'directPlayerWrites': 0}
            release.save(manifest)
            release.run(client, 'mkdir -p ' + shlex.quote(manifest['stage']))
            with client.open_sftp() as sf:
                for rel, data in candidates.items():
                    path = manifest['stage'] + '/' + rel
                    release.run(client, 'mkdir -p ' + shlex.quote(path.rsplit('/', 1)[0]))
                    with sf.open(path, 'wb') as handle:
                        handle.write(data)
                    assert release.rh(client, path) == release.sha(data)
                    if rel.endswith('.js'):
                        release.run(client, 'node --check ' + shlex.quote(path))
            tests(client, manifest, True)
            manifest['status'] = 'STAGED'
            release.save(manifest)
            print(json.dumps({'status': manifest['status'], 'checks': len(manifest['candidateTests']['checks'])}), flush=True)
            return
        manifest = json.loads(release.MANIFEST.read_text(encoding='utf-8'))
        if mode != 'deploy' or manifest['status'] != 'STAGED':
            raise RuntimeError('NOT_STAGED')
        for rel in manifest['files']:
            release.install(client, manifest, rel)
        tests(client, manifest, False)
        if release.processes(client) != manifest['beforeProcesses']:
            raise RuntimeError('PROCESS_CHANGED_DURING_STATIC_RELEASE')
        manifest['status'] = 'DEPLOYED_VERIFIED'
        release.save(manifest)
        print(json.dumps({'status': manifest['status'], 'backup': manifest['backup']}), flush=True)


if __name__ == '__main__':
    main()
