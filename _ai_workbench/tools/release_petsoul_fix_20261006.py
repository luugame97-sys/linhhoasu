"""Rolling deployment for the pet-soul privilege/wish fix."""
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
import release_pet_grid48_20261005 as release

release.OUT = Path(__file__).resolve().parents[1] / 'temp/petsoul_fix_20261006'
release.MANIFEST = release.OUT / 'deployment.json'


def tests(client, manifest, candidate):
    loader = release.loader(client, manifest, candidate)
    target = manifest['stage'] + '/test_petsoul_contract_fix_20261006.js'
    data = (release.ROOT / '_ai_workbench/tools/test_petsoul_contract_fix_20261006.js').read_bytes()
    with client.open_sftp() as sf:
        with sf.open(target, 'wb') as handle:
            handle.write(data)
    if release.rh(client, target) != release.sha(data):
        raise RuntimeError('TEST_STAGE_HASH')
    handler = manifest['stage'] + '/candidate/lhs/newServer/src/handlers/pet-soul.js' if candidate else release.APP + '/src/handlers/pet-soul.js'
    benefit = manifest['stage'] + '/candidate/lhs/newServer/src/services/RechargeBenefitService.js' if candidate else release.APP + '/src/services/RechargeBenefitService.js'
    env = ('FEATURE_APP=' + shlex.quote(release.APP)
           + ' PET_BENEFIT=' + shlex.quote(benefit)
           + ' PET_SOUL_HANDLER=' + shlex.quote(handler))
    raw = release.run(client, env + ' node -r ' + shlex.quote(loader) + ' ' + shlex.quote(target))
    result = json.loads(raw.strip().splitlines()[-1])
    if result.get('checks') != 6 or result.get('productionWrites') != 0:
        raise RuntimeError('TEST_RESULT_INVALID')
    manifest['candidateTests' if candidate else 'installedTests'] = {'test_petsoul_contract_fix_20261006.js': result}
    release.save(manifest)
    print(json.dumps({'step': 'tests', 'candidate': candidate, 'result': result}), flush=True)


release.tests = tests

if __name__ == '__main__':
    release.main()
