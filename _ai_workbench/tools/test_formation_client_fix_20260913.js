'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(
  process.env.FORMATION_CLIENT_SCRIPT
    || require('path').resolve(__dirname, '..', '..', 'linhhoasu', 'webgame', 'game', 'js', 'lhs-formation-fix-v1.js'),
  'utf8',
);
class FormationModel {
  constructor() { this._formationInfo = { level: 1, grade: 1, exp: 0 }; this.calls = []; }
  Rpc(tag, payload, callback) { this.calls.push({ tag, payload, callback }); }
  sendFormationUpgrade() {}
  sendFormationUpgradeGrade() {}
}
const model = new FormationModel();
let sounds = 0;
const events = [];
const context = { window: {
  W: { FormationModel: model, SoundManager: { PlayEffect() { sounds += 1; } } },
  MessageDef: { FORMATION_INFO_REFRESH: 'REFRESH', ATTR_CHANGE: 'ATTR' },
  MessageCenter: { ins() { return { dispatch(...args) { events.push(args); } }; } },
  setTimeout() {},
} };
vm.runInNewContext(source, context);
assert.equal(context.window.LhsFormationFixV1.installed, true);
let callbacks = 0;
model.sendFormationUpgrade(4, () => { callbacks += 1; });
let request = model.calls.pop();
assert.equal(model.sendFormationUpgrade(4, () => { callbacks += 1; }), false);
assert.equal(model.calls.length, 0);
request.callback({ result: 1, level: 2, exp: 0 });
assert.equal(callbacks, 0);
assert.equal(sounds, 0);
assert.equal(model._formationInfo.level, 1);
model.sendFormationUpgrade(1, () => { callbacks += 1; });
request = model.calls.pop();
request.callback({ result: 0, level: 2, exp: 0 });
assert.equal(callbacks, 1);
assert.equal(sounds, 1);
model.sendFormationUpgradeGrade(() => { callbacks += 1; });
request = model.calls.pop();
request.callback({ result: 1, grade: 2, level: 1, exp: 0 });
assert.equal(callbacks, 1);
assert.equal(model._formationInfo.grade, 1);
console.log(JSON.stringify({ result: 'ok', callbacks, sounds, events }));
