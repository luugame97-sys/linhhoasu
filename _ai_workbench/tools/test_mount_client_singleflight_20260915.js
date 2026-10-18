'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
class MountModel {
  constructor() { this.calls = []; this._mountInfo = { data: [{ uid: 1, level: 9 }] }; }
  Rpc(tag, data, ok, fail) { this.calls.push({ tag, data, ok, fail }); }
  SendUpgrade() {}
}
const model = new MountModel(), events = [];
const window = {
  W: { MountModel: model, SoundManager: { PlayEffect() {} } },
  MessageCenter: { ins: () => ({ dispatch: (...args) => events.push(args) }) },
  MessageDef: {}, setTimeout() {}
};
vm.runInNewContext(fs.readFileSync(process.env.MOUNT_CLIENT_SCRIPT
  || 'linhhoasu/webgame/game/js/lhs-mount-fix-v1.js', 'utf8'), { window });
assert.equal(window.LhsMountFixV1.installed, true);
model.SendUpgrade(1); const first = model.calls[0];
assert.equal(model.SendUpgrade(1), false); assert.equal(model.calls.length, 1);
first.ok({ result: 0, data: { uid: 1, level: 10 } });
assert.equal(model._mountInfo.data[0].level, 10);
model.SendUpgrade(1); assert.equal(model.calls.length, 2); model.calls[1].fail({ timeout: true });
model.SendUpgrade(1); assert.equal(model.calls.length, 3);
console.log(JSON.stringify({ result: 'PASS', singleFlight: true, retriesAfterSettlement: true }));
