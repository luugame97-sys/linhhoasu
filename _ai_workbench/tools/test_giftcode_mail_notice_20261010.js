// No network or player state. Exercise native callback and real packet codec.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '../..');
const addonPath = path.join(root, 'linhhoasu/webgame/game/js/lhs-giftcode-mail-notice-v1.js');
const source = fs.readFileSync(addonPath, 'utf8');
const bundle = fs.readFileSync(path.join(root, 'linhhoasu/webgame/game/js/main.min_drop200.js'), 'utf8');
const start = bundle.indexOf('f.sendActivityGiftCode=function');
const end = bundle.indexOf('},f.sendRename=', start);
assert.ok(start > 0 && end > start, 'Native method boundary');
const native = bundle.slice(start + 'f.sendActivityGiftCode='.length, end + 1);
const codec = require(path.join(root, 'linhhoasu/lhs/newServer/src/protocol/PacketManager'));
const tests = [];
function test(name, fn) { fn(); tests.push(name); }
function fixture(delayed) {
  const tips = [], popups = [], languages = [], calls = [], timers = [];
  function SettingModel() {}
  SettingModel.prototype.Rpc = function (tag, params, callback, onError) {
    calls.push({ tag, params, callback: callback.bind(this), onError: onError && onError.bind(this) });
    return 'rpc-result';
  };
  const context = vm.createContext({ SettingModel, UserTips: { ins: () => ({showTips: s => tips.push(s)}) },
    Er: {Open: r => popups.push(r)}, S: {ins: () => ({showTipsByLangId: id => languages.push(id)})},
    orionPlatform: null, setTimeout: fn => timers.push(fn) });
  context.window = context;
  vm.runInContext('SettingModel.prototype.sendActivityGiftCode=' + native, context);
  const prototypeRpc = SettingModel.prototype.Rpc;
  if (delayed) context.SettingModel = null;
  vm.runInContext(source, context);
  const model = new SettingModel(); let completed = 0;
  function send() { model.sendActivityGiftCode('TEST_QA', () => completed++); return calls[calls.length-1]; }
  function reply(r) {
    const call = send();
    const packet = codec.packSingle(1750, r, 123);
    const decoded = codec.unpackClient(packet)[0];
    assert.equal(decoded.tag, 1750);
    call.callback(decoded.data);
    return call;
  }
  return { context, model, tips, popups, languages, calls, timers, SettingModel, prototypeRpc, send, reply, completed: () => completed };
}
test('sent: one mail notice, no empty reward popup, input completion', () => {
  const f=fixture(); f.reply({result:0,bridge:'webgm',deliveryStatus:'sent',deliveryId:42,rewardInfo:{items:[]}});
  assert.equal(f.tips.length,1);assert.match(f.tips[0],/đã vào Hòm thư/);assert.equal(f.popups.length,0);assert.equal(f.completed(),1);
});
test('pending outranks retryRequired and keeps input', () => {
  const f=fixture();f.reply({result:0,bridge:'webgm',deliveryStatus:'pending',retryRequired:true,deliveryId:43});
  assert.match(f.tips[0],/đang chờ giao/);assert.equal(f.completed(),0);assert.equal(f.popups.length,0);
});
test('already_claimed: no second reward dialog or contradictory native error', () => {
  const f=fixture();f.reply({result:2,bridge:'webgm',deliveryStatus:'already_claimed'});
  assert.match(f.tips[0],/đã được dùng/);assert.equal(f.languages.length,0);assert.equal(f.completed(),1);
});
test('collision: GM guidance, keep input', () => {
  const f=fixture();f.reply({result:3,collision:true,retryRequired:false});
  assert.match(f.tips[0],/liên hệ GM/);assert.equal(f.languages.length,0);assert.equal(f.completed(),0);
});
test('retry required is uncertain, never delivered', () => {
  const f=fixture();f.reply({result:3,retryRequired:true});
  assert.match(f.tips[0],/Chưa xác nhận/);assert.equal(f.completed(),0);
});
test('unknown bridge status cannot become success', () => {
  const f=fixture();f.reply({result:0,bridge:'webgm',deliveryStatus:'unexpected'});
  assert.match(f.tips[0],/Chưa xác nhận/);assert.equal(f.popups.length,0);
});
for(const r of [{result:0,deliveryId:0},{result:3,deliveryId:42},{deliveryId:42}]) {
  test('sent requires positive delivery ID and result 0: '+JSON.stringify(r), () => {
    const f=fixture();f.reply(Object.assign({bridge:'webgm',deliveryStatus:'sent'},r));
    assert.match(f.tips[0],/Chưa xác nhận/);assert.equal(f.completed(),0);
  });
}
test('legacy success executes real native reward callback unchanged', () => {
  const f=fixture();f.reply({result:0,batchId:12345,rewardInfo:{items:[{id:36,count:1}]}});
  assert.equal(f.popups.length,1);assert.equal(f.popups[0].items[0].id,36);assert.equal(f.tips.length,0);assert.equal(f.completed(),1);
});
for(let result=1;result<=4;result++) {
  test('legacy native language mapping preserved: '+result, () => {
    const f=fixture();f.reply({result});assert.equal(f.languages[0],[0,30031503,30031504,30031505,30031524][result]);
    assert.equal(f.tips.length,0);assert.equal(f.completed(),1);
  });
}
test('network timeout preserves input; late callback cannot show second message', () => {
  const f=fixture();const c=f.send();c.onError({timeout:true});c.callback({bridge:'webgm',deliveryStatus:'sent',deliveryId:42,result:0});
  assert.equal(f.tips.length,1);assert.match(f.tips[0],/Mất phản hồi/);assert.equal(f.completed(),0);
});
test('replayed callback and load do not double notify', () => {
  const f=fixture();vm.runInContext(source,f.context);const r={bridge:'webgm',deliveryStatus:'sent',deliveryId:42,result:0};
  const c=f.reply(r);c.callback(r);assert.equal(f.tips.length,1);assert.equal(f.calls.length,1);
});
test('RPC descriptor and unrelated messages preserved', () => {
  const f=fixture();const rpc=f.model.Rpc;f.reply({result:3,retryRequired:true});
  assert.equal(f.model.Rpc,rpc);assert.equal(Object.hasOwn(f.model,'Rpc'),false);assert.equal(f.SettingModel.prototype.Rpc,f.prototypeRpc);
  let called=false;f.model.Rpc(21,{},()=>called=true);f.calls[1].callback({result:0});assert.equal(called,true);
  Object.defineProperty(f.model,'Rpc',{value:rpc,writable:true,configurable:true,enumerable:false});
  const before=Object.getOwnPropertyDescriptor(f.model,'Rpc');f.send();assert.deepEqual(Object.getOwnPropertyDescriptor(f.model,'Rpc'),before);
});
test('RPC synchronous exception restores method', () => {
  const f=fixture();f.model.Rpc=()=>{throw Error('send failed')};const rpc=f.model.Rpc;
  assert.throws(()=>f.send(),/send failed/);assert.equal(f.model.Rpc,rpc);
});
test('deferred install when main bundle loads after addon', () => {
  const f=fixture(true);assert.equal(f.context.LhsGiftcodeMailNoticeV1.installed,false);
  f.context.SettingModel=f.SettingModel;f.timers.shift()();assert.equal(f.context.LhsGiftcodeMailNoticeV1.installed,true);
  f.reply({result:0,bridge:'webgm',deliveryStatus:'sent',deliveryId:1});assert.equal(f.tips.length,1);
});
test('Vietnamese messages are valid text and short enough for existing tips', () => {
  assert.ok(!source.includes('\uFFFD'));
  const messages=Array.from(source.matchAll(/message: '([^']+)'/g),m=>m[1]);
  assert.ok(messages.length>=5 && messages.every(m=>m.length<125));
});
console.log(JSON.stringify({status:'PASS',count:tests.length,tests,networkWrites:0,playerWrites:0},null,2));
