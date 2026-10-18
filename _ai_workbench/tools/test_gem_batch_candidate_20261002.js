'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..','..');process.env.CONFIG_BIN_PATH=path.join(root,'_ai_workbench/temp/petsoul_release_20261002/baseline/config.bin');
const Config=require(path.join(root,'linhhoasu/lhs/newServer/src/services/ConfigService')),tables=Config.loadAllTables();require(path.join(root,'_ai_workbench/temp/gem10_candidate_20261002/server/config/gemLevel10Choice')).apply(tables);
let saves=0,fail=false;const sandbox={module:{exports:{}},require(name){if(name==='../services/ConfigService')return Config;if(name==='../services/PlayerService')return{savePlayer:async()=>{saves++;return fail?false:true},drainPendingSaves:async()=>{}};if(name==='../services/MainTaskProgressService')return{addGemComposeCount:()=>false,addGemObtainCount:()=>false};if(name==='../services/PlayerMutationService')return{run:(_u,work)=>work()};throw Error('unexpected:'+name)}};
vm.runInNewContext(fs.readFileSync(path.join(root,'_ai_workbench/temp/gem10_candidate_20261002/server/handlers/gem.js'),'utf8'),sandbox);
const h=sandbox.module.exports;
function sess(ids){const p={userId:'GEM_BATCH_FIXTURE',items:{},currencies:{diamond:0,gold:0,silver:0},other_attr_info:{},roleInfo:{stage:1},level:200,exp:0};h.ensureGemInfo(p);p.other_attr_info.gemInfo.gems=ids.map((id,i)=>({id,uid:i+1,shapeId:1}));p.other_attr_info.gemInfo.nextUid=ids.length+1;return{userId:p.userId,player:p}}
function pkt(x){return(Array.isArray(x)?x:[x]).find(p=>p.tag===3903&&p.msgUid!==0)?.data}
(async()=>{let cases=0;
 const s=sess([25001,25001,25001]);const r=pkt(await h.handleGemAutoCompose({targetLevel:6,level:6},s,1));assert.equal(r.result,0);assert.equal(r.gems.length,1);assert.equal(r.gems[0].id,25011);cases++;
 const sp=sess([25051,25051,25052,25052]);const x=pkt(await h.handleGemAutoCompose({targetLevel:7,level:7},sp,2));assert.equal(x.result,0);assert.equal(x.gems[0].id,25061);cases++;
 const s11=sess([25101,25101,25101]);const y=pkt(await h.handleGemAutoCompose({targetLevel:100,level:100},s11,3));assert.equal(y.gems[0].id,25111);cases++;
 const s100=sess([25991,25991,25991]);const z=pkt(await h.handleGemAutoCompose({targetLevel:100,level:100},s100,4));assert.equal(z.costs.length,0);assert.equal(z.gems.length,0);cases++;
 fail=true;const bad=sess([25001,25001,25001]);const f=pkt(await h.handleGemAutoCompose({targetLevel:6,level:6},bad,5));assert.equal(f.result,-1);assert.equal(bad.player,null);cases++;
 console.log(JSON.stringify({pass:true,cases,saves,network:'blocked',playerWrites:0,finalResponseOnly:true}));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
