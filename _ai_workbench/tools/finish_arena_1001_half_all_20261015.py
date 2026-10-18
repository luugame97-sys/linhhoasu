import json, time
from pathlib import Path
from skin_incident_remote import connect, run

OUT=Path(__file__).resolve().parents[1]/'temp/arena_1001_half_all_20261015'
VERIFY=r'''
const fs=require('fs'),assert=require('assert'),crypto=require('crypto'),zlib=require('zlib');
const {BinJsonUtil,ByteArray}=require('/linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');
const receipt=JSON.parse(fs.readFileSync('/linhhoasu/_ai_workbench/temp/arena_1001_half_all_20261015.log','utf8').split('RECEIPT=')[1]);
const counts={ArenaDayRankRewardConfig:[2500,2000,1500,1000,800,500,300,200,100,50],ArenaWeeklyRankRewardConfig:[7500,6000,4500,3750,3750,3000,3000,2700,2250,1500]};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function chunks(b){let out={},o=0;while(o<b.length){const start=o,n=b[o++],name=b.toString('utf8',o,o+n);o+=n;const len=b.readUInt32BE(o);o+=4;out[name]={raw:b.subarray(start,o+len),packed:b.subarray(o,o+len)};o+=len;}assert.equal(o,b.length);return out;}
function decode(x){const b=zlib.inflateSync(x.packed);return BinJsonUtil.readFullJson(new ByteArray(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)));}
for(const f of receipt.files){const b=fs.readFileSync('/linhhoasu/'+f.rel),old=fs.readFileSync(receipt.backup+'/'+f.rel.replaceAll('/','__')+'.before');assert.equal(sha(b),f.after);assert.equal(sha(old),f.before);const a=chunks(old),c=chunks(b);assert.deepStrictEqual(Object.keys(c),Object.keys(a));for(const name of Object.keys(a)){if(!counts[name]){assert(a[name].raw.equals(c[name].raw),name);continue;}const before=decode(a[name]),after=decode(c[name]);assert.equal(Object.keys(after).length,10);Object.keys(after).forEach((k,i)=>{assert.equal(after[k].rewards.find(x=>x.id===1001).count,counts[name][i]);const expected=JSON.parse(JSON.stringify(before[k]));expected.rewards.find(x=>x.id===1001).count=counts[name][i];assert.deepStrictEqual(after[k],expected);});}}
assert.equal(sha(fs.readFileSync('/linhhoasu/webgame/game/index.html')),receipt.index.after);
const C=require('/linhhoasu/lhs/newServer/src/services/ConfigService');C.reload();const runtime={};for(const [name,values] of Object.entries(counts)){runtime[name]=Object.values(C.get(name)).map(x=>x.rewards.find(r=>r.id===1001).count);assert.deepStrictEqual(runtime[name],values);}
console.log('VERIFIED='+JSON.stringify({...receipt,runtime,unrelatedTablesUnchanged:true,directPlayerWrites:0}));
'''

with connect() as c:
    result=run(c,'node -',VERIFY)
    report=json.loads(result.split('VERIFIED=')[1]);OUT.mkdir(parents=True,exist_ok=True)
    report['readiness']=[]
    for sid,port in zip(range(1001,1009),[8080,8083,8084,8085,8086,8087,8088,8089]):
        run(c,f'pm2 restart lhs-s{sid} >/dev/null')
        for attempt in range(60):
            try:
                q=json.loads(run(c,f'curl -fsS --max-time 3 http://127.0.0.1:{port}/ready'))
                if q.get('checks',{}).get('mongo') and q['checks'].get('redis'):
                    report['readiness'].append({'server':sid,'ready':q});print(f'READY:{sid}',flush=True);break
            except Exception: pass
            time.sleep(1)
        else: raise RuntimeError(f'READINESS_FAILED:{sid}')
        (OUT/'deployment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    report['result']='PASS'
    (OUT/'deployment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'result':'PASS','runtime':report['runtime'],'backup':report['backup'],'readiness':len(report['readiness'])}),flush=True)
