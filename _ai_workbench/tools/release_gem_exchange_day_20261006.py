"""Scoped follow-up for legacy gem exchange counter day adoption."""
import json
import shlex
from pathlib import Path
import release_pet_grid48_20261005 as release

release.OUT = Path(__file__).resolve().parents[1] / 'temp/gem_exchange_day_20261006'
release.MANIFEST = release.OUT / 'deployment.json'


def tests(client, manifest, candidate):
    name = 'test_gem_exchange_safe_20261005.js'
    target = manifest['stage'] + '/' + name
    data = (release.ROOT / '_ai_workbench/tools' / name).read_bytes()
    with client.open_sftp() as sf:
        with sf.open(target, 'wb') as handle:
            handle.write(data)
    if release.rh(client, target) != release.sha(data):
        raise RuntimeError('TEST_STAGE_HASH')
    handler = manifest['stage'] + '/candidate/lhs/newServer/src/handlers/gem.js' if candidate else release.APP + '/src/handlers/gem.js'
    preload = release.loader(client, manifest, candidate)
    command = ('FEATURE_APP=' + shlex.quote(release.APP) + ' GEM_HANDLER=' + shlex.quote(handler)
               + ' node -r ' + shlex.quote(preload) + ' ' + shlex.quote(target))
    result = json.loads(release.run(client, command).strip().splitlines()[-1])
    if result.get('checks') != 27 or result.get('productionWrites') != 0:
        raise RuntimeError('TEST_RESULT_INVALID')
    manifest['candidateTests' if candidate else 'installedTests'] = {name: result}
    release.save(manifest)
    print(json.dumps({'step': 'tests', 'candidate': candidate, 'result': result}), flush=True)


release.tests = tests

if __name__ == '__main__':
    release.main()
