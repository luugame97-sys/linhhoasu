from __future__ import annotations

import datetime as dt
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/cross_arena_1001_half_20261015'
RECEIPT = OUT / 'deployment.json'
NODES = {'lhs-s1001': 8080, 'lhs-s1002': 8083, 'lhs-s1003': 8084, 'lhs-s1004': 8085,
         'lhs-s1005': 8086, 'lhs-s1006': 8087, 'lhs-s1007': 8088, 'lhs-s1008': 8089}

REMOTE_JS = r'''
'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto'),assert=require('assert');
const {BinJsonUtil,ByteArray}=require('/linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');
const root='/linhhoasu/';
const files=['webgame/game/update/resource/assets/excel/config_fashion_20260909.bin','lhs/update/resource/assets/excel/config_fashion_20260909.bin','webgame/game/update/resource/assets/excel/config_e5ac72c2.bin','lhs/update/resource/assets/excel/config_e5ac72c2.bin'];
const day=[3750,3000,2250,1500,1200,750,450,300,150,75],week=[11250,9000,6750,5625,5625,4500,4500,4050,3375,2250];
function sha(b){return crypto.createHash('sha256').update(b).digest('hex')}
function decode(b){let t=[],o=0;while(o<b.length){let s=o,n=b[o++],name=b.toString('utf8',o,o+n);o+=n;let l=b.readUInt32BE(o);o+=4;let raw=b.subarray(o,o+l);o+=l;let x=zlib.inflateSync(raw);t.push({name,raw:b.subarray(s,o),value:BinJsonUtil.readFullJson(new ByteArray(x.buffer.slice(x.byteOffset,x.byteOffset+x.byteLength)))});}assert.equal(o,b.length);return t}
function chunk(name,v){let n=Buffer.from(name),o=new ByteArray(undefined,1024*1024);BinJsonUtil.json2bin(v,o);let c=zlib.deflateSync(Buffer.from(o.buffer),{level:6}),h=Buffer.alloc(1+n.length+4);h.writeUInt8(n.length);n.copy(h,1);h.writeUInt32BE(c.length,1+n.length);return Buffer.concat([h,c])}
function transform(table,counts){const out=JSON.parse(JSON.stringify(table));Object.keys(out).forEach((k,i)=>{const row=out[k];const item=row.rewards.find(r=>Number(r.id)===1001);assert(item,`1001_MISSING_${k}`);assert.equal(Number(item.count),counts[i]*2,`BASELINE_${k}`);item.count=counts[i]});return out}
const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14),backup=root+'_ai_workbench/backups/cross_arena_1001_half_20261015_'+stamp,changes=[];fs.mkdirSync(backup,{recursive:true});
for(const rel of files){const f=root+rel,b=fs.readFileSync(f),before=sha(b),ts=decode(b),all=Object.fromEntries(ts.map(x=>[x.name,x.value]));const d=transform(all.CrossArenaDayRankRewardConfig,day),w=transform(all.CrossArenaWeeklyRankRewardConfig,week);const afterBytes=Buffer.concat(ts.map(x=>x.name==='CrossArenaDayRankRewardConfig'?chunk(x.name,d):x.name==='CrossArenaWeeklyRankRewardConfig'?chunk(x.name,w):x.raw));const check=decode(afterBytes);assert.equal(check.find(x=>x.name==='CrossArenaDayRankRewardConfig').value[1].rewards.find(r=>Number(r.id)===1001).count,3750);assert.equal(check.find(x=>x.name==='CrossArenaWeeklyRankRewardConfig').value[1].rewards.find(r=>Number(r.id)===1001).count,11250);const bp=path.join(backup,rel.replaceAll('/','__')+'.before');fs.writeFileSync(bp,b,{flag:'wx'});changes.push({rel,f,b,afterBytes,before,after:sha(afterBytes),bp})}
const index=root+'webgame/game/index.html',ib=fs.readFileSync(index),old='20261014_cross_arena_rewards_v2',next='20261015_cross_arena_1001_half_v1';assert.equal((ib.toString().match(new RegExp(old,'g'))||[]).length,1);const ia=Buffer.from(ib.toString().replace(old,next));fs.writeFileSync(path.join(backup,'index.html.before'),ib,{flag:'wx'});
for(const c of changes){assert.equal(sha(fs.readFileSync(c.f)),c.before,'CAS_BEFORE_SWAP');const stage=c.f+'.cross_arena_1001_half';fs.writeFileSync(stage,c.afterBytes,{flag:'wx'});fs.renameSync(stage,c.f);assert.equal(sha(fs.readFileSync(c.f)),c.after)}
const stage=index+'.cross_arena_1001_half';fs.writeFileSync(stage,ia,{flag:'wx'});fs.renameSync(stage,index);assert.equal(sha(fs.readFileSync(index)),sha(ia));
console.log('RECEIPT='+JSON.stringify({backup,files:changes.map(c=>({rel:c.rel,before:c.before,after:c.after})),index:{before:sha(ib),after:sha(ia)},playerWrites:0,productionWrites:0}));
'''

