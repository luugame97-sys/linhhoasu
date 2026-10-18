import concurrent.futures
import hashlib
import importlib.util
import json
import re
import shlex
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('h', ROOT / '_ai_workbench/tools/release_artifact_quench_fix_20261009.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
q = shlex.quote
web = '/linhhoasu/webgame/game'
ssh = h.connect()
evidence = {'playerWrites': 0}
try:
    # Only the two rollout-created URLs, absent after rollback, become inert stubs.
    for name in ['lhs-fishing-x10-v1.js', 'lhs-fishing-x10-v2.js']:
        target = web + '/js/' + name
        data = (ROOT / 'linhhoasu/webgame/game/js' / name).read_bytes()
        with ssh.open_sftp() as sf:
            try:
                with sf.open(target, 'rb') as f:
                    if f.read() != data: raise RuntimeError('Unexpected existing addon: ' + name)
            except FileNotFoundError:
                with sf.open(target + '.removed.tmp', 'wb') as f: f.write(data)
                h.run(ssh, 'chmod 644 ' + q(target + '.removed.tmp') + ' && chown root:www ' + q(target + '.removed.tmp') + ' && mv -- ' + q(target + '.removed.tmp') + ' ' + q(target))
        assert h.rh(ssh, target) == hashlib.sha256(data).hexdigest()
        h.run(ssh, 'node --check ' + q(target))
    # Read-only count of persisted entitlement and purchase receipts on the pilot.
    code = r'''
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:7000});
await c.connect();try{const p=c.db('lhs_s1001').collection('players');
const q={$or:[{'rechargeInfo.monthCards.11000022':{$exists:true}},{'other_attr_info.featureReceipts.rows.data.id':11000022}]};
const rows=await p.find(q,{projection:{_id:0,userId:1,name:1,'rechargeInfo.monthCards.11000022':1,'other_attr_info.featureReceipts.rows':1}}).toArray();
console.log(JSON.stringify({playersWithX10:rows.length,rows:rows.map(r=>({userId:r.userId,name:r.name,expiresAt:r.rechargeInfo?.monthCards?.[11000022]||0,receiptCount:(r.other_attr_info?.featureReceipts?.rows||[]).filter(x=>x.data?.id===11000022).length}))}));
}finally{await c.close()}})().catch(e=>{console.error(e.message);process.exit(1)});
'''
    evidence['purchases'] = json.loads(h.run(ssh, 'node -e ' + q(code)))
    probe = r'''
const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');c.loadAllTables();
console.log(JSON.stringify({payConfigX10:!!c.get('PayConfig')[11000022],shopConfigX10:!!c.get('ShopConfig')[11000022]}));
'''
    evidence['config'] = json.loads(h.run(ssh, 'node -e ' + q(probe)).strip().splitlines()[-1])
    evidence['processes'] = h.procs(ssh)
    evidence['ready'] = h.ready(ssh, 8080)
    with ssh.open_sftp() as sf:
        with sf.open(web + '/index.html', 'rb') as f: origin = f.read()
    assert hashlib.sha256(origin).hexdigest() == 'fd9611f0b4b046167c22c3850e87ecfdb0452543748527c260eefa00999b4f32'
finally:
    ssh.close()

print(json.dumps({'ready': evidence['ready'], 'purchases': evidence['purchases'], 'config': evidence['config']}), flush=True)

def get(url, method='GET'):
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}, method=method)
    with urllib.request.urlopen(request, timeout=25) as response:
        return response.status, response.read(), response.headers.get('Content-Type', '')

status, public, mime = get('https://linhhoasu.lol/')
assert status == 200 and b'lhs-fishing-x10' not in public
assert b'lhs-fishing-x10' not in public
refs = sorted(set(re.findall(rb'"(js/[^"\s]+\.js(?:\?[^"\s]*)?)"', public)))
def verify(ref):
    url = 'https://linhhoasu.lol/' + ref.decode()
    status, data, mime = get(url, 'HEAD')
    assert status == 200 and ('javascript' in mime or 'ecmascript' in mime), (url, status, mime)
    return {'script': ref.decode(), 'status': status, 'mime': mime}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    evidence['scripts'] = list(pool.map(verify, refs))
evidence['indexHash'] = hashlib.sha256(public).hexdigest()
evidence['result'] = 'PASS'
(ROOT / '_ai_workbench/temp/fishing_x10_v2_20261011/removal_verified.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'result': evidence['result'], 'scripts': len(refs), 'indexHash': evidence['indexHash'], 'ready': evidence['ready'], 'purchases': evidence['purchases'], 'config': evidence['config']}))
