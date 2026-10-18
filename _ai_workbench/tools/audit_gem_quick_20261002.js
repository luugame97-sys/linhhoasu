'use strict';
// Exact downloaded live handler with pure config and mocked persistence.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'_ai_workbench/temp/gem_quick_audit_20261002');
const cfg=require(path.join(root,'linhhoasu/lhs/newServer/src/services/ConfigService')).decodeTables(fs.readFileSync(path.join(root,'_ai_workbench/temp/petsoul_release_20261002/baseline/config.bin')));
const handlerPath=path.join(root,'_ai_workbench/temp/item_boxes_20261002/baseline/server/handlers/gem.js');
const sandbox={module:{exports:{}},require(name){
 if(name==='../services/ConfigService')return{get:n=>cfg[n]};
 if(name==='../services/PlayerService')return{savePlayer:async()=>true};
 if(name==='../services/MainTaskProgressService')return{addGemComposeCount:()=>false,addGemObtainCount:()=>false,refreshMainTaskProgress:()=>false};
 throw Error('UNEXPECTED_DEPENDENCY:'+name);
}};
vm.runInNewContext(fs.readFileSync(handlerPath,'utf8'),sandbox,{filename:handlerPath});
const h=sandbox.module.exports;
function session(rows){let uid=1;const gems=rows.flatMap(([id,n])=>Array.from({length:n},()=>({id,uid:uid++,shapeId:1})));return{userId:'ISOLATED_GEM_AUDIT',player:{other_attr_info:{gemInfo:{gems,plan:{id:0,positions:[]},nextUid:uid}},items:{},currencies:{}}};}
function brief(rows){const m={};for(const g of rows){const key=String(cfg.GemLevelConfig[g.id].level);m[key]=(m[key]||0)+1;}return m;}
async function quick(name,rows,level){const s=session(rows),reply=await h.handleGemAutoCompose({level},s,1);const remaining=s.player.other_attr_info.gemInfo.gems;return{name,replyTag:reply.tag,consumed:reply.data.costs.length,serverLevels:brief(remaining),returnedLevels:brief(reply.data.gems),phantomReturned:reply.data.gems.filter(g=>!remaining.some(x=>x.uid===g.uid)).length};}
async function special(name,id,rows){const s=session(rows),reply=await h.handleGemSpecialCompose({id,count:1,compose:true},s,2);return{name,consumed:reply.data.uids.length,serverLevels:brief(s.player.other_attr_info.gemInfo.gems),returnedLevels:brief(reply.data.gems)};}
(async()=>{
const cases=[];
cases.push(await quick('normal_1_to_6',[[25001,243]],6));assert.equal(cases.at(-1).serverLevels[6],1);
cases.push(await quick('level6_no_normal_successor',[[25051,3]],100));assert.equal(cases.at(-1).consumed,0);
cases.push(await quick('level7_special_only',[[25061,3]],100));assert.equal(cases.at(-1).consumed,0);
cases.push(await quick('level10_special_only',[[25091,3]],100));assert.equal(cases.at(-1).consumed,0);
cases.push(await quick('level11_to12_normal',[[25101,3]],100));assert.equal(cases.at(-1).serverLevels[12],1);
cases.push(await quick('level99_to100',[[25981,3]],100));assert.equal(cases.at(-1).serverLevels[100],1);
cases.push(await quick('level100_terminal',[[25991,3]],100));assert.equal(cases.at(-1).consumed,0);
cases.push(await special('special6_to7',25061,[[25051,2],[25052,2]]));assert.equal(cases.at(-1).serverLevels[7],1);assert.equal(cases.at(-1).consumed,4);
cases.push(await special('special7_to8',25071,[[25061,3]]));assert.equal(cases.at(-1).serverLevels[8],1);
cases.push(await special('special10_to11',25101,[[25091,3]]));assert.equal(cases.at(-1).serverLevels[11],1);
const report={at:new Date().toISOString(),scope:'read-only live source/config; fixture local, no network/database/player writes',maxQuickLevel:cfg.GemBaseConfig.maxQuickLevel,maxGemLevel:Math.max(...Object.values(cfg.GemLevelConfig).map(r=>r.level)),count:Object.keys(cfg.GemLevelConfig).length,cases,confirmedPacketIssue:cases[0].phantomReturned>0};
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
