'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const acorn=require(path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
const root=path.resolve(process.argv[2]),source=fs.readFileSync(path.join(root,'main.js'),'utf8');
const marker='C.sendGetMonthcardsReward=function',at=source.indexOf(marker);assert(at>=0);
let n=acorn.parseExpressionAt(source,at+marker.indexOf('function'),{ecmaVersion:'latest'});if(n.type==='SequenceExpression')n=n.expressions[0];
const replacement=[
 'function(t,e){void 0===e&&(e=null);this.Rpc(1211,{id:t},function(r){',
 'if(!r||r.result!==0){',
 'if(r&&r.reason==="MONTH_CARD_ALREADY_CLAIMED"&&r.received&&r.claimTime>0){Y.RechargeModel.changeMonthCardRewardTime(r.id,r.claimTime);A.ins().dispatchImmediate(E.MOUTH_CARD_UPDATE);}',
 'var tips={MONTH_CARD_ALREADY_CLAIMED:"Hôm nay đã nhận quà đặc quyền. Số lượng vật phẩm đã được đồng bộ lại.",MONTH_CARD_EXPIRED:"Đặc quyền chưa kích hoạt hoặc đã hết hạn.",MONTH_CARD_INVALID:"Gói đặc quyền không hợp lệ.",MONTH_CARD_REWARD_CONFIG_INVALID:"Cấu hình quà chưa hợp lệ; chưa đánh dấu nhận."};',
 'S.ins().showTips(r&&tips[r.reason]||"Chưa nhận được quà. Vui lòng đăng nhập lại rồi kiểm tra.");return;}',
 'r.rewardInfo&&Er.Open(r.rewardInfo);',
 'Y.RechargeModel.changeMonthCardRewardTime(r.id,r.claimTime||T.serverTimeMilli);e&&e();A.ins().dispatchImmediate(E.MOUTH_CARD_UPDATE);',
 '})}',
].join('');
const output=source.slice(0,n.start)+replacement+source.slice(n.end);acorn.parse(output,{ecmaVersion:'latest'});
// Only the claim callback changes. Fishing speed, scene and auto logic are byte-identical.
assert.equal(output.replace(replacement,source.slice(n.start,n.end)),source);
fs.writeFileSync(path.join(root,'main.fixed.js'),output);
fs.writeFileSync(path.join(root,'client-build.json'),JSON.stringify({changedFunction:marker,start:n.start,end:n.end,fishingSpeedChanged:false},null,2)+'\n');
console.log(JSON.stringify({result:'PASS',changedFunctions:1,fishingSpeedChanged:false}));
