'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const WB=path.resolve(__dirname,'..'),release=path.join(WB,'temp/reward_release_20260905'),app=path.join(release,'app'),config=path.join(release,'config.bin');
const env={...process.env,LHS_APP_ROOT:app,LHS_CONFIG_PATH:config,LHS_LANG_PATH:path.join(release,'lang.bin'),CONFIG_BIN_PATH:config,APP_ROOT:app,ACTIVATION_PASS_APP_ROOT:app,ACTIVATION_PASS_CONFIG:config,NODE_ENV:'test',LOG_DIR:''};
const jobs=['test_reward_release_20260905.js','test_reward_cash_recovery_20260905.js','test_token_recharge_checkpoint3.js','test_cash_recharge_checkpoint4.js','test_activation_pass_fix_20260904.js','test_activation_pass_cash_concurrency_20260904.js','test_appearance_fix_20260905.js'];
const results=[];
for(const job of jobs){const r=cp.spawnSync(process.execPath,['-r',path.join(__dirname,'preload_reward_test_20260905.js'),path.join(__dirname,job)],{env,encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024});
 fs.writeFileSync(path.join(WB,'logs','reward_release_'+job+'.log'),(r.stdout||'')+'\n'+(r.stderr||''));
 results.push({test:job,exit:r.status,error:r.error?.message||'',last:(r.stdout||'').trim().split('\n').slice(-1)[0]});console.log(JSON.stringify(results.at(-1)));}
const core=cp.spawnSync(process.execPath,[path.join(app,'scripts/test-core-gameplay-contract.js')],{env,cwd:app,encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024});
fs.writeFileSync(path.join(WB,'logs/reward_release_core.log'),(core.stdout||'')+'\n'+(core.stderr||''));results.push({test:'core',exit:core.status,last:(core.stdout||'').trim().split('\n').slice(-1)[0]});
fs.writeFileSync(path.join(release,'regressions.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results.at(-1)));
if(results.some(r=>r.exit!==0))process.exitCode=1;
