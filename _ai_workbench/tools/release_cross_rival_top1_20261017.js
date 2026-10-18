'use strict';
// Scoped binary edit: add descending item 1001 rewards to the three CrossRival rankings.
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto'),assert=require('assert/strict'),cp=require('child_process');
const ROOT='/linhhoasu',APP=ROOT+'/lhs/newServer',TASK=ROOT+'/_ai_workbench/temp/cross_rival_top1_20261017/all_ranks';
const VERSION='20261017_cross_rival_rank_1001_v2';
const TABLES=['CrossRivalScoreRankRewardConfig','CrossRivalDefenseRankRewardConfig','CrossRivalCampRankRewardConfig'];
const TYPES={personal:TABLES[0],defence:TABLES[1],camp:TABLES[2]};
const AMOUNTS={1:10000,2:8000,3:6000,4:5000,6:4000,11:3000,21:2500,51:2000,501:1600};
function amount(rank){const key=Object.keys(AMOUNTS).map(Number).sort((a,b)=>b-a).find(n=>rank>=n);assert(key,'INVALID_RANK');return AMOUNTS[key];}
function rowAmount(row){if(row.rankMin===500&&row.rankMax===9999)return AMOUNTS[501];assert(AMOUNTS[row.rankMin],'UNEXPECTED_RANK_MIN:'+row.rankMin);return AMOUNTS[row.rankMin];}
const FILES=['lhs/update/resource/assets/excel/config_fashion_20260909.bin','lhs/update/resource/assets/excel/config_e5ac72c2.bin','webgame/game/update/resource/assets/excel/config_fashion_20260909.bin','webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'];
const INDEX='webgame/game/index.html';
const {BinJsonUtil,ByteArray}=require(APP+'/src/protocol/BinJsonUtil');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(p);
const save=(p,data)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data);};
const json=(p,v)=>save(p,JSON.stringify(v,null,2)+'\n');
const jread=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function nodes(){return JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:8e6})).filter(p=>/^lhs-s\d+$/.test(p.name)).sort((a,b)=>a.name.localeCompare(b.name));}
function boot(){const n=nodes();for(const[k,v]of Object.entries(n[0].pm2_env))if(typeof v==='string')process.env[k]=v;
 const l=require.resolve(APP+'/src/logger');require.cache[l]={id:l,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};return require(APP+'/src/services/ConfigService');}
