"""Scoped client cache invalidation and read-only release verification."""
import hashlib, json, sys
from pathlib import Path
sys.dont_write_bytecode = True
from skin_incident_remote import connect, run

js = r'''
const fs=require('fs'),crypto=require('crypto'),zlib=require('zlib'),assert=require('assert');
const {BinJsonUtil,ByteArray}=require('/linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');
function decode(p){let b=fs.readFileSync(p),o=0,t={};while(o<b.length){let n=b[o++],name=b.toString('utf8',o,o+n);o+=n;let len=b.readUInt32BE(o);o+=4;let raw=b.subarray(o,o+len);o+=len;t[name]=raw;}return t;}
function value(raw){const b=zlib.inflateSync(raw);return BinJsonUtil.readFullJson(new ByteArray(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)));}
const root='/linhhoasu/',backup=root+'_ai_workbench/backups/arena_rewards_tianyiling_20261014_20261014_083904/';
let out={at:new Date().toISOString(),files:[],playerWrites:0};
for(const rel of ['webgame/game/update/resource/assets/excel/config_fashion_20260909.bin','lhs/update/resource/assets/excel/config_fashion_20260909.bin','webgame/game/update/resource/assets/excel/config_e5ac72c2.bin','lhs/update/resource/assets/excel/config_e5ac72c2.bin']){
 let t=decode(root+rel),day=value(t.ArenaDayRankRewardConfig),week=value(t.ArenaWeeklyRankRewardConfig);
 assert.equal(Object.keys(day).length,10);assert.equal(Object.keys(week).length,10);
 assert.deepStrictEqual(day[1].rewards,[{id:1001,count:5000},{id:1,count:2000000},{id:100097,count:100}]);
 assert.deepStrictEqual(week[1].rewards,[{id:11201,count:1},{id:1001,count:15000},{id:1,count:20000000},{id:100097,count:60}]);
 let unrelated=null;
 if(!rel.startsWith('webgame/game/update/resource/assets/excel/config_e5')){let b=decode(backup+rel.split('/').pop()+'.before');for(let k of Object.keys(b))if(!['ArenaDayRankRewardConfig','ArenaWeeklyRankRewardConfig'].includes(k))assert(t[k].equals(b[k]),'UNRELATED_DRIFT:'+k);unrelated=true;}
 out.files.push({rel,sha256:crypto.createHash('sha256').update(fs.readFileSync(root+rel)).digest('hex'),unrelatedVerified:unrelated});
}
// Recover the web baseline from unchanged chunks and exact saved reward chunks.
// The original backup used colliding basenames; require original full-file hash.
const web=root+'webgame/game/update/resource/assets/excel/config_e5ac72c2.bin';
const oldTables=decode(backup+'config_fashion_20260909.bin.before');
const bytes=fs.readFileSync(web),parts=[];let pos=0;
while(pos<bytes.length){let start=pos,n=bytes[pos++],name=bytes.toString('utf8',pos,pos+n);pos+=n;let len=bytes.readUInt32BE(pos);pos+=4;let raw=bytes.subarray(pos,pos+len);pos+=len;
 if(['ArenaDayRankRewardConfig','ArenaWeeklyRankRewardConfig'].includes(name)){raw=oldTables[name];let header=Buffer.from(bytes.subarray(start,start+1+n+4));header.writeUInt32BE(raw.length,1+n);parts.push(header,raw);}else parts.push(bytes.subarray(start,pos));}
const restored=Buffer.concat(parts),digest=crypto.createHash('sha256').update(restored).digest('hex');
assert.equal(digest,'1e5bbcc2d9680c3fa6f1db3ec2233cc8cc067e6b585c452cf002aaea3c7b80bc','RECOVERED_BASELINE_HASH');
const recovery=backup+'webgame_config_e5ac72c2.bin.before';
if(!fs.existsSync(recovery))fs.writeFileSync(recovery,restored,{flag:'wx',mode:0o600});
assert(fs.readFileSync(recovery).equals(restored));
out.recoveredWebBaselineHash=digest;out.files[2].unrelatedVerified=true;
for(const [name,period] of [['ArenaDayRankRewardConfig','day'],['ArenaWeeklyRankRewardConfig','week']]){
 const old=value(oldTables[name]),current=value(decode(web)[name]);
 for(const [key,row] of Object.entries(old)){let expected=JSON.parse(JSON.stringify(row));expected.rewards=expected.rewards.map(r=>r.id===90077?{id:100097,count:r.count*(period==='day'?10:3)}:r.id===1?{id:1,count:r.count*10}:r.id===(period==='day'?7:8)?{id:1001,count:r.count*(period==='day'?100:300)}:r);assert.deepStrictEqual(current[key],expected);}
}
const C=require('/linhhoasu/lhs/newServer/src/services/ConfigService');C.loadAllTables();assert(C.get('AssetsConfig')[100097]);assert(C.get('AssetsConfig')[1001]);
out.day=C.get('ArenaDayRankRewardConfig');out.week=C.get('ArenaWeeklyRankRewardConfig');
console.log('RESULT:'+JSON.stringify(out));
'''
with connect() as c:
    s=c.open_sftp()
    p='/linhhoasu/webgame/game/index.html'
    with s.open(p,'rb') as f: before=f.read()
    old=b"'20261007_hunth_day1_v1'"
    new=b"'20261014_arena_rewards_v1'"
    if old in before:
        assert before.count(old)==1
        after=before.replace(old,new)
        backup='/linhhoasu/_ai_workbench/backups/arena_rewards_tianyiling_20261014_20261014_083904/index.html.before'
        run(c,'cp -a '+p+' '+backup)
        with s.open(p,'rb') as f: assert f.read()==before,'INDEX_CAS'
        stage=p+'.arena20261014.tmp'
        run(c,'cp -a '+p+' '+stage)
        with s.open(stage,'wb') as f: f.write(after)
        with s.open(p,'rb') as f: assert f.read()==before,'INDEX_CAS'
        run(c,'mv '+stage+' '+p)
        with s.open(p,'rb') as f: assert f.read()==after
    else:
        assert new in before,'UNEXPECTED_INDEX_VERSION'
    result=run(c,'node -',js)
    print(result)
    print(run(c,"for p in 8080 8083 8084 8085 8086 8087 8088 8089; do printf '%s ' $p; curl -fsS --max-time 5 http://127.0.0.1:$p/ready; echo; done"))
    s.close()
