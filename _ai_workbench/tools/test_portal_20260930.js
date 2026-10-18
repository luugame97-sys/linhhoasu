const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const base=path.resolve(__dirname,'../temp/sso_release_20260930/candidate');
let now=0,store=new Map(),tokens=new Map(),serial=0;
const account={accountId:'fixture',authVersion:1,status:1,roles:[{serverId:1006,userId:'u6',roleId:'r6'}]};
const deps={
 './AuthSessionService':{get:async t=>tokens.get(t),remove:async t=>tokens.delete(t),create:async p=>{let token='ats_fixture_'+(++serial).toString(16).padStart(32,'0');tokens.set(token,p);return {token};}},
 './AccountService':{findAccount:async id=>id===account.accountId?account:null,authenticateAccountDetailed:async(a,p)=>({account:a==='fixture'&&p==='fixture-pass'?account:null})},
 './AccountBanService':{inspectBanState:a=>({banned:a.status===0})},
 './ServerConfigService':{listAllServers:async()=>[{serverId:1001,running:true,status:1,openTime:1},{serverId:1006,running:true,status:1,openTime:2}]},
 './ServerAccessService':{resolveServerEntryState:()=>2},
 '../handlers/serverList':{buildWsEndpoint:(r,sid)=>({url:r.hostname+':443/ws'+(sid===1001?'':'-s6')})},
 '../db/models/Player':{findOne:q=>({select:()=>({lean:async()=>q.playerId==='p6'?{userId:'u6',serverId:1006,accountId:'fixture'}:null})})},
 '../db/redis':{getClient:()=>({set:async(k,v,ex,ttl)=>{assert.equal(ex,'EX');assert.equal(ttl,30);store.set(k,{v,until:now+ttl});},eval:async(script,num,key,nonce)=>{assert.match(script,/redis.call\('DEL'/);let x=store.get(key);if(!x||now>=x.until)return null;let d=JSON.parse(x.v);if(d.nonce!==nonce)return null;store.delete(key);return x.v;}})}
};
function load(){let mod={exports:{}};vm.runInNewContext(fs.readFileSync(base+'/lhs/newServer/src/services/PortalSessionService.js','utf8'),{module:mod,exports:mod.exports,require:n=>n==='crypto'?require(n):(deps[n]||(()=>{throw Error('unexpected require '+n)})()),process:{env:{SERVER_ID:'1006'}},Map,Date,JSON});return mod.exports;}
(async()=>{let svc=load(), count=0;const pass=()=>count++;
 await assert.rejects(svc.dispatch({action:'login',account:'fixture',password:'wrong'}));pass();
 let login=await svc.dispatch({action:'login',account:'fixture',password:'fixture-pass'}),token=login.token;
 assert.equal(tokens.get(token).portal,true);assert.equal(account.roles.length,1);pass();
 let boot=await svc.dispatch({action:'bootstrap',token,host:'linhhoasu.lol'},{});assert.equal(boot.data.newReg,0);assert.equal(boot.data.servers.length,2);pass();
 await assert.rejects(svc.dispatch({action:'bootstrap',token,host:'evil.test'},{}));pass();
 await assert.rejects(svc.dispatch({action:'ticket',token,serverId:1001,playerId:'p6',nonce:'a'.repeat(64)}));pass();
 await assert.rejects(svc.dispatch({action:'ticket',token,serverId:1006,playerId:'other',nonce:'a'.repeat(64)}));pass();
 let ticket=await svc.dispatch({action:'ticket',token,serverId:1006,playerId:'p6',nonce:'a'.repeat(64)});
 await assert.rejects(svc.dispatch({action:'consume',ticket:ticket.ticket,nonce:'b'.repeat(64)}));pass();
 let consumed=await svc.dispatch({action:'consume',ticket:ticket.ticket,nonce:'a'.repeat(64)});assert.equal(consumed.serverId,1006);assert.equal(consumed.account,'fixture');pass();
 await assert.rejects(svc.dispatch({action:'consume',ticket:ticket.ticket,nonce:'a'.repeat(64)}));pass();
 ticket=await svc.dispatch({action:'ticket',token,serverId:1006,playerId:'p6',nonce:'a'.repeat(64)});now=31;
 await assert.rejects(svc.dispatch({action:'consume',ticket:ticket.ticket,nonce:'a'.repeat(64)}));pass();
 account.authVersion=2;await assert.rejects(svc.dispatch({action:'check',token}));account.authVersion=1;pass();
 account.status=0;await assert.rejects(svc.dispatch({action:'check',token}));account.status=1;pass();
 await svc.dispatch({action:'logout',token});await assert.rejects(svc.dispatch({action:'check',token}));pass();
 for(const file of ['index.html','register.html']){const html=fs.readFileSync(base+'/webgame/game/'+file,'utf8');for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);}pass();
 const client=fs.readFileSync(base+'/webgame/game/js/main.min_drop100.js','utf8');assert.equal((client.match(/if\(window.LhsPortalLaunch\)return window.LhsPortalLaunch\(this\);/g)||[]).length,1);pass();
 console.log(JSON.stringify({passed:count,productionWrites:0,networkAttempts:0,scope:'service fixture and client syntax; not live E2E'}));
})().catch(e=>{console.error(e);process.exitCode=1});
