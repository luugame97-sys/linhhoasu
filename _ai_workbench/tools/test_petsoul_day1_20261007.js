'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..', '..');
const stage = path.join(root, '_ai_workbench/temp/hunth_day1_20261007');
const decode = require(path.join(root, 'linhhoasu/lhs/newServer/src/services/ConfigService')).decodeTables;
const clone = x => JSON.parse(JSON.stringify(x));
const checks = [];
function check(name, fn) { fn(); checks.push(name); }
function equal(a,b) { assert.deepEqual(clone(a),clone(b)); }
function diff(a,b,p='',out=[]) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') { out.push(p); return out; }
  for (const k of new Set([...Object.keys(a),...Object.keys(b)])) diff(a[k],b[k],p ? p+'.'+k : k,out);
  return out;
}
function overlay(folder) {
  const policy=JSON.parse(fs.readFileSync(path.join(stage,folder,'featureDayAccess.json'),'utf8'));
  const ctx={module:{exports:{}},require(id){assert.equal(id,'./featureDayAccess.json');return policy;}};
  vm.runInNewContext(fs.readFileSync(path.join(stage,folder,'featureDayAccess.js'),'utf8'),ctx);
  return ctx.module.exports;
}
function client(folder,tables) {
  const win={GlobalManager:{Config:tables},setTimeout(){throw Error('Unexpected client timer');}};
  vm.runInNewContext(fs.readFileSync(path.join(stage,folder,'feature-day1.js'),'utf8'),{window:win});
  assert.equal(win.LhsFeatureDay1V1.installed,true);
  return win.LhsFeatureDay1V1;
}
async function main() {
  const beforeOverlay=overlay('before'),nextOverlay=overlay('next');
  let serverTables;
  for (const name of ['server_e5.bin','server_fashion.bin','client_e5.bin','client_fashion.bin']) {
    const before=decode(fs.readFileSync(path.join(stage,'before',name)));
    const next=decode(fs.readFileSync(path.join(stage,'next',name)));
    check(name+': sole binary delta',()=>equal(diff(before,next),['SystemConfig.231.openDay']));
    check(name+': day43 to1; unchanged prerequisites',()=>{
      assert.equal(before.SystemConfig[231].openDay,43);assert.equal(next.SystemConfig[231].openDay,1);
      equal(next.SystemConfig[231].conditions,[{type:7,value:206,cond:4},{type:3,value:135,cond:4}]);
    });
    const old=clone(before);beforeOverlay.apply(old);
    const server=clone(before);nextOverlay.apply(server);
    check(name+': sole overlay delta',()=>equal(diff(old,server),['SystemConfig.231.openDay']));
    const browser=clone(before),api=client('next',browser);
    check(name+': server/client parity',()=>equal(server,browser));
    const once=clone(server);nextOverlay.apply(server);api.apply(browser);
    check(name+': server/client idempotent',()=>{equal(server,once);equal(browser,once);});
    if(name==='server_fashion.bin')serverTables=server;
  }
  const source=fs.readFileSync(path.join(stage,'before','upgrade.js'),'utf8');
  const hash=crypto.createHash('sha256').update(source).digest('hex');
  assert.equal(hash,'48798f66479633a5dedfac552e3e6d905e8003fc328eabe02455e3ebbc144e41');
  let blockedIO=0;
  const forbidden=()=>{blockedIO++;throw Error('IO forbidden in RAM fixture');};
  const ctx={module:{exports:{}},process:{env:{}},console:{log(){}},require(id){
    if(id==='../services/ConfigService')return {get:n=>serverTables[n]};
    if(id==='./playerPayload')return {normalizeTaskInfo:t=>t};
    if(id==='../services/PlayerService')return {savePlayer:forbidden};
    if(id==='../services/ServerConfigService')return {findServerConfig:forbidden};
    if(id==='../logger')return {warn(){}};
    return {};
  }};
  vm.runInNewContext(source+'\nmodule.exports.__condition=isSystemConditionMet;',ctx,{timeout:1000});
  const evaluate=async(level,unlocked,taskId,day)=>{
    const player={level,taskInfo:{tasksMap:{1:[{id:taskId,status:10}]}}};
    for(const condition of serverTables.SystemConfig[231].conditions)
      if(!await ctx.module.exports.__condition(player,condition,new Set(unlocked),0,{systemId:231,serverRunDay:day}))return false;
    return true;
  };
  for(const day of [1,5,42]) {
    assert.equal(await evaluate(134,[206],10109,day),false);checks.push('day'+day+': level134 blocked');
    assert.equal(await evaluate(135,[206],10109,day),true);checks.push('day'+day+': level135 +206 passes');
    assert.equal(await evaluate(135,[],10108,day),false);checks.push('day'+day+': missing206 +task10108 blocked');
    assert.equal(await evaluate(135,[],10109,day),true);checks.push('day'+day+': recursive206 eligible task passes');
  }
  assert.equal(blockedIO,0);
  const result={result:'PASS',checks:checks.length,details:checks,upgradeSource:'exact live fetched read-only',upgradeSha256:hash,productionWrites:0,networkAttemptsInFixture:0,taskNormalization:'fixture pass-through; native task condition evaluator retained',scope:'config binaries, server/client overlay, native server conditions; no player mutation'};
  fs.writeFileSync(path.join(stage,'test_server.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
