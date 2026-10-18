"""Feature-only minimum-day policy; preserve real launch/settlement clocks."""
import json
import shlex
from pathlib import Path
import release_pet_grid48_20261005 as release

release.OUT = Path(__file__).resolve().parents[1] / 'temp/feature_day1_20261005'
release.MANIFEST = release.OUT / 'deployment.json'
base_loader = release.loader


def loader(client, manifest, candidate):
    path = base_loader(client, manifest, candidate)
    with client.open_sftp() as sf:
        with sf.open(path, 'rb') as handle:
            data = handle.read().decode('utf-8')
        anchor = "if(e.code==='MODULE_NOT_FOUND'&&map[f+'.js'])return f+'.js';throw e"
        if data.count(anchor) != 1:
            raise RuntimeError('JSON_LOADER_ANCHOR')
        data = data.replace(anchor, "if(e.code==='MODULE_NOT_FOUND'&&map[f])return f;if(e.code==='MODULE_NOT_FOUND'&&map[f+'.js'])return f+'.js';throw e")
        with sf.open(path, 'wb') as handle:
            handle.write(data.encode('utf-8'))
    return path


def tests(client, manifest, candidate):
    preload = loader(client, manifest, candidate)
    names = ['test_feature_day1_server_20261005.js', 'test_feature_day1_valhalla_20261005.js']
    with client.open_sftp() as sf:
        for name in names:
            target = manifest['stage'] + '/' + name
            data = (release.ROOT / '_ai_workbench/tools' / name).read_bytes()
            with sf.open(target, 'wb') as handle:
                handle.write(data)
            if release.rh(client, target) != release.sha(data):
                raise RuntimeError('TEST_STAGE_HASH:' + name)
    env = ('FEATURE_APP=' + shlex.quote(release.APP)
           + ' VALHALLA_HANDLER=' + shlex.quote(release.APP + '/src/handlers/valhalla.js')
           + ' FEATURE_DAY_MAIN=' + shlex.quote(release.GAME + '/js/main.min_drop100.js')
           + ' FEATURE_DAY_SERVER=' + shlex.quote(release.APP + '/src/config/featureDayAccess.js')
           + ' FEATURE_DAY_CLIENT=' + shlex.quote(manifest['stage'] + '/candidate/webgame/game/js/lhs-feature-day1-v1.js'
                                               if candidate else release.GAME + '/js/lhs-feature-day1-v1.js'))
    results = {}
    for name in names + ['test_client.js']:
        raw = release.run(client, env + ' node -r ' + shlex.quote(preload) + ' ' + shlex.quote(manifest['stage'] + '/' + name))
        obj = json.loads(raw if name == 'test_client.js' else raw.strip().splitlines()[-1])
        if 'checks' not in obj:
            raise RuntimeError('TEST_RESULT_INVALID:' + name)
        results[name] = obj
    manifest['candidateTests' if candidate else 'installedTests'] = results
    release.save(manifest)
    print(json.dumps({'step': 'tests', 'candidate': candidate,
                      'checks': {n: len(o['checks']) if isinstance(o['checks'], list) else o['checks']
                                 for n, o in results.items()},
                      'changedSystems': results[names[0]].get('changedSystems'),
                      'rows': results[names[0]].get('rows')}, ensure_ascii=False), flush=True)


release.tests = tests

if __name__ == '__main__':
    release.main()
