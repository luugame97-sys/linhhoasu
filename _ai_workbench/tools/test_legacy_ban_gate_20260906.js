'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const acorn=require(path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
const root=path.resolve(process.argv[2]),ban=require(path.join(root,'app/src/services/AccountBanService'));
function extract(file){const source=fs.readFileSync(file,'utf8'),ast=acorn.parse(source,{ecmaVersion:'latest'}),node=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='handleLogin');return source.slice(node.start,node.end);}
const before=extract(path.join(root,'account.before.js')),after=extract(path.join(root,'app/src/handlers/account.js'));
function fixture(source,owner,p={},sid=1001){let saves=0,queries=0;const player={userId:'legacy_s'+sid,accountId:'owner',...p};const run=vm.runInNewContext('('+source+')',{
 process:{env:{SERVER_ID:String(sid)}},isManagedBotLogin:()=>false,serverAccessService:{resolveServerAccess:async()=>({ok:true})},
 playerMutation:{run:async(k,fn)=>fn()},playerService:{drainPendingSaves:async()=>{},loadPlayer:async()=>player,savePlayer:async()=>saves++},
 accountService:{},logger:{info(){throw Error('PASSED_BAN_GATE');}},require:name=>name.includes('AccountBanService')?ban:{findOne:q=>{queries++;return{lean:async()=>owner};}},
 });return{run:session=>run({platformuid:'legacy',serverid:sid},session,99),saves:()=>saves,queries:()=>queries};}
const blocked={accountId:'owner',status:0,banUntil:new Date(Date.now()+3600000),banCode:'FISH_FREE_20260906',banReason:'Nhận vượt giới hạn'};
const tests=[];async function test(name,fn){await fn();tests.push({name,result:'PASS'});}
(async()=>{
await test('baseline_bypasses_account_ban_on_legacy_entry',async()=>{const f=fixture(before,blocked);await assert.rejects(()=>f.run({}),/PASSED_BAN_GATE/);assert.equal(f.queries(),0);});
for(const sid of [1001,1002])await test('banned_account_denied_before_mutation_s'+sid,async()=>{const f=fixture(after,blocked,{},sid),session={};const r=await f.run(session);assert.equal(r[0].tag,9);assert.equal(r[1].data.result,-1);assert.equal(r[1].data.code,'FISH_FREE_20260906');assert(r[0].data.msg.includes('khóa'));assert.equal(session.player,null);assert.equal(f.saves(),0);});
await test('legacy_missing_accountId_uses_role_owner',async()=>{const f=fixture(after,blocked,{accountId:''});assert.equal((await f.run({}))[1].data.result,-1);assert.equal(f.queries(),1);});
await test('permanent_ban_denied',async()=>{const f=fixture(after,{...blocked,banUntil:null});assert.equal((await f.run({}))[1].data.result,-1);});
await test('expired_ban_can_continue_without_mutating_account',async()=>{const expired={...blocked,banUntil:new Date(Date.now()-1)};const f=fixture(after,expired);await assert.rejects(()=>f.run({}),/PASSED_BAN_GATE/);assert.equal(expired.status,0);});
await test('vanduc97_active_and_guest_unchanged',async()=>{for(const owner of [null,{accountId:'vanduc97',status:1}])await assert.rejects(()=>fixture(after,owner).run({}),/PASSED_BAN_GATE/);});
const report={result:'PASS',count:tests.length,tests,realPlayerWrites:0};fs.writeFileSync(path.join(root,'legacy-ban-gate-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
