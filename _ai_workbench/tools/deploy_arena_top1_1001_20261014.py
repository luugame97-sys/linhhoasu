from __future__ import annotations

import datetime as dt
import hashlib
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/arena_top1_1001_20261014'
RECEIPT = OUT / 'deployment.json'

REMOTE_JS = r'''
'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto'),assert=require('assert');
const {BinJsonUtil,ByteArray}=require('/linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');
const root='/linhhoasu/';
const files=[
  'webgame/game/update/resource/assets/excel/config_fashion_20260909.bin',
  'lhs/update/resource/assets/excel/config_fashion_20260909.bin',
  'webgame/game/update/resource/assets/excel/config_e5ac72c2.bin',
  'lhs/update/resource/assets/excel/config_e5ac72c2.bin',
];
function sha(b){return crypto.createHash('sha256').update(b).digest('hex');}
function decode(b){let t=[],o=0;while(o<b.length){let s=o,n=b[o++],name=b.toString('utf8',o,o+n);o+=n;let l=b.readUInt32BE(o);o+=4;let raw=b.subarray(o,o+l);o+=l;let x=zlib.inflateSync(raw);t.push({name,raw:b.subarray(s,o),value:BinJsonUtil.readFullJson(new ByteArray(x.buffer.slice(x.byteOffset,x.byteOffset+x.byteLength)))});}assert.equal(o,b.length,'BINARY_TRAILING_BYTES');return t;}
function chunk(name,v){let n=Buffer.from(name),o=new ByteArray(undefined,1024*1024);BinJsonUtil.json2bin(v,o);let c=zlib.deflateSync(Buffer.from(o.buffer),{level:6}),h=Buffer.alloc(1+n.length+4);h.writeUInt8(n.length);n.copy(h,1);h.writeUInt32BE(c.length,1+n.length);return Buffer.concat([h,c]);}
function clone(v){return JSON.parse(JSON.stringify(v));}
function update(name, source){
  const table=source[name], expected=name==='ArenaDayRankRewardConfig'?5000:15000, target=expected/2;
  assert(table && table[1] && Array.isArray(table[1].rewards),name+'_TOP1_MISSING');
  const top=table[1], item=top.rewards.find(r=>Number(r.id)===1001);
  assert(item && Number(item.count)===expected,name+'_TOP1_BASELINE:'+JSON.stringify(item));
  const out=clone(table); out[1].rewards=out[1].rewards.map(r=>Number(r.id)===1001?{...r,count:target}:r);
  return out;
}
const stamp=dtStamp();
function dtStamp(){const d=new Date();return d.toISOString().replace(/[-:TZ.]/g,'').slice(0,14);}
const backup=root+'_ai_workbench/backups/arena_top1_1001_20261014_'+stamp;
fs.mkdirSync(backup,{recursive:true});
const changes=[];
for(const rel of files){
  const f=root+rel,b=fs.readFileSync(f),before=sha(b),tables=decode(b);let day,week;
  const out=tables.map(x=>{if(x.name==='ArenaDayRankRewardConfig'){day=update(x.name,Object.fromEntries(tables.map(y=>[y.name,y.value])));return chunk(x.name,day);}if(x.name==='ArenaWeeklyRankRewardConfig'){week=update(x.name,Object.fromEntries(tables.map(y=>[y.name,y.value])));return chunk(x.name,week);}return x.raw;});
  assert(day&&week,'TARGET_TABLES_MISSING');
  const afterBytes=Buffer.concat(out), check=decode(afterBytes);
  assert.equal(check.find(x=>x.name==='ArenaDayRankRewardConfig').value[1].rewards.find(r=>Number(r.id)===1001).count,2500);
  assert.equal(check.find(x=>x.name==='ArenaWeeklyRankRewardConfig').value[1].rewards.find(r=>Number(r.id)===1001).count,7500);
  const safe=rel.replace(/^\//,'').replaceAll('/','__'),bp=path.join(backup,safe+'.before');fs.writeFileSync(bp,b,{flag:'wx'});
  changes.push({rel,f,b,afterBytes,before,after:sha(afterBytes),backup:bp});
}
const index=root+'webgame/game/index.html',ib=fs.readFileSync(index),old="20261014_cross_arena_rewards_v1",next="20261014_cross_arena_rewards_v2";
assert.equal((ib.toString().match(new RegExp(old,'g'))||[]).length,1,'INDEX_CACHE_MARKER_BASELINE');
const ia=Buffer.from(ib.toString().replace(old,next));const indexBefore=sha(ib),indexAfter=sha(ia);fs.writeFileSync(path.join(backup,'index.html.before'),ib,{flag:'wx'});
for(const c of changes){assert.equal(sha(fs.readFileSync(c.f)),c.before,'CAS_BEFORE_SWAP:'+c.rel);const stage=c.f+'.arena_top1_1001_'+stamp;fs.writeFileSync(stage,c.afterBytes,{flag:'wx'});fs.renameSync(stage,c.f);assert.equal(sha(fs.readFileSync(c.f)),c.after,'LIVE_HASH:'+c.rel);}
const indexStage=index+'.arena_top1_1001_'+stamp;fs.writeFileSync(indexStage,ia,{flag:'wx'});fs.renameSync(indexStage,index);assert.equal(sha(fs.readFileSync(index)),indexAfter,'INDEX_HASH');
console.log('ARENA_TOP1_RECEIPT='+JSON.stringify({backup,files:changes.map(c=>({rel:c.rel,before:c.before,after:c.after})),index:{before:indexBefore,after:indexAfter},playerWrites:0,productionWrites:0}));
'''

