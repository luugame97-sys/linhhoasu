"""Scoped Yuanbao gem shop release with exact-live CAS and isolated tests."""
import json
import shlex
from pathlib import Path
import release_pet_grid48_20261005 as release

release.OUT = Path(__file__).resolve().parents[1] / 'temp/gem_choice_shop_20261005'
release.MANIFEST = release.OUT / 'deployment.json'
base_loader = release.loader


def loader(client, manifest, candidate):
    target = base_loader(client, manifest, candidate)
    with client.open_sftp() as sf:
        with sf.open(target, 'rb') as handle:
            data = handle.read().decode('utf-8')
        anchor = "if(e.code==='MODULE_NOT_FOUND'&&map[f+'.js'])return f+'.js';throw e"
        if data.count(anchor) != 1:
            raise RuntimeError('JSON_LOADER_ANCHOR')
        data = data.replace(anchor, "if(e.code==='MODULE_NOT_FOUND'&&map[f])return f;if(e.code==='MODULE_NOT_FOUND'&&map[f+'.js'])return f+'.js';throw e")
        with sf.open(target, 'wb') as handle:
            handle.write(data.encode('utf-8'))
    return target


def tests(client, manifest, candidate):
    preload = loader(client, manifest, candidate)
    names = ['test_gem_exchange_safe_20261005.js', 'test_gem_choice_transactions_20261006.js',
             'test_gem_choice_catalog_20261006.js', 'test_gem_choice_codec_20261005.js']
    with client.open_sftp() as sf:
        for name in names:
            target = manifest['stage'] + '/' + name
            data = (release.ROOT / '_ai_workbench/tools' / name).read_bytes()
            with sf.open(target, 'wb') as handle:
                handle.write(data)
            if release.rh(client, target) != release.sha(data):
                raise RuntimeError('TEST_STAGE_HASH:' + name)
    source = manifest['stage'] + '/candidate/lhs/newServer/src' if candidate else release.APP + '/src'
    env = ('FEATURE_APP=' + shlex.quote(release.APP)
           + ' GEM_HANDLER=' + shlex.quote(source + '/handlers/gem.js')
           + ' GEM_CHOICE_CANDIDATE=' + shlex.quote(source)
           + ' GEM_CHOICE_USE_REAL_CONFIG=1'
           + ' GEM_SHOP_MODULE=' + shlex.quote(release.APP + '/src/config/gemChoiceShop.js')
           + ' GEM_SHOP_MAIN=' + shlex.quote(release.GAME + '/js/main.min_drop100.js')
           + ' GEM_CODEC_START=' + shlex.quote(release.GAME + '/js/start.min_52ac8d58.js')
           + ' GEM_SHOP_CLIENT=' + shlex.quote(manifest['stage'] + '/candidate/webgame/game/js/lhs-gem-choice-shop-v1.js'
                                               if candidate else release.GAME + '/js/lhs-gem-choice-shop-v1.js'))
    results = {}
    for name in names + ['test_client.js']:
        raw = release.run(client, env + ' node -r ' + shlex.quote(preload) + ' ' + shlex.quote(manifest['stage'] + '/' + name))
        obj = json.loads(raw if name in ['test_client.js', 'test_gem_choice_codec_20261005.js'] else raw.strip().splitlines()[-1])
        if not (obj.get('pass') or obj.get('passed') or obj.get('checks')):
            raise RuntimeError('TEST_RESULT_INVALID:' + name)
        results[name] = obj
    manifest['candidateTests' if candidate else 'installedTests'] = results
    release.save(manifest)
    print(json.dumps({'step': 'tests', 'candidate': candidate,
                      'results': {n: len(o['checks']) if isinstance(o.get('checks'), list)
                                  else o.get('checks', o.get('groups', o.get('passed')))
                                  for n, o in results.items()}}, ensure_ascii=False), flush=True)


release.tests = tests

if __name__ == '__main__':
    release.main()
