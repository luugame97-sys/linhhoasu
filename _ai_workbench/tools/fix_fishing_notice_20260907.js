'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),vm=require('vm');
const acorn=require(path.resolve('linhhoasu/lhs/newServer/node_modules/acorn'));
const baseline=path.resolve('_ai_workbench/temp/fishing_audit_20260906T211352Z'),root=path.resolve('_ai_workbench/temp/fishing_notice_20260907');fs.mkdirSync(root,{recursive:true});
const source=fs.readFileSync(path.join(baseline,'main.js'),'utf8'),marker='m.onTaskUpdate=function';
const p=source.indexOf(marker);assert(p>0&&source.indexOf(marker,p+1)<0);
let node=acorn.parseExpressionAt(source,p+marker.indexOf('function'),{ecmaVersion:'latest'});if(node.type==='SequenceExpression')node=node.expressions[0];
const before=source.slice(node.start,node.end);
const start='function(t){if(this._taskInfo&&this._taskInfo.tasksMap){';assert(before.startsWith(start));
const after=before.replace(start,start+'var lhsFishingTask=t&&t.task&&Number(t.task.type)===(6006|1073741824)&&Number(t.task.id)>=60601&&Number(t.task.id)<=60608,lhsPrevStatus=null;if(lhsFishingTask){var lhsOldRows=this._taskInfo.tasksMap[t.task.type]||[];for(var lhsI=0;lhsI<lhsOldRows.length;lhsI++)if(lhsOldRows[lhsI].id===t.task.id){lhsPrevStatus=Number(lhsOldRows[lhsI].status);break;}}')
 .replace('this.checkShowTaskcompleteTip(t.task)','(!lhsFishingTask||lhsPrevStatus!==20)&&this.checkShowTaskcompleteTip(t.task)');
assert(after!==before&&after.includes('lhsPrevStatus!==20'));
const next=source.slice(0,node.start)+after+source.slice(node.end);acorn.parse(next,{ecmaVersion:'latest'});
fs.writeFileSync(path.join(root,'main.fixed.js'),next);
fs.writeFileSync(path.join(root,'client-edit.json'),JSON.stringify({marker,before,after},null,2));
const checks=[];
function check(name,fn){fn();checks.push(name);}
let notices=0,dispatches=0;const type=6006|1073741824;
const ctx={Y:{Config:{TaskConfig:{60601:{type:6},60602:{type:6},700:{type:8}}},UnlockSystem:{sendConditionSystems(){}},GuideUtil:{taskGuideCheck(){}}},A:{ins:()=>({dispatch(){dispatches++;}})},E:{Game_Task_Update:'task'}};
const nativeBefore=vm.runInNewContext('('+before+')',ctx),nativeAfter=vm.runInNewContext('('+after+')',ctx);
function model(status=10){return{_taskInfo:{tasksMap:{[type]:[{id:60601,type,status,progress:status===10?99:100}]}},checkShowTaskcompleteTip(t){if(t.status===20)notices++;}};}
const send=(fn,m,id,status,progress=100)=>fn.call(m,{task:{id,type,status,progress}});
check('baseline repeats banner for identical status20',()=>{notices=0;const m=model();for(let i=0;i<20;i++)send(nativeBefore,m,60601,20);assert.equal(notices,20);});
check('fixed 100 identical packets produce one completion',()=>{notices=0;const m=model();for(let i=0;i<100;i++)send(nativeAfter,m,60601,20);assert.equal(notices,1);assert.equal(m._taskInfo.tasksMap[type][0].status,20);});
check('login snapshot already complete is not a new completion',()=>{notices=0;const m=model(20);send(nativeAfter,m,60601,20);assert.equal(notices,0);});
check('claimed state remains claimed and silent',()=>{notices=0;const m=model(20);send(nativeAfter,m,60601,30);send(nativeAfter,m,60601,30);assert.equal(notices,0);assert.equal(m._taskInfo.tasksMap[type][0].status,30);});
check('new round may notify again',()=>{notices=0;const m=model();send(nativeAfter,m,60601,20);send(nativeAfter,m,60601,30);send(nativeAfter,m,60601,10,0);send(nativeAfter,m,60601,20);assert.equal(notices,2);});
check('next fishing milestone independent',()=>{notices=0;const m=model();send(nativeAfter,m,60601,20);send(nativeAfter,m,60602,20,300);send(nativeAfter,m,60602,20,300);assert.equal(notices,2);});
check('non-fishing behavior unchanged',()=>{notices=0;const m=model();nativeAfter.call(m,{task:{id:700,type:8,status:20}});nativeAfter.call(m,{task:{id:700,type:8,status:20}});assert.equal(notices,2);});
check('incomplete progress still reaches UI listeners',()=>{notices=0;dispatches=0;const m=model();for(let i=0;i<10;i++)send(nativeAfter,m,60601,10,i);assert.equal(notices,0);assert.equal(dispatches,20);assert.equal(m._taskInfo.tasksMap[type][0].progress,9);});
check('no initialized task state remains no-op',()=>{nativeAfter.call({_taskInfo:null},{task:{id:60601,type,status:20}});});
const result={result:'PASS',checks:checks.length,details:checks,scope:'native onTaskUpdate extracted before/after; no rewards/DB changes'};
fs.writeFileSync(path.join(root,'client-tests.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
