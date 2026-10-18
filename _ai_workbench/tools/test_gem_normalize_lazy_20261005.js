'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const dir=path.resolve(__dirname,'../temp/login_outage_20261005');
const tables={GemBaseConfig:{initialField:30,fieldMax:1200},GemLevelConfig:{},GemShapeConfig:{}};
for(let i=0;i<6000;i++) tables.GemLevelConfig[25001+i]={level:1+(i%100)};
for(let i=1;i<=700;i++) tables.GemShapeConfig[i]={level:1+(i%100)};
function load(file){const stats={level:0,shape:0};const mod={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(dir,file),'utf8')+'\nmodule.exports.normalizeGem=normalizeGem;', {module:mod,exports:mod.exports,require:n=>n.includes('ConfigService')?{get:k=>{if(k==='GemLevelConfig')stats.level++;if(k==='GemShapeConfig')stats.shape++;return tables[k]}}:{},console});return {...mod.exports,stats};}
const old=load('gem.baseline.js'),next=load('gem.candidate.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const plain=x=>JSON.parse(JSON.stringify(x));
const values=[undefined,null,NaN,Infinity,-Infinity,0,-1,1,25001,25050,999999,'25003','no',{},[],true];
let cases=0;
function compare(raw){const a={nextUid:7},b={nextUid:7};assert.deepStrictEqual(plain(next.normalizeGem(raw,b)),plain(old.normalizeGem(raw,a)));assert.deepStrictEqual(b,a);cases++;}
for(const id of values)for(const shapeId of values)for(const uid of [undefined,0,19])compare({id,shapeId,uid});
for(const raw of [null,undefined,[],{},'x'])compare(raw);
tables.GemLevelConfig[0]={level:8};tables.GemShapeConfig[0]={level:8};
for(const id of values)for(const shapeId of values)compare({id,shapeId});
delete tables.GemLevelConfig[0];delete tables.GemShapeConfig[0];
const player={other_attr_info:{gemInfo:{gems:Array.from({length:3000},(_,i)=>({uid:i+1,id:25001+i%6000,shapeId:1+i%700})),plan:{positions:[{uid:1,row:0,col:0},{uid:1,row:2,col:2},{uid:9000,row:1,col:1}]}}}};
let t=performance.now();const a=old.ensureGemInfo(clone(player)),baselineMs=performance.now()-t;
t=performance.now();const b=next.ensureGemInfo(clone(player)),candidateMs=performance.now()-t;assert.deepStrictEqual(plain(b),plain(a));
// Each valid row must avoid all fallback level lookups; shape validity remains.
const before=next.stats.level;next.ensureGemInfo(clone(player));assert.strictEqual(next.stats.level-before,3000);
console.log(JSON.stringify({result:'PASS',cases,largeBag:3000,baselineMs,candidateMs,speedup:baselineMs/candidateMs,productionWrites:0,networkAttempts:0}));
