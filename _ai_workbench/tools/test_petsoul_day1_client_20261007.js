'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../temp/hunth_day1_20261007');
const clone=x=>JSON.parse(JSON.stringify(x));
const beforePolicy=require(path.join(root,'before/featureDayAccess.js'));
const nextPolicy=require(path.join(root,'next/featureDayAccess.js'));
const {decode}=require('./build_fishing_rank_x10_20260907');
let count=0;
function loadClient(rel,tables){let timers=0;const win={setTimeout:()=>{timers++;},GlobalManager:{Config:tables}};const src=fs.readFileSync(path.join(root,rel),'utf8');vm.runInNewContext(src,{window:win,console,Number,Set,Object,Array});return {api:win.LhsFeatureDay1V1,timers};}
const raw=Object.fromEntries(decode(fs.readFileSync(path.join(root,'before/client_e5.bin'))).map(f=>[f.name,f.value]));
const old=clone(raw),next=clone(raw),server=clone(raw);
loadClient('before/feature-day1.js',old);const actual=loadClient('next/feature-day1.js',next);nextPolicy.apply(server);
assert(actual.api.installed);assert.equal(actual.timers,0);count++;
assert.deepEqual(next,server,'client/server overlay parity');count++;
const restored=clone(next);restored.SystemConfig[231].openDay=old.SystemConfig[231].openDay;assert.deepEqual(restored,old,'only System231.openDay differs from old policy');count++;
assert.equal(next.SystemConfig[231].openDay,1);assert.deepEqual(next.SystemConfig[231].conditions,raw.SystemConfig[231].conditions);count++;
const unchanged=clone(next);actual.api.apply(next);assert.deepEqual(next,unchanged);count++;
assert.deepEqual(clone(actual.api.policy),nextPolicy.policy);count++;
for(const id of [206,315,322]){assert.deepEqual(next.SystemConfig[id],old.SystemConfig[id]);count++;}
// Missing dependent configs are retried, with no success marker or gameplay calls.
let calls=0;const delayed={setTimeout:()=>{calls++;}};vm.runInNewContext(fs.readFileSync(path.join(root,'next/feature-day1.js'),'utf8'),{window:delayed,Number,Set,Object,Array});assert.equal(calls,1);assert.equal(delayed.LhsFeatureDay1V1.installed,false);count++;
const index=fs.readFileSync(path.join(root,'next/index.html'),'utf8');assert(index.includes('js/lhs-feature-day1-v1.js?v=20261007_feature_day1_v2'));assert(index.includes("? '20261007_hunth_day1_v1' : translationVersion"));count++;
const report={result:'PASS',checks:count,mode:'RAM_ONLY',serverClientParity:true,only231Delta:true,idempotent:true,networkCalls:0,playerWrites:0,version:actual.api.version};
fs.writeFileSync(path.join(root,'test_client.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
