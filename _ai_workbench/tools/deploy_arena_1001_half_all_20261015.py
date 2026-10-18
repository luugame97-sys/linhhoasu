import datetime as dt, json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from skin_incident_remote import connect, run
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'_ai_workbench/temp/arena_1001_half_all_20261015'; RECEIPT=OUT/'deployment.json'
REMOTE=r'''const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto'),assert=require('assert');const {BinJsonUtil,ByteArray}=require('/linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');const root='/linhhoasu/';const files=['webgame/game/update/resource/assets/excel/config_fashion_20260909.bin','lhs/update/resource/assets/excel/config_fashion_20260909.bin','webgame/game/update/resource/assets/excel/config_e5ac72c2.bin','lhs/update/resource/assets/excel/config_e5ac72c2.bin'];const day=[2500,2000,1500,1000,800,500,300,200,100,50],week=[7500,6000,4500,3750,3750,3000,3000,2700,2250,1500];function sha(b){return crypto.createHash('sha256').update(b).digest('hex')}function dec(b){let t=[],o=0;while(o<b.length){let s=o,n=b[o++],name=b.toString('utf8',o,o+n);o+=n;let l=b.readUInt32BE(o);o+=4;let raw=b.subarray(o,o+l);o+=l;let x=zlib.inflateSync(raw);t.push({name,raw:b.subarray(s,o),value:BinJsonUtil.readFullJson(new ByteArray(x.buffer.slice(x.byteOffset,x.byteOffset+x.byteLength)))});}assert.equal(o,b.length);return t}function chunk(name,v){let n=Buffer.from(name),o=new ByteArray(undefined,1024*1024);BinJsonUtil.json2bin(v,o);let c=zlib.deflateSync(Buffer.from(o.buffer),{level:6}),h=Buffer.alloc(1+n.length+4);h.writeUInt8(n.length);n.copy(h,1);h.writeUInt32BE(c.length,1+n.length);return Buffer.concat([h,c])}function tr(table,counts){let o=JSON.parse(JSON.stringify(table));Object.keys(o).forEach((k,i)=>{let r=o[k].rewards.find(x=>Number(x.id)===1001);assert(r);assert.equal(Number(r.count),counts[i]*2,'BASELINE_'+k);r.count=counts[i]});return o}const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14),backup=root+'_ai_workbench/backups/arena_1001_half_all_20261015_'+stamp,changes=[];fs.mkdirSync(backup,{recursive:true});for(const rel of files){let f=root+rel,b=fs.readFileSync(f),ts=dec(b),all=Object.fromEntries(ts.map(x=>[x.name,x.value])),d=tr(all.ArenaDayRankRewardConfig,day),w=tr(all.ArenaWeeklyRankRewardConfig,week),after=Buffer.concat(ts.map(x=>x.name==='ArenaDayRankRewardConfig'?chunk(x.name,d):x.name==='ArenaWeeklyRankRewardConfig'?chunk(x.name,w):x.raw));let bp=path.join(backup,rel.replaceAll('/','__')+'.before');fs.writeFileSync(bp,b,{flag:'wx'});changes.push({rel,f,b,after,before:sha(b),post:sha(after),bp})}const idx=root+'webgame/game/index.html',ib=fs.readFileSync(idx),old='20261015_cross_arena_1001_half_v1',next='20261015_arena_1001_half_all_v1';assert.equal((ib.toString().match(new RegExp(old,'g'))||[]).length,1,'INDEX_MARKER');const ia=Buffer.from(ib.toString().replace(old,next));fs.writeFileSync(path.join(backup,'index.html.before'),ib,{flag:'wx'});for(const c of changes){assert.equal(sha(fs.readFileSync(c.f)),c.before,'CAS');let st=c.f+'.arena_1001_half_all';fs.writeFileSync(st,c.after,{flag:'wx'});fs.renameSync(st,c.f);assert.equal(sha(fs.readFileSync(c.f)),c.post)}let st=idx+'.arena_1001_half_all';fs.writeFileSync(st,ia,{flag:'wx'});fs.renameSync(st,idx);console.log('RECEIPT='+JSON.stringify({backup,files:changes.map(c=>({rel:c.rel,before:c.before,after:c.post})),index:{before:sha(ib),after:sha(ia)},playerWrites:0,productionWrites:0}));'''
NODES={'lhs-s1001':8080,'lhs-s1002':8083,'lhs-s1003':8084,'lhs-s1004':8085,'lhs-s1005':8086,'lhs-s1006':8087,'lhs-s1007':8088,'lhs-s1008':8089}
def main():
    global REMOTE
    REMOTE = REMOTE.replace("counts[i]*2,'BASELINE_'+k", "(i===0?counts[i]:counts[i]*2),'BASELINE_'+k")
    if RECEIPT.exists():
        raise RuntimeError('RECEIPT_EXISTS')
    OUT.mkdir(parents=True,exist_ok=True)
    with connect() as c:
        s=c.open_sftp();rp='/linhhoasu/_ai_workbench/temp/arena_1001_half_all_20261015.js';lg='/linhhoasu/_ai_workbench/temp/arena_1001_half_all_20261015.log'
        try:
            with s.open(rp,'w') as f:f.write(REMOTE)
        finally:s.close()
        run(c,f'rm -f {lg}; nohup node {rp} >{lg} 2>&1 & echo $!');receipt=None
        for _ in range(240):
            time.sleep(2);o=run(c,f"grep -E 'RECEIPT=|Error|AssertionError|SyntaxError' {lg} | tail -20 || true")
            if 'RECEIPT=' in o:receipt=json.loads(o.split('RECEIPT=',1)[1].strip().splitlines()[0]);break
            if any(x in o for x in ('Error','AssertionError','SyntaxError')):raise RuntimeError(o)
        if receipt is None:raise RuntimeError('DEPLOY_TIMEOUT:'+lg)
        print(json.dumps(receipt));print('SWAP_DONE')
if __name__=='__main__':main()
