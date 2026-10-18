'use strict';
// Server-local operator. Never prints credentials or raw player documents.
const fs=require('fs'),path=require('path'),cp=require('child_process'),http=require('http'),crypto=require('crypto'),assert=require('assert/strict');
const APP='/linhhoasu/lhs/newServer',ROOT='/linhhoasu/_ai_workbench/temp/fashion_box_29040_20260907',ENDPOINT='/api/internal/player/repair-fashion-box-29040',INCIDENT='fashion_box_29040_20260907',MARKER='fashionBox29040_20260907';
const MongoClient=require(APP+'/node_modules/mongodb').MongoClient;
function store(file,value){fs.writeFileSync(path.join(ROOT,file),JSON.stringify(value,null,2),{mode:0o600});}
// Each invocation is one short checkpointed batch. Avoid spawning PM2 for every role.
const keyCache=new Map();
function effective(sid){if(keyCache.has(sid))return keyCache.get(sid);const p=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(p=>p.name==='lhs-s'+sid);assert(p?.pm2_env.pm_cwd===APP&&p.pm2_env.status==='online');const raw=Object.fromEntries(fs.readFileSync('/proc/'+p.pid+'/environ','utf8').split('\0').filter(Boolean).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)];}));const env={...require(APP+'/node_modules/dotenv').parse(fs.readFileSync(APP+'/.env')),...raw};assert(env.API_KEY&&env.API_KEY!=='lhs_internal_key');keyCache.set(sid,env.API_KEY);return env.API_KEY;}
async function call(sid,body,options={}){
 const raw=JSON.stringify(body),time=Date.now(),nonce=crypto.randomBytes(16).toString('hex'),key=effective(sid),sig=crypto.createHmac('sha256',key).update(['POST',ENDPOINT,time,nonce,raw].join('\n')).digest('hex');
 return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:sid===1001?8080:8083,path:ENDPOINT,method:'POST',timeout:30000,headers:{'content-type':'application/json','content-length':Buffer.byteLength(raw),'x-api-key':key,'x-timestamp':String(time),'x-nonce':nonce,'x-signature':options.badSignature?'00'.repeat(32):sig}},res=>{let text='';res.on('data',d=>text+=d);res.on('end',()=>{try{resolve({status:res.statusCode,data:JSON.parse(text)});}catch{reject(Error('INVALID_JSON_RESPONSE'));}});});req.on('timeout',()=>req.destroy(Error('API_TIMEOUT_OUTCOME_UNKNOWN')));req.on('error',reject);req.end(raw);});
}
async function withMongo(fn){const c=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:10000});await c.connect();try{return await fn(c);}finally{await c.close();}}
async function inventory(c){const result=[];for(const sid of[1001,1002]){const rows=await c.db('lhs_s'+sid).collection('players').aggregate([{$match:{isBot:{$ne:true},'items.29040':{$gt:0}}},{$group:{_id:null,players:{$sum:1},boxes:{$sum:'$items.29040'}}}],{maxTimeMS:10000}).toArray();result.push({serverId:sid,players:rows[0]?.players||0,boxes:rows[0]?.boxes||0});}return result;}
async function main(){
 const action=process.argv[2];
 if(action==='inventory'){console.log(JSON.stringify(await withMongo(inventory)));return;}
 if(action==='plan'){
  assert(!fs.existsSync(ROOT+'/targets.json'),'PLAN_ALREADY_EXISTS');
  const rows=await withMongo(async c=>{const list=[];for(const sid of[1001,1002]){const docs=await c.db('lhs_s'+sid).collection('players').find({isBot:{$ne:true},'items.29040':{$gt:0}},{projection:{_id:0,userId:1,playerId:1,serverId:1,'items.29040':1,'fashionInfo.activateFashion':1,'fashionInfo.fashions':1,'fashionInfo.fashionData':1}}).maxTimeMS(15000).limit(5001).toArray();assert(docs.length<=5000,'PLAN_TOO_LARGE');for(const p of docs){assert(Number(p.serverId)===sid);const state=require(APP+'/src/services/FashionBoxRepairService').snapshot(p);list.push({serverId:sid,userId:p.userId,playerId:p.playerId,boxCount:state.boxCount,signature:state.signature,alreadyOwned:state.owns.every(r=>r.owned)});}}return list;});
  const plan={incident:INCIDENT,at:new Date().toISOString(),rows};store('targets.json',plan);console.log(JSON.stringify({plan:true,rows:rows.length,boxes:rows.reduce((n,r)=>n+r.boxCount,0),byServer:[1001,1002].map(sid=>({serverId:sid,players:rows.filter(r=>r.serverId===sid).length,boxes:rows.filter(r=>r.serverId===sid).reduce((n,r)=>n+r.boxCount,0)}))}));return;
 }
 if(action==='apply'){
  const sid=Number(process.argv[3]),limit=Number(process.argv[4]||50);assert([1001,1002].includes(sid)&&limit>0&&limit<=100);
  const plan=JSON.parse(fs.readFileSync(ROOT+'/targets.json'));assert(plan.incident===INCIDENT);
  const file='results-'+sid+'.json',results=fs.existsSync(ROOT+'/'+file)?JSON.parse(fs.readFileSync(ROOT+'/'+file)):{incident:INCIDENT,serverId:sid,rows:{}};
  let processed=0;
  for(const target of plan.rows.filter(r=>r.serverId===sid)){
   const key=crypto.createHash('sha256').update(target.userId).digest('hex');if(results.rows[key]?.success)continue;if(processed>=limit)break;
   let body={action:'apply',userId:target.userId,incident:INCIDENT,confirm:true,signature:target.signature,expectedCount:target.boxCount};
   let response=await call(sid,body);
   if(response.status===409&&response.data.error==='FASHION_REPAIR_PREVIEW_DRIFT'){
    const preview=await call(sid,{action:'preview',userId:target.userId});assert(preview.status===200&&preview.data.success&&preview.data.state.boxCount>0,'DRIFT_REVIEW_REQUIRED');
    body.signature=preview.data.state.signature;body.expectedCount=preview.data.state.boxCount;response=await call(sid,body);
   }
   if(response.status!==200||!response.data.success){results.rows[key]={success:false,http:response.status,error:response.data.error||'UNKNOWN',at:new Date().toISOString()};store(file,results);throw Error('REPAIR_STOPPED_'+sid+'_'+response.status+'_'+(response.data.error||'UNKNOWN'));}
   const rec=response.data.receipt;assert(rec?.incident===INCIDENT&&rec.userId===target.userId);results.rows[key]={success:true,replayed:!!response.data.replayed,boxes:rec.boxCount,duplicateYuanbao:rec.duplicateYuanbao,newlyActivated:rec.newlyActivated,noticeId:response.data.noticeId,at:new Date().toISOString()};store(file,results);processed++;
   if(processed%10===0)console.log(JSON.stringify({serverId:sid,processed,completedTotal:Object.values(results.rows).filter(r=>r.success).length}));
   await new Promise(r=>setTimeout(r,700));
  }
  console.log(JSON.stringify({serverId:sid,processed,completedTotal:Object.values(results.rows).filter(r=>r.success).length,totalTargets:plan.rows.filter(r=>r.serverId===sid).length}));return;
 }
 if(action==='verify'){
  const plan=JSON.parse(fs.readFileSync(ROOT+'/targets.json'));const result=await withMongo(async c=>{const summary=[];for(const sid of[1001,1002]){const targets=plan.rows.filter(r=>r.serverId===sid),col=c.db('lhs_s'+sid).collection('players'),mail=c.db('lhs_s'+sid).collection('mails');let passed=0,boxes=0,diamond=0,notices=0;const problems=[];for(const target of targets){const p=await col.findOne({userId:target.userId},{projection:{items:1,fashionInfo:1,moderation:1,playerId:1}});const r=p?.moderation?.[MARKER],owned=[29041,29042,29043,29049].every(id=>(p?.fashionInfo?.activateFashion||[]).includes(id)&&Number(p?.fashionInfo?.fashions?.[id]||0)>0);const mailCount=await mail.countDocuments({userId:target.userId,eventKey:INCIDENT});if(r?.incident!==INCIDENT||p.playerId!==target.playerId||Number(p.items?.[29040]||0)!==0||!owned||mailCount!==1)problems.push(crypto.createHash('sha256').update(target.userId).digest('hex'));else{passed++;boxes+=r.boxCount;diamond+=r.duplicateYuanbao;notices+=mailCount;}}summary.push({serverId:sid,targets:targets.length,passed,boxesConsumed:boxes,duplicateYuanbao:diamond,notices,problems});}return{summary,remaining:await inventory(c)};});
  result.result=result.summary.every(s=>!s.problems.length)&&result.remaining.every(s=>!s.players)?'PASS':'PENDING';result.at=new Date().toISOString();store('verify.json',result);console.log(JSON.stringify(result));if(result.result!=='PASS')process.exitCode=1;return;
 }
 throw Error('MODE');
}
module.exports={call};if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