def main() -> None:
    if RECEIPT.exists():
        raise RuntimeError(f'RECEIPT_EXISTS:{RECEIPT}')
    OUT.mkdir(parents=True, exist_ok=True)
    report = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'scope': 'CrossArena S1-S8', 'playerWrites': 0, 'productionWrites': 0, 'restarts': []}
    with connect() as client:
        sftp = client.open_sftp()
        remote_script = '/linhhoasu/_ai_workbench/temp/cross_arena_1001_half_20261015.js'
        remote_log = '/linhhoasu/_ai_workbench/temp/cross_arena_1001_half_20261015.log'
        try:
            with sftp.open(remote_script, 'wb') as f: f.write(REMOTE_JS.encode())
            run(client, f'rm -f {remote_log}; nohup node {remote_script} >{remote_log} 2>&1 & echo $!')
            receipt = None
            for _ in range(90):
                time.sleep(2)
                out = run(client, f"grep -E 'RECEIPT=|Error|AssertionError|SyntaxError' {remote_log} | tail -20 || true")
                if 'RECEIPT=' in out: receipt = json.loads(out.split('RECEIPT=', 1)[1].strip().splitlines()[0]); break
                if any(x in out for x in ('Error', 'AssertionError', 'SyntaxError')): raise RuntimeError(out)
            if receipt is None: raise RuntimeError(f'DEPLOY_TIMEOUT:{remote_log}')
            report.update(receipt)
            def ready(name):
                last = None
                for _ in range(60):
                    try:
                        last = json.loads(run(client, f'curl -fsS --max-time 5 http://127.0.0.1:{NODES[name]}/ready'))
                        if last.get('status') == 'ok' and last.get('checks', {}).get('mongo') is True and last.get('checks', {}).get('redis') is True: return last
                    except Exception: pass
                    time.sleep(1)
                raise RuntimeError(f'READY_TIMEOUT:{name}:{last}')
            report['preReady'] = {n: ready(n) for n in NODES}
            for name in NODES:
                run(client, f'pm2 restart {name} --update-env'); report['restarts'].append({'name': name, 'ready': ready(name)})
            report['postReady'] = {n: ready(n) for n in NODES}
            js = "const C=require('/linhhoasu/lhs/newServer/src/services/ConfigService');C.reload();const d=C.get('CrossArenaDayRankRewardConfig'),w=C.get('CrossArenaWeeklyRankRewardConfig');const a=Object.values(d).map(x=>x.rewards.find(r=>r.id===1001).count),b=Object.values(w).map(x=>x.rewards.find(r=>r.id===1001).count);if(JSON.stringify(a)!==JSON.stringify([3750,3000,2250,1500,1200,750,450,300,150,75])||JSON.stringify(b)!==JSON.stringify([11250,9000,6750,5625,5625,4500,4500,4050,3375,2250]))process.exit(2);console.log(JSON.stringify({day:a,week:b,playerWrites:0}));"
            report['runtimeReadback'] = json.loads(run(client, 'node -', js).splitlines()[-1]); report['result'] = 'PASS'; RECEIPT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'); print(json.dumps({'result':'PASS','scope':'CrossArena S1-S8','backup':receipt['backup'],'playerWrites':0,'productionWrites':0}))
        finally: sftp.close()

if __name__ == '__main__': main()
