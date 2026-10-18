'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process'),assert=require('assert/strict');
const wb=path.resolve(__dirname,'..'),root=path.join(wb,'temp/fishing_contest_shop_20260906'),app=path.resolve(wb,'../linhhoasu/lhs/newServer'),game=path.resolve(wb,'../linhhoasu/webgame/game');
const read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8')),write=(n,v)=>fs.writeFileSync(path.join(root,n),JSON.stringify(v,null,2)+'\n');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),lf=v=>v.toString('utf8').replace(/\r\n/g,'\n');
const stage=read('stage.json'),deploy=read('deploy.json'),verify=read('verify.json');
assert.equal(deploy.result,'DEPLOYED');assert.equal(verify.result,'VERIFIED');assert.deepEqual(deploy.afterPm2,verify.pm2);
const specs=stage.files.map(rel=>({local:path.join(app,rel),candidate:path.join(root,'app',rel),remote:'/linhhoasu/lhs/newServer/'+rel}));
specs.push({local:path.join(game,'js/main.min_a6195824.js'),candidate:path.join(root,'main.fixed.js'),remote:'/linhhoasu/webgame/game/js/main.min_a6195824.js'},
 {local:path.join(game,'index.html'),candidate:path.join(root,'index.fixed.html'),remote:'/linhhoasu/webgame/game/index.html'});
const files=specs.map(spec=>{const a=fs.readFileSync(spec.local),b=fs.readFileSync(spec.candidate);assert.equal(sha(b),deploy.expected[spec.remote]);assert.equal(lf(a),lf(b),'LOCAL_DRIFT_'+spec.local);if(spec.local.endsWith('.js'))assert.equal(cp.spawnSync(process.execPath,['--check',spec.local],{encoding:'utf8',timeout:30000,windowsHide:true}).status,0,'SYNTAX_FAIL');return {...spec,sha256:sha(b),localSha256:sha(a),byteEqual:a.equals(b),normalizedEqual:true};});
const core=cp.spawnSync(process.execPath,['scripts/test-core-gameplay-contract.js'],{cwd:app,encoding:'utf8',timeout:55000,windowsHide:true,env:{...process.env,CONFIG_BIN_PATH:path.join(root,'server.bin'),NODE_ENV:'test',LOG_DIR:''}});
write('local-core.json',{status:core.status,stdout:core.stdout,stderr:core.stderr});assert.equal(core.status,0,'CORE_FAILED');
write('changed-files.json',{deployed:true,files});
write('checkpoint.json',{status:'deployed_verified',release:'20260906_fishing_shop_v1',startedAt:deploy.startedAt,finishedAt:deploy.finishedAt,verifiedAt:verify.time,
 freeShop:{id:11001400,limit:1,period:'day_GMT8',existingClaimPreserved:true},paidShops:{11001401:50,11001402:50,11001403:100,11001404:100,11001405:100},paidPeriod:'current_7day_contest_instance',
 priceAndUnitRewardsChanged:false,compensation:false,realPlayerHistoricalReset:false,sourceFiles:stage.files,backup:deploy.backup,
 tests:{free:19,paid:16,gameplay:30,core:'PASS',liveQa:deploy.liveQa,cashExternalE2e:false,nativeListExtractedFunction:true,nativeVisualScreenshot:false},
 report:'../../reports/fishing_contest_shop_fix_20260906.md',html:'../../reports/fishing_contest_shop_fix_20260906.html'});
console.log(JSON.stringify({result:'PASS',files:files.length,byteEqual:files.filter(f=>f.byteEqual).length,normalizedEqual:files.length,syntaxJs:specs.filter(f=>f.local.endsWith('.js')).length,core:'PASS'}));