function chunks(b){const out=[];let p=0;while(p<b.length){const start=p,n=b[p++],name=b.toString('utf8',p,p+n);p+=n;const len=b.readUInt32BE(p);p+=4;assert(len>0&&p+len<=b.length,'CHUNK_LENGTH');const compressed=b.subarray(p,p+len);p+=len;out.push({name,raw:b.subarray(start,p),value:TABLES.includes(name)?BinJsonUtil.readFullJson(new ByteArray(zlib.inflateSync(compressed))):null});}assert.equal(p,b.length);assert.equal(new Set(out.map(c=>c.name)).size,out.length);return out;}
function encode(name,v){const n=Buffer.from(name),b=new ByteArray(undefined,1024*1024);BinJsonUtil.json2bin(v,b);const c=zlib.deflateSync(Buffer.from(b.buffer),{level:6}),h=Buffer.alloc(1+n.length+4);h[0]=n.length;n.copy(h,1);h.writeUInt32BE(c.length,1+n.length);return Buffer.concat([h,c]);}
function patch(before){const old=chunks(before);let changed=0;const after=Buffer.concat(old.map(c=>{
 if(!TABLES.includes(c.name))return c.raw;
 const table=structuredClone(c.value),rows=Object.values(table);assert.equal(rows.filter(r=>r.rankMin===1&&r.rankMax===1).length,1,'TOP1_ROW');
 for(const row of rows){assert(row.rewards.filter(r=>Number(r.id)===1001).length<=1,'DUPLICATE_1001');row.rewards=row.rewards.filter(r=>Number(r.id)!==1001);row.rewards.push({id:1001,count:rowAmount(row)});}changed++;return encode(c.name,table);
}));assert.equal(changed,3);
 const next=chunks(after);assert.equal(next.length,old.length);
 for(let i=0;i<old.length;i++){const a=old[i],b=next[i];assert.equal(a.name,b.name);if(!TABLES.includes(a.name)){assert(a.raw.equals(b.raw),'UNRELATED_CHUNK:'+a.name);continue;}
  for(const[k,row]of Object.entries(a.value)){const expected=structuredClone(row);expected.rewards=expected.rewards.filter(r=>Number(r.id)!==1001);expected.rewards.push({id:1001,count:rowAmount(row)});assert.deepEqual(b.value[k],expected,'ROW_DIFF:'+a.name+':'+k);}
  assert.deepEqual(Object.keys(a.value),Object.keys(b.value));
 }
 return{after,tables:Object.fromEntries(next.filter(c=>TABLES.includes(c.name)).map(c=>[c.name,c.value])),unchangedChunks:old.length-3};
}
function preserve(src,dst){const s=fs.statSync(src);fs.chmodSync(dst,s.mode&0o7777);fs.chownSync(dst,s.uid,s.gid);}
function serviceTest(C,oldTables,newTables){
 const factory=require(APP+'/src/services/CrossRivalRewardService').createService;
 const cfg=t=>({get:n=>t[n]||C.get(n)}),before=factory({config:cfg(oldTables)}),after=factory({config:cfg(newTables)});
 let assertions=0;for(const[type,name]of Object.entries(TYPES))for(const rank of type==='camp'?[1,2,3,4]:[1,2,3,4,5,6,10,20,21,50,51,499,500,501,9999]){
  const expected=before.rewards(type,rank).filter(r=>r.id!==1001);expected.push({id:1001,count:amount(rank)});assert.deepEqual(after.rewards(type,rank),expected,'SERVICE_REWARDS:'+name+':'+rank);assertions++;
 }
 const hero=i=>({serverId:1001,playerId:'fixture_'+i,userId:'fixture_'+i,camp:i<201?1:2,score:1000-i,defKill:1});
 const eligible=Array.from({length:202},(_,i)=>hero(i));
 const recipients=after.recipients('fixture_only',{personal:[{...hero(0),rank:1},{...hero(1),rank:2}],defence:[{...hero(0),rank:1},{...hero(1),rank:2}],camps:[{camp:1,rank:1},{camp:2,rank:2}],eligible});
 assert.equal(recipients.filter(r=>r.type==='camp'&&r.rank===1).length,200);
 for(const r of recipients)assert.equal(r.attachments.find(x=>x.id===1001)?.count||0,amount(r.rank));
 assert.equal(new Set(recipients.map(r=>r.mailId)).size,recipients.length);
 return{rankCases:assertions,fixtureRecipients:recipients.length,campTop1Recipients:200,databaseCalls:0,mailWrites:0};
}
async function prepare(){fs.mkdirSync(TASK,{recursive:true});assert(!fs.existsSync(TASK+'/release.json'),'RELEASE_EXISTS');const C=boot(),before=C.loadAllTables(),oldTables=structuredClone(Object.fromEntries(TABLES.map(t=>[t,before[t]])));
 const mongo=new (require(APP+'/node_modules/mongodb').MongoClient)(process.env.MONGO_URI,{serverSelectionTimeoutMS:5000,maxPoolSize:1});let season;
 try{await mongo.connect();const db=mongo.db(process.env.IDENTITY_MONGO_DB),rules=require(APP+'/src/services/CrossRivalRules'),cycle=require(APP+'/src/services/CrossServerEventService').cycleFor('crossRival',Date.now());
  const worlds=await db.collection(rules.collection('worlds')).find({version:2},{projection:{_id:1,cycle:1,frozenAt:1,settlementDone:1},maxTimeMS:5000}).limit(20).toArray();
  assert(!worlds.some(w=>w.cycle.endTime<=Date.now()&&!w.settlementDone),'UNSETTLED_OLD_WORLD');
  assert.equal(await db.collection(rules.collection('settlements')).countDocuments({_id:'rival_v2_'+cycle.key},{maxTimeMS:5000}),0,'CURRENT_ALREADY_SETTLED');season={cycle,worlds};
 }finally{await mongo.close();}
 const report={version:VERSION,preparedAt:new Date().toISOString(),amounts:AMOUNTS,season,files:[],tests:null,sourceHashes:{},directPlayerWrites:0};
 let canonical=null;
 for(const rel of FILES){const source=ROOT+'/'+rel,baseline=read(source),{after,tables,unchangedChunks}=patch(baseline);save(TASK+'/stage/'+rel,after);preserve(source,TASK+'/stage/'+rel);if(canonical)assert.deepEqual(tables,canonical,'NATIVE_SERVER_TABLE_PARITY');else canonical=tables;
  report.files.push({relative:rel,before:hash(baseline),after:hash(after),beforeBytes:baseline.length,afterBytes:after.length,unchangedChunks});}
 const idx=read(ROOT+'/'+INDEX),text=idx.toString('utf8'),matches=[...text.matchAll(/var translationVersion = '([^']+)'/g)];assert.equal(matches.length,1,'TRANSLATION_CACHE_MARKER');
 const next=text.replace(matches[0][0],"var translationVersion = '"+VERSION+"'");assert.equal(Buffer.from(text).compare(idx),0,'INDEX_ENCODING');save(TASK+'/stage/'+INDEX,Buffer.from(next));preserve(ROOT+'/'+INDEX,TASK+'/stage/'+INDEX);
 report.files.push({relative:INDEX,before:hash(idx),after:hash(Buffer.from(next))});
 for(const n of ['ConfigService','CrossRivalRewardService'])report.sourceHashes[n]=hash(read(APP+'/src/services/'+n+'.js'));
 const loaded=C.reload(TASK+'/stage/'+FILES[0]);assert(loaded.AssetsConfig[1001]);report.tests=serviceTest(C,oldTables,Object.fromEntries(TABLES.map(t=>[t,loaded[t]])));
 report.top1=Object.fromEntries(TABLES.map(t=>[t,Object.values(loaded[t]).find(r=>r.rankMin===1&&r.rankMax===1).rewards]));
 report.rewardsByRank=Object.fromEntries(TABLES.map(t=>[t,Object.values(loaded[t]).map(r=>({rankMin:r.rankMin,rankMax:r.rankMax,rewards:r.rewards}))]));
 json(TASK+'/release.json',report);console.log(JSON.stringify(report));
}
function apply(){const r=jread(TASK+'/release.json');assert(!fs.existsSync(TASK+'/deployment.json'),'DEPLOYMENT_EXISTS');for(const[n,h]of Object.entries(r.sourceHashes))assert.equal(hash(read(APP+'/src/services/'+n+'.js')),h,'SERVICE_DRIFT');
 for(const f of r.files){assert.equal(hash(read(ROOT+'/'+f.relative)),f.before,'PREIMAGE_DRIFT:'+f.relative);assert.equal(hash(read(TASK+'/stage/'+f.relative)),f.after,'STAGE_DRIFT');}
 const backup=ROOT+'/_ai_workbench/backups/cross_rival_rank_rewards_'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');fs.mkdirSync(backup,{mode:0o700});
 const d={version:VERSION,at:new Date().toISOString(),backup,files:r.files,swapped:[],status:'STAGING',directPlayerWrites:0};
 for(const f of r.files){const bp=backup+'/'+f.relative;fs.mkdirSync(path.dirname(bp),{recursive:true});fs.copyFileSync(ROOT+'/'+f.relative,bp,fs.constants.COPYFILE_EXCL);preserve(ROOT+'/'+f.relative,bp);assert.equal(hash(read(bp)),f.before);}
 try{for(const f of r.files){assert.equal(hash(read(ROOT+'/'+f.relative)),f.before,'SWAP_CAS');fs.renameSync(TASK+'/stage/'+f.relative,ROOT+'/'+f.relative);d.swapped.push(f.relative);assert.equal(hash(read(ROOT+'/'+f.relative)),f.after,'READBACK');}d.status='FILES_APPLIED';}
 catch(e){for(const rel of [...d.swapped].reverse()){const f=r.files.find(x=>x.relative===rel);assert.equal(hash(read(ROOT+'/'+rel)),f.after,'ROLLBACK_DRIFT');const tmp=TASK+'/rollback/'+rel;fs.mkdirSync(path.dirname(tmp),{recursive:true});fs.copyFileSync(backup+'/'+rel,tmp);preserve(backup+'/'+rel,tmp);fs.renameSync(tmp,ROOT+'/'+rel);assert.equal(hash(read(ROOT+'/'+rel)),f.before);}d.status='ROLLED_BACK';throw e;}
 finally{json(TASK+'/deployment.json',d);}console.log(JSON.stringify(d));
}
async function verify(){const r=jread(TASK+'/release.json'),C=boot(),out={at:new Date().toISOString(),files:[],top1:{},runtime:[],https:[],rewardsByRank:r.rewardsByRank,directPlayerWrites:0};
 for(const f of r.files){assert.equal(hash(read(ROOT+'/'+f.relative)),f.after,'VERIFY_DISK');out.files.push({relative:f.relative,sha256:f.after});}
 for(const[type,name]of Object.entries(TYPES)){const rows=Object.values(C.get(name));out.top1[type]=rows.find(r=>r.rankMin===1&&r.rankMax===1).rewards;assert.equal(out.top1[type].find(r=>r.id===1001).count,10000);}
 const cache=new Map(),nm=nodes();for(const n of nm){const e=n.pm2_env;assert.equal(e.status,'online');const ready=JSON.parse(cp.execFileSync('curl',['-fsS','--max-time','5','http://127.0.0.1:'+e.HTTP_PORT+'/ready'],{encoding:'utf8'}));assert(ready.checks.mongo&&ready.checks.redis);
  const key=e.CONFIG_BIN_PATH||'default';if(!cache.has(key))cache.set(key,key==='default'?C.loadAllTables():C.reload(e.CONFIG_BIN_PATH));const current=cache.get(key);for(const name of TABLES)assert.deepEqual(Object.values(current[name]).map(row=>({rankMin:row.rankMin,rankMax:row.rankMax,rewards:row.rewards})),r.rewardsByRank[name]);
  out.runtime.push({name:n.name,pid:n.pid,restarts:e.restart_time,configPath:e.CONFIG_BIN_PATH||'default shared config_fashion_20260909.bin',ready});}
 for(const f of r.files.filter(f=>f.relative.startsWith('webgame/game/'))){const url='https://linhhoasu.lol/'+f.relative.slice('webgame/game/'.length)+'?v='+VERSION;
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)});assert.equal(response.status,200,'HTTP_STATUS');const data=Buffer.from(await response.arrayBuffer());assert.equal(hash(data),f.after,'HTTPS_HASH');
  if(f.relative.endsWith('.bin')){const tables=chunks(data);for(const name of TABLES)for(const row of Object.values(tables.find(c=>c.name===name).value))assert.equal(row.rewards.find(x=>x.id===1001).count,rowAmount(row),'SERVED_REWARDS');}
  out.https.push({url,sha256:hash(data),matchesDisk:true});}
 json(TASK+'/verification.json',out);console.log(JSON.stringify(out));
}
Promise.resolve(({prepare,apply,verify})[process.argv[2]]()).catch(e=>{console.error(e.stack);process.exitCode=1;});
