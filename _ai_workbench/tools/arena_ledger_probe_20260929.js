'use strict';
const fs=require('fs'), crypto=require('crypto'), cp=require('child_process');
const {MongoClient,BSON}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const backup='/linhhoasu/_ai_workbench/backups/arena_ledger_hardening_20260929_003556';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function tail(file){try{const st=fs.statSync(file),n=Math.min(st.size,3000000),b=Buffer.alloc(n),fd=fs.openSync(file,'r');try{fs.readSync(fd,b,0,n,st.size-n);}finally{fs.closeSync(fd);}return b.toString('utf8').split('\n').slice(1);}catch(e){return[];}}
(async()=>{
 const out={at:new Date().toISOString(),pm2:[],health:[],databases:{},backup:[],logs:{}};
 const pm=JSON.parse(cp.execFileSync('pm2',['jlist'],{maxBuffer:8e6}));
 out.pm2=pm.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,start:p.pm2_env.pm_uptime,cpu:p.monit.cpu,rss:p.monit.memory}));
 for(let i=0;i<6;i++){
  const port=[8080,8083,8084,8085,8086,8087][i],start=Date.now();
  try{const r=await fetch(`http://127.0.0.1:${port}/ready`,{signal:AbortSignal.timeout(8000)});const w=await fetch(`http://127.0.0.1:${9200+i}/health`,{signal:AbortSignal.timeout(8000)}),h=await w.json();out.health.push({server:1001+i,ready:r.status,ms:Date.now()-start,ws:h.status,pid:h.runtime?.pid,clients:h.runtime?.clients});}catch(e){out.health.push({server:1001+i,error:e.message});}
  const name='lhs-s'+(1001+i),p=pm.find(p=>p.name===name),cut=new Date(Math.max(p?.pm2_env.pm_uptime||0,Date.now()-300000)).toISOString().slice(0,19).replace('T',' ');
  // Logs use local ICT, unlike ISO timestamps in this output.
  const localCut=new Date(Math.max(p?.pm2_env.pm_uptime||0,Date.now()-300000)+7*3600000).toISOString().slice(0,19).replace('T',' ');
  const lines=tail('/root/.pm2/logs/'+name+'-out.log').filter(l=>{const m=l.match(/20\d\d-\d\d-\d\d[ T]\d\d:\d\d:\d\d/);return m&&m[0].replace('T',' ')>=localCut;});
  const slow=lines.filter(l=>/slow tag=/.test(l)),by={};for(const l of slow){const m=l.match(/slow tag=(\d+).*?elapsed=(\d+)ms/);if(m){const r=by[m[1]]||={n:0,max:0};r.n++;r.max=Math.max(r.max,+m[2]);}}
  out.logs[name]={cutoffICT:localCut,lines:lines.length,slow:slow.length,byTag:by,exceptions:lines.filter(l=>/TypeError|ReferenceError|SyntaxError|ARENA_SAVE_FAILED|fight save failed|save on close failed/.test(l)).length,closed1006:lines.filter(l=>/socket closed.*code=1006/.test(l)).length,queueWaitMax:Math.max(0,...lines.map(l=>+(l.match(/queue wait.*wait=(\d+)ms/)||[])[1]||0))};
 }
 for(const name of fs.readdirSync(backup+'/bson').filter(n=>n.endsWith('.bson'))){const b=fs.readFileSync(backup+'/bson/'+name),d=BSON.deserialize(b);out.backup.push({name,bytes:b.length,sha256:hash(b),roundTripHash:hash(BSON.serialize(d)),ledgerCount:d.arenaReceiptLedger?.length});}
 const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();
 try{for(let i=1001;i<=1006;i++){const coll=c.db('lhs_s'+i).collection('players');out.databases[i]={nested:await coll.countDocuments({'arenaReceiptLedger.targetScore.document':{$exists:true}}),summary:await coll.aggregate([{$group:{_id:null,count:{$sum:1},maxBson:{$max:{$bsonSize:'$$ROOT'}}}}],{maxTimeMS:10000}).toArray()};}}finally{await c.close();}
 console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
