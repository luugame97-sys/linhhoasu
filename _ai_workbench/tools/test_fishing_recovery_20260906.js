'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),Module=require('module');
const root=path.resolve(process.argv[2]),app=path.join(root,'app'),plan=JSON.parse(fs.readFileSync(path.join(root,'plan.json'),'utf8'));
const clone=x=>JSON.parse(JSON.stringify(x)),originalLoad=Module._load;
let players,accounts,mails,mode,saves,backups,ws,pushed,kicked,revoked;
const inBackup=f=>String(f).replaceAll('\\','/').startsWith('/linhhoasu/_ai_workbench/backups/');
const fakeFs={...fs,existsSync:f=>inBackup(f)?false:fs.existsSync(f),mkdirSync:f=>{if(!inBackup(f))throw Error('TEST_FS_SCOPE');},writeFileSync:(f,text)=>{if(!inBackup(f))throw Error('TEST_FS_SCOPE');backups.push(JSON.parse(text));}};
const modelPlayer={findOne:q=>({lean:async()=>clone(players.get(q.userId)||null)})};
const modelAccount={findOne:q=>({lean:async()=>clone(accounts.get(q.accountId)||null)}),collection:{async updateOne(q,u){const row=[...accounts.values()].find(a=>a._id===q._id);if(!row||row.authVersion!==q.authVersion||row.status!==q.status||(row.banHistory||[]).some(h=>h.code===plan.code&&h.meta.evidenceId===plan.incident))return {matchedCount:0};Object.assign(row,clone(u.$set));row.banHistory||=[];row.banHistory.push(...clone(u.$push.banHistory.$each));return {matchedCount:1};}}};
const servicePlayer={async drainPendingSaves(){},async savePlayer(uid,p){saves++;if(mode==='null')return null;if(mode==='throw')throw Error('SAVE_FAIL');players.set(uid,clone(p));if(mode==='commit-throw')throw Error('COMMIT_TIMEOUT');return p;}};
const fakeMail={findOneAndUpdate(q,u){const key=q.userId+'|'+q.eventKey;if(!mails.has(key))mails.set(key,{_id:'mail-'+mails.size,...clone(u.$setOnInsert)});return {lean:async()=>clone(mails.get(key))};}};
Module._load=function(request,parent,isMain){
 if(parent?.filename.endsWith('FishingFreeRecoveryService.js')){
  if(request==='fs')return fakeFs;
  if(request==='../db/models/Player')return modelPlayer;
  if(request==='../db/models/Account')return modelAccount;
  if(request==='../db/models/Mail')return fakeMail;
  if(request==='./PlayerService')return servicePlayer;
  if(request==='./AuthSessionService')return {revokeAccount:async()=>{revoked++;return 2;}};
  if(request==='../handlers/mail')return {toClientMail:m=>m};
 }
 return originalLoad.call(this,request,parent,isMain);
};
const svc=require(path.join(app,'src/services/FishingFreeRecoveryService'));
const target=plan.rows.find(r=>r.accountId==='kawaiino1'),admin=plan.rows.find(r=>r.accountId==='vanduc97');
function reset(t=target){mode='ok';saves=0;backups=[];pushed=[];kicked=[];revoked=0;players=new Map();accounts=new Map();mails=new Map();process.env.SERVER_ID=String(t.serverId);
 const p={...t,items:{4:t.amount+5000,65:100},moderation:{oldIncident:{count:13}},shopInfo:{buyRecords:{11001400:t.recordedClaims}},rechargeInfo:{records:[{id:11001400,count:t.recordedClaims}]} };delete p.amount;delete p.penaltySeconds;
 players.set(t.userId,clone(p));accounts.set(t.accountId,{_id:'a',accountId:t.accountId,passwordHash:'test-not-real',status:1,authVersion:2,roles:[{userId:t.userId,serverId:t.serverId},{userId:'alt-role',serverId:t.serverId===1001?1002:1001}],banHistory:[]});
 const session={userId:t.userId,accountId:t.accountId,player:clone(p),_responseCache:new Map()},closing={userId:t.userId,accountId:t.accountId,player:clone(p)};
 ws={clients:new Map([[1,{session}]]),_closingPlayers:new Map([[2,{session:closing}]]),getPlayerForMutation:uid=>uid===t.userId?session.player:null,invalidatePlayerForMutation(){session.player=null;closing.player=null;},pushToUser(...args){pushed.push(args);},kickAccount(...args){kicked.push(args);return 2;}};
 return {p,session,closing};
}
const call=(action,t=target,extra={})=>svc.dispatch({action,accountId:t.accountId,confirm:true,incident:plan.incident,evidenceSha256:plan.evidenceSha256,...extra},ws);
const tests=[];async function test(name,fn){try{await fn();tests.push({name,result:'PASS'});}catch(e){tests.push({name,result:'FAIL',error:e.stack});}}
(async()=>{
await test('plan_exact_19_recoveries_18_bans_admin_zero',()=>{assert.equal(plan.rows.length,19);assert.equal(plan.rows.filter(r=>r.penaltySeconds>0).length,18);assert.equal(plan.rows.reduce((n,r)=>n+r.amount,0),231860);assert.equal(admin.penaltySeconds,0);});
await test('unknown_target_refused',async()=>{reset();await assert.rejects(()=>svc.dispatch({accountId:'outside',action:'recover'},ws),/TARGET_NOT_ALLOWED/);});
await test('confirmation_required',async()=>{reset();await assert.rejects(()=>call('recover',target,{confirm:false}),/CONFIRM_REQUIRED/);assert.equal(saves,0);});
await test('wrong_server_refused',async()=>{reset();process.env.SERVER_ID='1002';await assert.rejects(()=>call('recover'),/WRONG_SERVER/);});
await test('identity_drift_refused',async()=>{reset();players.get(target.userId).accountId='other';await assert.rejects(()=>call('recover'),/PLAYER_MISMATCH/);});
await test('current_live_balance_used_and_all_sessions_synced',async()=>{const{session,closing}=reset();session.player.items[4]+=200;const r=await call('recover');assert.equal(r.result.after,5200);assert.equal(players.get(target.userId).items[4],5200);assert.equal(session.player.items[4],5200);assert.equal(closing.player.items[4],5200);assert.deepEqual(session.player.moderation.oldIncident,{count:13});assert(backups.length===1);assert.equal(pushed[0][1],1202);});
await test('recovery_replay_and_concurrent_requests_never_double',async()=>{reset();const results=await Promise.all([call('recover'),call('recover'),call('recover')]);assert.equal(saves,1);assert.equal(results.filter(x=>x.result.replayed).length,2);});
await test('balance_shortfall_does_not_charge_other_currency',async()=>{const{session}=reset();session.player.items[4]=target.amount-1;await assert.rejects(()=>call('recover'),/INSUFFICIENT/);assert.equal(saves,0);});
for(const m of ['null','throw','commit-throw'])await test('save_'+m+'_invalidates_stale_snapshots',async()=>{const{session}=reset();mode=m;await assert.rejects(()=>call('recover'));assert.equal(session.player,null);mode='ok';const r=await call('recover');assert.equal(r.result.after,5000);assert.equal(saves,m==='commit-throw'?1:2);});
await test('missing_recovery_blocks_ban',async()=>{reset();await assert.rejects(()=>call('ban'),/RECEIPT_MISMATCH/);});
await test('admin_recovered_without_auth_or_ban_mutation',async()=>{reset(admin);await call('recover',admin);assert.equal(players.get(admin.userId).items[4],5000);await assert.rejects(()=>call('ban',admin),/EXEMPT/);await assert.rejects(()=>call('enforce',admin),/EXEMPT/);assert.equal(accounts.get(admin.accountId).authVersion,2);assert.equal(revoked,0);});
await test('ban_receipt_does_not_restart_duration',async()=>{reset();await call('recover');const a=await call('ban'),b=await call('ban');assert.equal(a.result.until,b.result.until);assert(b.result.replayed);assert.equal(accounts.get(target.accountId).banHistory.length,1);assert.equal(accounts.get(target.accountId).authVersion,3);assert(!backups[1].passwordHash);});
await test('enforce_revokes_and_kicks_entire_account_with_notice',async()=>{reset();await call('recover');await call('ban');const r=await call('enforce');assert(r.result.active);assert.equal(revoked,1);assert.equal(kicked[0][1].length,2);assert(kicked[0][2].includes('29.640'));assert(kicked[0][2].includes('game và web'));});
await test('unrelated_active_ban_not_overwritten',async()=>{reset();await call('recover');Object.assign(accounts.get(target.accountId),{status:0,banUntil:new Date(Date.now()+86400000),banCode:'OTHER'});await assert.rejects(()=>call('ban'),/UNRELATED_ACTIVE/);});
await test('notice_once_no_attachments',async()=>{reset();await call('recover');await call('ban');await call('notify');await call('notify');assert.equal(mails.size,1);const m=[...mails.values()][0];assert.deepEqual(m.attachments,[]);assert(m.content.includes('29.640'));assert(m.content.includes('Mở khóa'));});
await test('admin_notice_mentions_exemption',async()=>{reset(admin);await call('recover',admin);await call('notify',admin);assert([...mails.values()][0].content.includes('miễn khóa'));});
await test('status_does_not_mutate',async()=>{reset();await svc.dispatch({accountId:target.accountId,action:'status'},ws);assert.equal(saves,0);assert.equal(revoked,0);assert.equal(backups.length,0);});
Module._load=originalLoad;
const result={result:tests.every(t=>t.result==='PASS')?'PASS':'FAIL',count:tests.length,tests,productionWrites:0};fs.writeFileSync(path.join(root,'recovery-tests.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(result.result!=='PASS')process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
