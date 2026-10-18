'use strict';
const cp=require('child_process'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..'),app=path.join(root,'linhhoasu/lhs/newServer');
const out={at:new Date().toISOString(),directPlayerWrites:0,env:{ROLE_LEVEL_2000_ENABLED:'1',SERVER_ID:'1001'},tests:[]};
const tests=['test-role-level2000.js','test-cultivation-progression-v2.js','test-core-gameplay-contract.js','test-alchemy-material-sources.js'];
for(const script of tests){
 const result=cp.spawnSync(process.execPath,['scripts/'+script],{cwd:app,env:{...process.env,...out.env},encoding:'utf8',timeout:50000,windowsHide:true});
 out.tests.push({script,exit:result.status,stdout:result.stdout,stderr:result.stderr,error:result.error?.message});
 if(result.status!==0)throw Error('QA_FAILED:'+script+':'+result.stderr);
}
const files=['src/config/roleLevel2000.js','src/services/CultivationProgressionService.js','src/services/ConfigService.js','src/services/PlayerService.js','src/handlers/upgrade.js','src/handlers/playerPayload.js'];
out.sourceHashes=Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(app,f))).digest('hex')]));
out.result='PASS';const target=path.join(root,'_ai_workbench/temp/role_level2000_20260922/qa.json');
fs.writeFileSync(target,JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({result:out.result,tests:out.tests.map(r=>({script:r.script,exit:r.exit})),evidence:target}));
