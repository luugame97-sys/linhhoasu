"""Read back deployed catalog, managed public assets and seven-node readiness."""
import hashlib
import json
import re
import shlex
import urllib.request
from pathlib import Path
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/gem_choice_shop_20261005'
APP = '/linhhoasu/lhs/newServer'


def main():
    manifest = json.loads((OUT / 'deployment.json').read_text(encoding='utf-8'))
    baseline = json.loads((OUT / 'preflight.json').read_text(encoding='utf-8'))
    script = r"""
const app=APP,fs=require('fs'),cp=require('child_process');
const pm=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})),p=pm.find(p=>p.name==='lhs-s1001');
const env={...require(app+'/node_modules/dotenv').parse(fs.readFileSync(app+'/.env')),...p.pm2_env.env,...p.pm2_env};
for(const k of ['CONFIG_BIN_PATH','ROLE_LEVEL_2000_ENABLED','DROP_LEVEL_46_ENABLED','DROP_LEVEL_100_ENABLED','FASHION_CONTENT_OVERLAY_PATH','FASHION_CHOICE_OVERLAY_PATH','FASHION_CHOICE_STARS_OVERLAY_PATH'])if(env[k]!=null)process.env[k]=String(env[k]);
require.cache[require.resolve(app+'/src/logger')]={exports:{info(){},warn(){},error(){},debug(){}}};
const tables=require(app+'/src/services/ConfigService').loadAllTables(),policy=require(app+'/src/config/gemChoiceShop').policy;
const offers=policy.offers.map(o=>({level:o.level,bagId:o.bagId,shopId:o.shopId,price:tables.ShopConfig[o.shopId].cost,
 rewards:tables.ShopConfig[o.shopId].rewards,choices:tables.AssetsUseConfig[o.bagId].rewards,limit:tables.ShopConfig[o.shopId].limit}));
const nodes=[['lhs-s1001',8080],['lhs-s1002',8083],['lhs-s1003',8084],['lhs-s1004',8085],['lhs-s1005',8086],['lhs-s1006',8087],['lhs-s1007',8088]];
const health=nodes.map(([name,port])=>{try{return{name,body:JSON.parse(cp.execFileSync('curl',['-fsS','--max-time','20','http://127.0.0.1:'+port+'/ready'],{encoding:'utf8'}))}}catch(error){return{name,error:'READINESS_TIMEOUT_OR_ERROR'}}});
console.log(JSON.stringify({at:new Date().toISOString(),offers,oldSix:Array.from({length:6},(_,i)=>tables.ShopConfig[10000001+i]),oldDisabledShop:tables.ShopConfig[10000007]||null,health,processes:pm.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,started:p.pm2_env.pm_uptime})),directPlayerWrites:0}));
""".replace('APP,', json.dumps(APP) + ',')
    with connect() as client:
        state = json.loads(run(client, 'cd ' + APP + ' && node -', script))
        effective = {rel: record['after'] for rel, record in manifest['files'].items()}
        followup_path = ROOT / '_ai_workbench/temp/gem_exchange_day_20261006/deployment.json'
        if followup_path.exists():
            followup = json.loads(followup_path.read_text(encoding='utf-8'))
            assert followup['status'] in ['DEPLOYED_NEEDS_NATIVE_UI', 'DEPLOYED_RUNTIME_VERIFIED']
            effective.update({rel: record['after'] for rel, record in followup['files'].items()})
        static_path = ROOT / '_ai_workbench/temp/gem_shop_static_20261006/deployment.json'
        if static_path.exists():
            static = json.loads(static_path.read_text(encoding='utf-8'))
            assert static['status'] == 'DEPLOYED_VERIFIED'
            effective.update({rel: record['after'] for rel, record in static['files'].items()})
        actual = {}
        for rel, expected in effective.items():
            digest = run(client, 'sha256sum ' + shlex.quote('/linhhoasu/' + rel)).split()[0]
            assert digest == expected, rel + '_INSTALLED_HASH_MISMATCH'
            actual[rel] = digest
        state['effectiveInstalledHashes'] = actual
    assert state['oldSix'] == [baseline['catalog']['ShopConfig'][str(i)] for i in range(10000001, 10000007)]
    assert state['oldDisabledShop'] is None
    prices = [9720, 38880, 116640, 349920, 1049760, 3149280, 9447840]
    for offer, expected in zip(state['offers'], prices):
        assert offer['price'] == [{'id': 1, 'count': expected}]
        assert offer['limit'] == 0
        assert len(offer['choices']) == (4 if offer['level'] == 6 else 6)
    assert sum(len(o['choices']) for o in state['offers']) == 40
    state['allReady'] = all(r.get('body', {}).get('status') == 'ok' and r.get('body', {}).get('checks', {}).get('mongo') is True
                           and r.get('body', {}).get('checks', {}).get('redis') is True for r in state['health'])
    protected = {p['name']: p for p in manifest['predeployProcesses'] if not p['name'].startswith('lhs-s100')}
    assert protected == {p['name']: p for p in state['processes'] if p['name'] in protected}
    public = []
    for name, url, rel in [
        ('game', 'https://linhhoasu.lol/index.html?v=20261006_gem_choice_shop_v2', 'webgame/game/index.html'),
        ('addon', 'https://linhhoasu.lol/js/lhs-gem-choice-shop-v1.js?v=20261006_gem_choice_shop_v2', 'webgame/game/js/lhs-gem-choice-shop-v1.js'),
        ('webgm', 'https://linhhoasu.lol/web-panel/login.php', None),
    ]:
        request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache', 'User-Agent': 'LHS-scoped-postcheck'})
        with urllib.request.urlopen(request, timeout=20) as response:
            body, status = response.read(), response.status
        record = {'name': name, 'http': status, 'bytes': len(body)}
        if rel:
            managed = body
            if name == 'game':
                managed, count = re.subn(rb'<script type="module" src="https://static\.cloudflareinsights\.com/beacon[^\n]*</script>\n', b'', body, count=1)
                record['cloudflareBeaconInjected'] = count == 1
            record['managedMatches'] = hashlib.sha256(managed).hexdigest() == effective[rel]
            assert record['managedMatches'], name + '_HASH_MISMATCH'
        else:
            record['hasLoginForm'] = b'<form' in body
            assert record['hasLoginForm']
        public.append(record)
    state['public'] = public
    state['oldSixPreserved'] = True
    state['unrelatedProcessesPreserved'] = True
    (OUT / 'postcheck.json').write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'offers': state['offers'], 'allReady': state['allReady'], 'health': state['health'], 'public': public,
                      'oldSixPreserved': True, 'unrelatedProcessesPreserved': True}, ensure_ascii=False))


if __name__ == '__main__':
    main()
