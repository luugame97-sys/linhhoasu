'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),vm=require('vm');
const root=path.resolve(__dirname,'../../linhhoasu/lhs/newServer');
const src=fs.readFileSync(path.join(root,'src/handlers/serverList.js'),'utf8');
const a=src.indexOf('async function buildRecentLoginServers('),b=src.indexOf('\nfunction uniqueTextList',a);
const c={buildRoleSummary:r=>r,buildServerData:async(id,_req,_now,r)=>({serverId:id,...r})};vm.createContext(c);vm.runInContext(src.slice(a,b)+';this.f=buildRecentLoginServers;this.r=recentRolesFromAccount;',c);
(async()=>{const account={roles:[{serverId:1001,lastLoginTime:100,userId:'s1'},{serverId:1002,lastLoginTime:200,userId:'s2'}]};assert.deepEqual(c.r(account),account.roles);const rows=await c.f(c.r(account),null,0);assert.equal(JSON.stringify(rows.map(x=>x.serverId)),JSON.stringify([1002,1001]));console.log(JSON.stringify({result:'PASS',crossDbMetadata:true,recentFirst:1002,playerDbReads:0}));})().catch(e=>{console.error(e);process.exitCode=1;});
