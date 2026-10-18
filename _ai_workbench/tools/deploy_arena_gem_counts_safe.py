"""Prepare validated candidates; CAS each file, preserve unique backups, restart serially."""
import sys,json,time,hashlib,urllib.request
from pathlib import Path
sys.dont_write_bytecode=True
from skin_incident_remote import connect,run
base=Path(__file__).parent
source=(base/'patch_arena_gem10_counts_20261014.js').read_text(encoding='utf8').split('let first;')[0]
source=source.replace("require('../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil')","require('/linhhoasu/lhs/newServer/src/protocol/BinJsonUtil')").replace("const ROOT=path.resolve(__dirname,'../..');","const ROOT='/';")
source+=r'''
const crypto=require('crypto'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const backup='/linhhoasu/_ai_workbench/backups/arena_gem_counts_safe_'+Date.now();
const changes=[];
for(const f of FILES){const before=fs.readFileSync(f),ts=decode(before);const chunks=ts.map(t=>{
 if(!['ArenaDayRankRewardConfig','ArenaWeeklyRankRewardConfig'].includes(t.name))return t.raw;
 const day=t.name==='ArenaDayRankRewardConfig',desired=day?[10,8,5,3,3,3,2,2,2,2]:[30,24,15,9,9,9,6,6,6,6];
 const v=JSON.parse(JSON.stringify(t.value));assert.equal(Object.keys(v).length,10);
 for(const [k,row] of Object.entries(v)){let r=row.rewards.filter(r=>r.id===100097);assert.equal(r.length,1);assert([desired[Number(k)-1],desired[Number(k)-1]*(day?10:2)].includes(r[0].count),'UNEXPECTED_BASELINE');r[0].count=desired[Number(k)-1];}
 return chunk(t.name,v);
 });const after=Buffer.concat(chunks),check=decode(after);assert.equal(check.length,ts.length);
 for(let i=0;i<ts.length;i++){assert.equal(check[i].name,ts[i].name);if(!['ArenaDayRankRewardConfig','ArenaWeeklyRankRewardConfig'].includes(ts[i].name))assert(check[i].raw.equals(ts[i].raw));else for(const k of Object.keys(ts[i].value)){const a=JSON.parse(JSON.stringify(ts[i].value[k])),b=JSON.parse(JSON.stringify(check[i].value[k]));a.rewards=a.rewards.filter(r=>r.id!==100097);b.rewards=b.rewards.filter(r=>r.id!==100097);assert.deepStrictEqual(a,b);}}
 verify(check.find(t=>t.name==='ArenaDayRankRewardConfig').value,check.find(t=>t.name==='ArenaWeeklyRankRewardConfig').value);
 changes.push({f,before,after});}
const f='/linhhoasu/webgame/game/index.html',before=fs.readFileSync(f),s=before.toString();assert.equal(s.split('20261014_arena_rewards_v1').length,2);changes.push({f,before,after:Buffer.from(s.replace('20261014_arena_rewards_v1','20261014_arena_rewards_v2'))});
fs.mkdirSync(backup,{recursive:true});
for(const c of changes){const b=backup+'/'+c.f.slice('/linhhoasu/'.length);fs.mkdirSync(path.dirname(b),{recursive:true});fs.writeFileSync(b,c.before,{flag:'wx'});assert.equal(hash(fs.readFileSync(b)),hash(c.before));const stage=c.f+'.gemcounts-stage';assert(!fs.existsSync(stage));fs.writeFileSync(stage,c.after,{flag:'wx',mode:fs.statSync(c.f).mode});const st=fs.statSync(c.f);fs.chownSync(stage,st.uid,st.gid);c.stage=stage;}
for(const c of changes)assert.equal(hash(fs.readFileSync(c.f)),hash(c.before),'CAS');
for(const c of changes){assert.equal(hash(fs.readFileSync(c.f)),hash(c.before),'CAS');fs.renameSync(c.stage,c.f);assert.equal(hash(fs.readFileSync(c.f)),hash(c.after));}
console.log('RECEIPT:'+JSON.stringify({backup,files:changes.map(c=>({path:c.f,pre:hash(c.before),post:hash(c.after)}))}));
'''
with connect() as c:
    active=run(c,"ps -eo pid,args | grep '[n]ode /linhhoasu/_ai_workbench/temp/arena_gem10_counts_20261014_remote.js' || true")
    assert not active.strip(),'Earlier patch still running: '+active
    for port in [8080,8083,8084,8085,8086,8087,8088,8089]:
        ready=json.loads(run(c,f'curl -fsS --max-time 8 http://127.0.0.1:{port}/ready'))
        assert ready['checks']['mongo'] and ready['checks']['redis']
    out=run(c,'node -',source);print(out,flush=True)
    receipt=json.loads(out.split('RECEIPT:')[1])
    for sid,port in zip(range(1001,1009),[8080,8083,8084,8085,8086,8087,8088,8089]):
        run(c,f'pm2 restart lhs-s{sid} >/dev/null')
        ok=False
        for _ in range(20):
            try:
                r=json.loads(run(c,f'curl -fsS --max-time 3 http://127.0.0.1:{port}/ready'))
                if r['checks']['mongo'] and r['checks']['redis']:ok=True;break
            except Exception:pass
            time.sleep(1)
        assert ok,f'READINESS_FAILED:{sid}; backups:'+receipt['backup']
        print('READY',sid,flush=True)
    for row in receipt['files']:
        if '/webgame/game/' not in row['path']:continue
        url='http://linhhoasu.lol/'+row['path'].split('/webgame/game/')[1]+'?v=20261014_arena_rewards_v2'
        with urllib.request.urlopen(url,timeout=20) as r:data=r.read()
        assert hashlib.sha256(data).hexdigest()==row['post'],'PUBLIC_HASH'
    print('PUBLIC_HASH_PASS; S1-S8_READY; NO_PLAYER_WRITES',flush=True)
