'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'linhhoasu/lhs/newServer/src/handlers/chat.js'), 'utf8');
const published = [];
const broadcasts = [];
const history = {
  0: [{ content: 'world', sys: false, time: 1 }],
  1: [{ content: 'system', sys: true, time: 2 }],
};
const chatBus = {
  isReady: () => true,
  allow: async () => true,
  publish: async (channel, entry, meta) => { published.push({ channel, entry, meta }); return { messageId: 'test:1' }; },
  getHistory: async channel => history[channel] || [],
};
const playerService = { savePlayer: async (_id, player) => player };
const context = {
  module: { exports: {} },
  exports: {},
  require(name) {
    if (name === '../services/PlayerService') return playerService;
    if (name === '../services/MessageService') return { pushGlobalNotice() {} };
    if (name === '../services/RuntimeBus') return { getWsServer: () => ({ broadcast: (...args) => broadcasts.push(args) }) };
    if (name === '../services/ChatBus') return chatBus;
    if (name === '../services/BattleService') return { calcPlayerPower: () => 0, calcPowerScore: () => 0 };
    if (name === '../services/ArenaReadModelService') return { displayPower: value => value };
    if (name === '../services/BotConversationService') return { isEnabled: () => false };
    if (name === '../services/RoleAppearanceService') return {
      ensureRoleAppearance() {}, getPlayerFashionMap: () => ({}), getPrimaryBattlePetId: () => -1,
    };
    if (name === '../logger') return { warn() {}, info() {}, error() {} };
    throw new Error(`unexpected dependency ${name}`);
  },
  console,
  Buffer,
  Date,
  Math,
  Number,
  JSON,
  Set,
  Map,
  Promise,
  process: { env: { SERVER_ID: '1001', SERVER_NAME: 'S1' } },
};
vm.runInNewContext(source, context, { filename: 'chat.js' });
const chat = context.module.exports;

(async () => {
  const session = { userId: 'chat-test', player: { userId: 'chat-test', playerId: '123', name: 'Tester', blockList: [] } };
  const sent = await chat.handleWorldChat({ channel: 0, content: 'hello' }, session, 1);
  assert.equal(sent.data.result, 0);
  assert.equal(published.length, 1);
  assert.equal(published[0].channel, 0);

  chat.handleChatBusEntry({ type: 'chat.entry.v1', messageId: 'm1', channel: 0, entry: { content: 'remote', sys: false } });
  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0][0], 1601);

  const init = await chat.handleWorldChat({ channel: 0, maxCount: 20 }, session, 2);
  assert.equal(init.data.list[0].content, 'world');
  assert.equal(init.data.sysList[0].content, 'system');

  const blocked = await chat.handleBlockPlayer({ playerId: 456, isBlock: true }, session, 3);
  assert.equal(blocked.data.result, 0);
  assert.deepEqual(Array.from(session.player.blockList), [456]);
  const unblocked = await chat.handleBlockPlayer({ playerId: 456, isBlock: false }, session, 4);
  assert.equal(unblocked.data.result, 0);
  assert.deepEqual(Array.from(session.player.blockList), []);

  console.log(JSON.stringify({ pass: true, published: published.length, broadcasts: broadcasts.length, initSystemRows: init.data.sysList.length, blockAck: true }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
