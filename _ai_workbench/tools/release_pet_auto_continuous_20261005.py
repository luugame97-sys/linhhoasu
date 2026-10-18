"""Scoped auto-loop, access and pet-pack release using existing CAS gates."""
import json
import shlex
from pathlib import Path
import release_pet_grid48_20261005 as release

release.OUT = Path(__file__).resolve().parents[1] / 'temp/pet_auto_continuous_20261005'
release.MANIFEST = release.OUT / 'deployment.json'


def tests(client, manifest, candidate):
    loader = release.loader(client, manifest, candidate)
    names = ['test_pet_auto_continuous_server_20261005.js',
             'test_pet_package_unlimited_20261005.js', 'test_pet_auto_access_20261005.js']
    with client.open_sftp() as sf:
        for name in names:
            target = manifest['stage'] + '/' + name
            data = (release.ROOT / '_ai_workbench/tools' / name).read_bytes()
            with sf.open(target, 'wb') as handle:
                handle.write(data)
            if release.rh(client, target) != release.sha(data):
                raise RuntimeError('TEST_STAGE_HASH:' + name)
    env = ('FEATURE_APP=' + shlex.quote(release.APP)
           + ' PET_PACKAGE_RESOLVER=' + shlex.quote(release.APP + '/src/services/RechargeRewardResolver.js')
           + ' PET_GRID_SKINS=' + shlex.quote(manifest['stage'] + '/skins.json')
           + ' PET_GRID_MAIN=' + shlex.quote(release.GAME + '/js/main.min_drop100.js')
           + ' PET_GRID_CLIENT=' + shlex.quote(manifest['stage'] + '/candidate/webgame/game/js/lhs-pet-grid48-v1.js'
                                             if candidate else release.GAME + '/js/lhs-pet-grid48-v1.js'))
    results = {}
    for name in names + ['test_client.js']:
        raw = release.run(client, env + ' node -r ' + shlex.quote(loader) + ' ' + shlex.quote(manifest['stage'] + '/' + name))
        # Package/access fixtures print one final JSON line after named checks.
        obj = json.loads(raw if name in [names[0], 'test_client.js'] else raw.strip().splitlines()[-1])
        if 'checks' not in obj:
            raise RuntimeError('TEST_RESULT_INVALID:' + name)
        results[name] = obj
    raw = release.run(client, 'node -r ' + shlex.quote(loader) + ' -', """
const c=require(APP+'/src/services/ConfigService'),t=c.loadAllTables(),b=t.PetBaseConfig;
if(b.initialField!==48||b.fieldMax!==48||b.fieldConsume.length!==0||b.freeFieldCount!==48)throw Error('GRID_CONFIG_WRONG');
if(JSON.stringify(t.SystemConfig[229].conditions)!==JSON.stringify(t.SystemConfig[206].conditions)||t.SystemConfig[229].openDay!==0)throw Error('AUTO_ACCESS_WRONG');
for(const id of [4000004,4000103])if(t.ShopConfig[id].limit!==0||t.ShopConfig[id].limitType!==0)throw Error('PET_PACKAGE_LIMIT_WRONG');
console.log(JSON.stringify({fieldMax:b.fieldMax,autoConditions:t.SystemConfig[229].conditions,autoOpenDay:t.SystemConfig[229].openDay,packages:[4000004,4000103].map(id=>({id,limit:t.ShopConfig[id].limit,limitType:t.ShopConfig[id].limitType,price:t.PayConfig[id],rewards:t.ShopConfig[id].rewards}))}));
""".replace('APP', json.dumps(release.APP)))
    results['runtimeConfig'] = json.loads(raw)
    manifest['candidateTests' if candidate else 'installedTests'] = results
    release.save(manifest)
    print(json.dumps({'step': 'tests', 'candidate': candidate,
                      'checks': {n: len(o['checks']) if isinstance(o['checks'], list) else o['checks']
                                 for n, o in results.items() if 'checks' in o}}, ensure_ascii=False), flush=True)


release.tests = tests

if __name__ == '__main__':
    release.main()
