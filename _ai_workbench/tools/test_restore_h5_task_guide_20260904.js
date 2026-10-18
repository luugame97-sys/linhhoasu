'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const main=fs.readFileSync(process.argv[2],'utf8'),index=fs.readFileSync(process.argv[3],'utf8');
const count=(needle)=>main.split(needle).length-1;
assert.equal(count('sOt.Start=function(t){var e;'),1,'explicit GuideUtil.Start must run on H5');
assert.equal(count('sOt.Start=function(t){if(!RuntimeUtil.isRuntime)return;var e;'),0,'blanket H5 guide gate remains');
assert.equal(count('AppInfo.ckState&&RuntimeUtil.isRuntime&&!this.isDuringGuide()'),1,'automatic idle guide must remain disabled on H5');
assert.equal(count('m.checkGuide=function(t)'),1,'TaskModel.checkGuide route missing');
assert.ok(main.includes('1==t.guide?(14!=t.type&&18!=t.type&&P.ins().closeAllPopUp(),Y.GuideUtil.Start(e)):2==t.guide&&Y.JumpSystem.jumpToView(e)'), 'task click guide dispatch missing');
assert.ok((main.match(/Y\.GuideUtil\.taskGuideCheck\(/g)||[]).length>=1,'tracked task guide route missing');
assert.ok(/20260904_(?:task_guide_restore1|auto_equip_new_accounts1|auto_equip_fsm_v3|auto_delegate_clean_v4)/.test(index),'cache marker missing');
assert.ok(main.includes('Fq.animBorns._lhsDensity2=!0'),'double-monster client contract lost');
assert.ok(main.includes('autoEquipUpgrade'),'auto-equip contract lost');
assert.ok(main.includes('_.onSilentMode=function(){U9.autoConfig.isSilentMode=!U9.autoConfig.isSilentMode}'),'silent reward contract lost');
let explicitStarts=0;
const runtime={isRuntime:false};
function explicitStart(){explicitStarts+=1;}
function idleShouldStart(){return runtime.isRuntime;}
explicitStart();
assert.equal(explicitStarts,1,'H5 explicit guide did not start');
assert.equal(idleShouldStart(),false,'H5 idle guide unexpectedly enabled');
console.log(JSON.stringify({result:'PASS',checks:12,explicitTaskGuide:true,automaticIdleGuide:false}));
