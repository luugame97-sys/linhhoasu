'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),Module=require('module');
const app=path.resolve(process.argv[2]);const plan=JSON.parse(fs.readFileSync(path.join(app,'src/config/donateRevision20260907.json'))),t=plan.rows[0],clone=x=>JSON.parse(JSON.stringify(x));
let db,live,ws,mail,mode,saves,backups,mailCalls;
const baseLoad=Module._load;
const player={findOne:q=>({lean:async()=>clone(db)})};
const account={findOne:q=>({lean:async()=>({accountId:t.accountId,roles:[{userId:t.userId,serverId:t.serverId}]})})};
const mailModel={findOne:q=>({lean:async()=>mail?clone(mail):null}),findOneAndUpdate(q,u){mailCalls++;if(mode==='mail-throw')return{lean:async()=>{throw Error('MAIL_FAIL');}};mail||={_id:'fixture-mail',...clone(u.$setOnInsert)};return{lean:async()=>clone(mail)};}};
const playerSvc={drainPendingSaves:async()=>{},async savePlayer(uid,next){saves++;if(mode==='throw')throw Error('SAVE_FAIL');if(mode==='null')return null;db=clone(next);if(mode==='commit-throw')throw Error('COMMIT_TIMEOUT');return next;}};
Module._load=function(req,parent,isMain){if(parent?.filename.endsWith('DonateRevisionService.js')){
 if(req==='../db/models/Player')return player;if(req==='../db/models/Account')return account;if(req==='../db/models/Mail')return mailModel;if(req==='./PlayerService')return playerSvc;
 if(req==='./PlayerMutationService')return baseLoad.call(this,path.resolve('linhhoasu/lhs/newServer/src/services/PlayerMutationService'),parent,isMain);
 if(req==='../handlers/mail')return{toClientMail:m=>m};
 if(req==='fs')return{existsSync:()=>false,mkdirSync(){},writeFileSync(){backups++;}};
}return baseLoad.call(this,req,parent,isMain);};
const svc=require(path.join(app,'src/services/DonateRevisionService'));
function reset(){mode='ok';saves=backups=mailCalls=0;mail=null;process.env.SERVER_ID=String(t.serverId);db={userId:t.userId,playerId:t.playerId,accountId:t.accountId,serverId:t.serverId,items:{4:123,5:t.skill+10,65:17},mailClaimLedger:t.claims.map(c=>c.mailId),moderation:{older:{ok:true}}};live=clone(db);
 const session={userId:t.userId,player:live,_responseCache:new Map()};ws={clients:new Map([[1,{session}]]),_closingPlayers:new Map(),getPlayerForMutation:()=>session.player,invalidatePlayerForMutation(){session.player=null;},pushToUser(){}};return session;}
const call=(action,extra={})=>svc.dispatch({userId:t.userId,action,confirm:true,incident:plan.incident,evidenceSha256:plan.evidenceSha256,...extra},ws);
const tests=[];async function test(name,f){try{await f();tests.push({name,result:'PASS'});}catch(e){tests.push({name,result:'FAIL',error:e.message});}}
(async()=>{
await test('plan 38 roles 429 proved claims correct totals',()=>{assert.equal(plan.rows.length,38);assert.equal(plan.rows.reduce((s,r)=>s+r.claims.length,0),429);assert.equal(plan.rows.reduce((s,r)=>s+r.skill,0),3825000);assert.equal(plan.rows.reduce((s,r)=>s+r.baoziDelta,0),5400000);});
await test('unknown target rejected',async()=>{reset();await assert.rejects(()=>svc.dispatch({userId:'other',action:'convert'},ws),/TARGET/);});
await test('wrong server rejected',async()=>{reset();process.env.SERVER_ID='9999';await assert.rejects(()=>call('convert'),/WRONG_SERVER/);});
await test('confirmation required',async()=>{reset();await assert.rejects(()=>call('convert',{confirm:false}),/CONFIRM/);assert.equal(saves,0);});
await test('status read only',async()=>{reset();await call('status');assert.equal(saves+backups+mailCalls,0);});
await test('source ledger required',async()=>{reset();live.mailClaimLedger=[];await assert.rejects(()=>call('convert'),/LEDGER_DRIFT/);assert.equal(saves,0);});
await test('inadequate balance refuses overdraw',async()=>{reset();live.items[5]=t.skill-1;await assert.rejects(()=>call('convert'),/INSUFFICIENT/);assert.equal(saves,0);});
await test('latest online balance wins other data preserved',async()=>{const s=reset();s.player.items[5]+=77;const r=await call('convert');assert.equal(r.result.after,87);assert.equal(db.items[5],87);assert.equal(s.player.items[5],87);assert.equal(db.items[4],123);assert.equal(db.items[65],17);assert.deepEqual(db.moderation.older,{ok:true});assert.equal(backups,1);});
await test('concurrent converts once',async()=>{reset();const r=await Promise.all([call('convert'),call('convert'),call('convert')]);assert.equal(saves,1);assert.equal(r.filter(x=>x.result.replayed).length,2);});
for(const fail of['throw','null','commit-throw'])await test('save '+fail+' durable retry',async()=>{const session=reset();mode=fail;await assert.rejects(()=>call('convert'));assert.equal(session.player,null);mode='ok';await call('convert');assert.equal(db.items[5],10);assert.equal(saves,fail==='commit-throw'?1:2);});
await test('mail only after conversion',async()=>{reset();await assert.rejects(()=>call('send'),/RECEIPT/);assert.equal(mailCalls,0);});
await test('mail replay uses same event key',async()=>{reset();await call('convert');const a=await call('send'),b=await call('send');assert.equal(mailCalls,1);assert.equal(a.result.eventKey,b.result.eventKey);assert.deepEqual(mail.attachments,svc.attachments(t));});
await test('mail timeout never reconverts',async()=>{reset();await call('convert');mode='mail-throw';await assert.rejects(()=>call('send'));mode='ok';await call('convert');await call('send');assert.equal(saves,2);assert.equal(db.items[5],10);});
await test('claimed deleted compensation never reissued',async()=>{const session=reset();await call('convert');await call('send');db.mailClaimLedger.push('fixture-mail');session.player.mailClaimLedger.push('fixture-mail');mail=null;const r=await call('send');assert(r.result.alreadyConsumed);assert.equal(mailCalls,1);});
await test('missing unclaimed compensation requires manual check',async()=>{reset();await call('convert');await call('send');mail=null;await assert.rejects(()=>call('send'),/MISSING_MANUAL/);assert.equal(mailCalls,1);});
await test('mail payload collision refused',async()=>{reset();await call('convert');mail={_id:'bad',attachments:[{id:65,count:1}]};await assert.rejects(()=>call('send'),/CONFLICT/);});
Module._load=baseLoad;const result={result:tests.every(t=>t.result==='PASS')?'PASS':'FAIL',count:tests.length,tests,productionWrites:0};console.log(JSON.stringify(result));if(result.result!=='PASS')process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
