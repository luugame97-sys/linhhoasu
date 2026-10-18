'use strict';
// Isolated chat migration/performance regression. No Mongo/Redis connection.
const assert = require('node:assert/strict');
const path = require('node:path');
const app = path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const chat = require(app + '/src/handlers/chat');
const trek = require(app + '/src/handlers/old-trek');
const original = chat.buildSummary;
let calls = 0;
chat.buildSummary = () => { calls++; return { dbid: 'owner', name: 'Owner' }; };
function player(chatList) {
  return { _id: 'owner', playerId: 'owner', name: 'Owner', level: 1,
    other_attr_info: { oldTrekInfo: { chatList } } };
}
try {
  for (const list of [undefined, null, {}, 'invalid', []]) {
    calls = 0;
    const info = trek.ensureOldTrekInfo(player(list));
    assert.deepEqual(info.chatList, []);
    assert.equal(calls, 0, 'empty/malformed lists do not compute player power');
  }
  calls = 0;
  const history = Array.from({ length: 100 }, (_, i) => ({ dbid: 'legacy_' + i, name: 'Sender ' + i, content: 'hello', time: 1000 + i }));
  const info = trek.ensureOldTrekInfo(player(history));
  assert.equal(calls, 1, 'summary computed once, not once per history row');
  assert.equal(info.chatList.length, 100);
  assert.equal(info.chatList[99].summary.dbid, 'legacy_99');
  assert.equal(info.chatList[99].summary.name, 'Sender 99');
  assert.equal(info.chatList[99].time, 1099);
  const normalized = JSON.stringify(info.chatList);
  trek.ensureOldTrekInfo({ _id: 'owner', name: 'Owner', other_attr_info: { oldTrekInfo: info } });
  assert.equal(JSON.stringify(info.chatList), normalized, 'normalization remains stable on repeat');
  const native = trek.ensureOldTrekInfo(player([{ summary: { dbid: 'native', name: 'Native sender', serverId: 1003 }, content: 'text', time: 10 }]));
  assert.equal(native.chatList[0].summary.dbid, 'native');
  assert.equal(native.chatList[0].summary.serverId, 1003);
  assert.doesNotThrow(() => trek.ensureOldTrekInfo(player([null, {}, 7])));
  console.log('PASS: 5 empty-list variants, 100-row single summary, legacy migration, native identity, stable repeat, malformed rows. Production writes: 0.');
} finally {
  chat.buildSummary = original;
}
