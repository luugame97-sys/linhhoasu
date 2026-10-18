import sys,time,json,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from skin_incident_remote import connect,run

remote=r'''const fs=require('fs'),zlib=require('zlib'),crypto=require('crypto'),assert=require('assert');const {BinJsonUtil,ByteArray}=require('/linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');
const root='/linhhoasu/';const files=['webgame/game/update/resource/assets/excel/config_fashion_20260909.bin','lhs/update/resource/assets/excel/config_fashion_20260909.bin','webgame/game/update/resource/assets/excel/config_e5ac72c2.bin','lhs/update/resource/assets/excel/config_e5ac72c2.bin'];
function decode(b){let t=[],o=0;while(o<b.length){let s=o,n=b[o++],name=b.toString('utf8',o,o+n);o+=n;let l=b.readUInt32BE(o);o+=4;let raw=b.subarray(o,o+l);o+=l;let x=zlib.inflateSync(raw);t.push({name,raw:b.subarray(s,o),value:BinJsonUtil.readFullJson(new ByteArray(x.buffer.slice(x.byteOffset,x.byteOffset+x.byteLength)))});}assert.equal(o,b.length);return t;}
function chunk(name,v){let n=Buffer.from(name),o=new ByteArray(undefined,1024*1024);BinJsonUtil.json2bin(v,o);let c=zlib.deflateSync(Buffer.from(o.buffer),{level:6}),h=Buffer.alloc(1+n.length+4);h.writeUInt8(n.length);n.copy(h,1);h.writeUInt32BE(c.length,1+n.length);return Buffer.concat([h,c]);}
const dayGem=[10,8,5,3,3,3,2,2,2,2],weekGem=[30,24,15,9,9,9,6,6,6,6];const dayT=[7500,6000,4500,3000,2400,1500,900,600,300,150],weekT=[22500,18000,13500,11250,11250,9000,9000,8100,6750,4500];
function transform(name,v){let isDay=name==='CrossArenaDayRankRewardConfig',g=isDay?dayGem:weekGem,t=isDay?dayT:weekT;return Object.fromEntries(Object.entries(v).map(([k,row],i)=>{let r=row.rewards.map(x=>x.id===90078?{id:100098,count:g[i]}:x.id===1?{id:1,count:x.count*10}:{...x});assert(!r.some(x=>x.id===1001));r.push({id:1001,count:t[i]});return [k,{...row,rewards:r}]}));}
function verify(d,w){assert.equal(d[1].rewards.find(x=>x.id===100098).count,10);assert.equal(w[1].rewards.find(x=>x.id===100098).count,30);assert.equal(d[1].rewards.find(x=>x.id===1).count,4000000);assert.equal(w[1].rewards.find(x=>x.id===1).count,20000000);assert.equal(d[1].rewards.find(x=>x.id===1001).count,7500);assert.equal(w[1].rewards.find(x=>x.id===1001).count,22500);}
const stamp=Date.now(),backup=root+'_ai_workbench/backups/cross_arena_rewards_20261014_'+stamp,changes=[];fs.mkdirSync(backup,{recursive:true});
for(const rel of files){let f=root+rel,b=fs.readFileSync(f),ts=decode(b),d,w;let out=ts.map(x=>{if(x.name==='CrossArenaDayRankRewardConfig'){d=transform(x.name,x.value);return chunk(x.name,d)}if(x.name==='CrossArenaWeeklyRankRewardConfig'){w=transform(x.name,x.value);return chunk(x.name,w)}return x.raw});verify(d,w);let after=Buffer.concat(out),check=decode(after);verify(check.find(x=>x.name==='CrossArenaDayRankRewardConfig').value,check.find(x=>x.name==='CrossArenaWeeklyRankRewardConfig').value);let bp=backup+'/'+rel;fs.mkdirSync(require('path').dirname(bp),{recursive:true});fs.writeFileSync(bp,b,{flag:'wx'});changes.push({f,b,after,bp});}
for(const c of changes){let h=crypto.createHash('sha256').update(c.b).digest('hex');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(c.f)).digest('hex'),h);let st=c.f+'.cross-stage';fs.writeFileSync(st,c.after,{flag:'wx'});fs.renameSync(st,c.f);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(c.f)).digest('hex'),crypto.createHash('sha256').update(c.after).digest('hex'));}
const idx=root+'webgame/game/index.html',ib=fs.readFileSync(idx),is=ib.toString();assert.equal(is.split('20261014_arena_rewards_v2').length,2);fs.writeFileSync(backup+'/index.html.before',ib,{flag:'wx'});fs.writeFileSync(idx,is.replace('20261014_arena_rewards_v2','20261014_cross_arena_rewards_v1'));
console.log('RECEIPT:'+JSON.stringify({backup,files:changes.map(c=>({f:c.f,sha256:crypto.createHash('sha256').update(c.after).digest('hex')}))}));'''
with connect() as c:
    s=c.open_sftp();p='/linhhoasu/_ai_workbench/temp/cross_arena_rewards_20261014.js'
    try:
        with s.file(p,'w') as f:f.write(remote)
    finally:s.close()
    log='/linhhoasu/_ai_workbench/temp/cross_arena_rewards_20261014.log';run(c,f"rm -f {log}; nohup node {p} >{log} 2>&1 & echo $!")
    receipt=None
    for _ in range(120):
        time.sleep(2)
        out=run(c,f"grep -E 'RECEIPT:|Error|AssertionError|SyntaxError' {log} | tail -20 || true")
        if 'RECEIPT:' in out:
            receipt=json.loads(out.split('RECEIPT:')[-1].strip());break
        if 'Error' in out or 'AssertionError' in out or 'SyntaxError' in out: raise RuntimeError(out)
    if not receipt: raise RuntimeError('deployment timeout; inspect '+log)
    print(json.dumps(receipt,ensure_ascii=False))
    for sid,port in zip(range(1001,1009),[8080,8083,8084,8085,8086,8087,8088,8089]):
        run(c,f'pm2 restart lhs-s{sid} >/dev/null');ok=False
        for _ in range(20):
            try:
                q=json.loads(run(c,f'curl -fsS --max-time 3 http://127.0.0.1:{port}/ready'))
                if q['checks']['mongo'] and q['checks']['redis']:ok=True;break
            except Exception:pass
            time.sleep(1)
        assert ok,f'readiness failed S{sid}'
    js="const C=require('/linhhoasu/lhs/newServer/src/services/ConfigService');C.reload();const d=C.get('CrossArenaDayRankRewardConfig')[1].rewards,w=C.get('CrossArenaWeeklyRankRewardConfig')[1].rewards;console.log(JSON.stringify({d,w}));if(d.find(x=>x.id===100098).count!==10||w.find(x=>x.id===100098).count!==30||d.find(x=>x.id===1001).count!==7500||w.find(x=>x.id===1001).count!==22500)process.exit(2);"
    print(run(c,'node -',js));print(run(c,"for p in 8080 8083 8084 8085 8086 8087 8088 8089; do printf '%s ' $p; curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:$p/ready; echo; done"))
