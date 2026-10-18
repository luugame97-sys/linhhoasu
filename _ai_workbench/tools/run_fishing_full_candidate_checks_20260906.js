'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=path.resolve(process.argv[2]),tools=__dirname,env={...process.env,
 NODE_PATH:path.resolve(tools,'../../linhhoasu/lhs/newServer/node_modules'),FISH_ROOM_REGISTRY:'1',FISH_AUTO_FRAMED:'1',
 AUTO_ORIGINAL_MAIN:path.resolve(tools,'../temp/fishing_auto_20260906/main.js'),AUTO_SKIP_COMMERCE_DIAGNOSTICS:'1',
 DAILY_BASE_SOURCE:path.resolve(tools,'../temp/fishing_audit_20260906T041024Z/app/src/handlers/commerce-compat.js'),
 NODE_ENV:'test',LOG_DIR:'',CONFIG_BIN_PATH:path.join(root,'server.bin')};
const result=[];
for(const script of ['test_fishing_full_known_20260906.js','test_fishing_auto_20260906.js','test_fishing_gear_fix_20260906.js','test_fishing_balance_20260906.js','test_huyenvu_daily_20260906.js']){
 const args=/test_fishing_(balance|gear_fix)_/.test(script)?['--require',path.join(tools,'fishing_legacy_regression_adapter_20260906.js')]:[];
 const out=cp.spawnSync(process.execPath,[...args,path.join(tools,script),root],{env,encoding:'utf8',timeout:40000});
 let parsed;try{parsed=JSON.parse(out.stdout);}catch{}
 const entry={script,adapter:args.length>0?'legacy cost/storage (generator tested separately)':null,exitCode:out.status,result:parsed?.result||'ERROR',count:parsed?.count,failures:(parsed?.checks||parsed?.tests||parsed?.cases||[]).filter(t=>t.result==='FAIL'||['FAIL','PROBE_ERROR'].includes(t.status)).map(t=>({name:t.name,error:t.error})),stderr:out.stderr?.slice(0,1800)};
 result.push(entry);console.log(JSON.stringify(entry));
}
fs.writeFileSync(path.join(root,'regression-summary.json'),JSON.stringify(result,null,2)+'\n');
if(result.some(r=>r.exitCode!==0))process.exitCode=1;
