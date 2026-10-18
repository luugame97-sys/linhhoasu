'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const harness=fs.readFileSync(path.join(__dirname,'test_pet_eat_overflow_20261017.js'),'utf8').split('const cases=[];')[0];
const checks=`
(async()=>{
const findings=[];
deps['../services/PlayerService'].savePlayer=async()=>null;
let p=fixture();let r=await mod.exports.handlePetEat({matUid:105753,targetUid:102508},{userId:'isolated',player:p},1);
assert.equal(r.data.result,0);assert.equal(p.petInfo.pets.length,1);
findings.push({case:'save returns null',ack:r.data.result,materialConsumedInMemory:true});
deps['../services/PlayerService'].savePlayer=async()=>{throw Error('SIMULATED_SAVE_FAILURE')};
p=fixture();await assert.rejects(()=>mod.exports.handlePetEat({matUid:105753,targetUid:102508},{userId:'isolated',player:p},2));
assert.equal(p.petInfo.pets.length,1);findings.push({case:'save throws',materialConsumedInMemory:true,targetLevel:p.petInfo.pets[0].level});
let events=[];const model={Rpc:(tag,params,cb)=>cb({result:-1,data:{uid:102508,level:2}}),updatePetData(){events.push('update')},nowUpgradeTimes:0};
const client='(function(t,e){var i=this,t={uid:t,lv:e=void 0===e?1:e};this.Rpc(3304,t,function(t){t&&(t.data&&i.updatePetData(t.data),Y.SoundManager.PlayEffect("common_levelup_1_mp3"),i.nowUpgradeTimes++,A.ins().dispatch(E.PET_DATA_UPDATE),A.ins().dispatch(E.ATTR_CHANGE,6),Y.CuriosModel.taskCheck())})})';
const fn=vm.runInNewContext(client,{Y:{SoundManager:{PlayEffect:()=>events.push('successSound')},CuriosModel:{taskCheck(){}}},A:{ins:()=>({dispatch(){}})},E:{}});
fn.call(model,102508,1);assert(events.includes('successSound'));assert.equal(model.nowUpgradeTimes,1);findings.push({case:'client upgrade rejected result -1',successSound:true,upgradeCounter:model.nowUpgradeTimes});
const out={status:'REPRODUCED',sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),findings,limitations:'isolated mocks; not production data-loss or gameplay E2E proof'};
fs.writeFileSync(path.join(dir,'audit-edges.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out));
})().catch(e=>{console.error(e);process.exitCode=1;});`;
vm.runInNewContext(harness+checks,{require,__dirname,console,process},{filename:__filename});
