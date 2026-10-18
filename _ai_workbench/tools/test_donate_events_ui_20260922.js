const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const source = fs.readFileSync('linhhoasu/webgame/gm/assets/js/index.js', 'utf8');
const start = source.indexOf('function renderRechargeEventTierState');
const end = source.indexOf('function refreshRechargeEventStatus', start);
let footer = '', width = '', received;
const tier = {
  attr: () => '100',
  removeClass() { return this; }, addClass() { return this; },
  find(selector) { return { css(k, v) { width = v; }, html(value) { footer = value; } }; }
};
const context = { Number, String, Math, parseInt, topupServer: '1001', formatVnNumber: String, escapeHtml: String, rechargeEventStatusState: {} };
vm.createContext(context); vm.runInContext(source.slice(start,end), context);
context.renderRechargeEventTierState(tier,{total:50,active:true});
assert.equal(width,'50%');assert.match(footer,/50đ/);
context.renderRechargeEventTierState(tier,{total:100,ready:true,event_id:12,tier_id:2});
assert.match(footer,/value="12"/);assert.match(footer,/value="2"/);
context.renderRechargeEventTierState(tier,{total:100,pending:true,server_id:'1002',delivery_id:5});
assert.match(footer,/S1002/);assert.doesNotMatch(footer,/data-reward-retry/);
context.renderRechargeEventTierState(tier,{total:100,pending:true,server_id:'1001',delivery_id:5});assert.match(footer,/data-delivery-id="5"/);
context.renderRechargeEventTierState(tier,{total:100,claimed:true});assert.match(footer,/Đã nhận/);
context.renderRechargeEventTierState(tier,{total:100,active:false,status_label:'Đã kết thúc'});assert.match(footer,/Đã kết thúc/);assert.doesNotMatch(footer,/Nhận quà/);
const root = {length:1,find(){return {text(){return this;},removeClass(){return this;},addClass(){return this;}};}};
context.$ = function(selector){return selector==='[data-event-card-root]'?{each(){}}:root;};
context.$.extend=Object.assign;
context.renderRechargeEventTierState=(_,state)=>{received=state;};
context.applyRechargeEventStatusSnapshot({now:'2026-09-22 12:00:00',events:[{id:12,total:75,enabled:true,starts_at:'2026-09-22 11:00:00',active:true,tiers:[{id:1}]}]});
assert.equal(received.total,75);assert.equal(received.event_id,12);assert.equal(received.tier_id,1);
const admin = fs.readFileSync('linhhoasu/webgame/gm/assets/js/admin.js','utf8');
assert.match(admin,/edit_version:row.edit_version/);
assert.match(source,/\[data-open-event-tab\]/);
console.log('PASS: progress, readiness, cross-server pending, retry, sent, ended, event total propagation, edit version, popup navigation');