NODES = {
    'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085,
    'lhs-s1005': 8086, 'lhs-s1006': 8087, 'lhs-s1007': 8088, 'lhs-s1008': 8089,
}

def main() -> None:
    if RECEIPT.exists():
        raise RuntimeError('RECEIPT_EXISTS:' + str(RECEIPT))
    OUT.mkdir(parents=True, exist_ok=True)
    report = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'scope': 'S1-S8', 'playerWrites': 0, 'productionWrites': 0, 'restarts': []}
    with connect() as client:
        sftp = client.open_sftp()
        remote_script = '/linhhoasu/_ai_workbench/temp/arena_top1_1001_20261014.js'
        remote_log = '/linhhoasu/_ai_workbench/temp/arena_top1_1001_20261014.log'
        try:
            with sftp.open(remote_script, 'wb') as f:
                f.write(REMOTE_JS.encode())
            run(client, f'rm -f {remote_log}; nohup node {remote_script} >{remote_log} 2>&1 & echo $!')
            receipt = None
            for _ in range(90):
                time.sleep(2)
                out = run(client, f"grep -E 'ARENA_TOP1_RECEIPT=|Error|AssertionError|SyntaxError' {remote_log} | tail -20 || true")
                if 'ARENA_TOP1_RECEIPT=' in out:
                    receipt = json.loads(out.split('ARENA_TOP1_RECEIPT=', 1)[1].strip().splitlines()[0]); break
                if any(x in out for x in ['Error', 'AssertionError', 'SyntaxError']):
                    raise RuntimeError(out)
            if receipt is None:
                raise RuntimeError('DEPLOY_TIMEOUT:' + remote_log)
            report.update(receipt)
            def ready(name: str) -> dict:
                deadline = time.monotonic() + 60
                last = None
                while time.monotonic() < deadline:
                    try:
                        last = json.loads(run(client, f'curl -fsS --max-time 5 http://127.0.0.1:{NODES[name]}/ready'))
                        if last.get('status') == 'ok' and last.get('checks', {}).get('mongo') is True and last.get('checks', {}).get('redis') is True:
                            return last
                    except Exception:
                        pass
                    time.sleep(1)
                raise RuntimeError('READY_TIMEOUT:' + name + ':' + json.dumps(last))
            report['preReady'] = {n: ready(n) for n in NODES}
            for name in NODES:
                run(client, 'pm2 restart ' + name + ' --update-env')
                report['restarts'].append({'name': name, 'ready': ready(name)})
            report['postReady'] = {n: ready(n) for n in NODES}
            js = "const C=require('/linhhoasu/lhs/newServer/src/services/ConfigService');C.reload();const d=C.get('ArenaDayRankRewardConfig')[1].rewards,w=C.get('ArenaWeeklyRankRewardConfig')[1].rewards;if(d.find(x=>x.id===1001).count!==2500||w.find(x=>x.id===1001).count!==7500)process.exit(2);console.log(JSON.stringify({day:d,week:w,playerWrites:0}));"
            report['runtimeReadback'] = json.loads(run(client, 'node -', js).splitlines()[-1])
            report['result'] = 'PASS'
            RECEIPT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            print(json.dumps({'result': 'PASS', 'scope': 'S1-S8', 'backup': receipt['backup'], 'restarts': list(NODES), 'playerWrites': 0, 'productionWrites': 0}))
        finally:
            sftp.close()

if __name__ == '__main__':
    main()
