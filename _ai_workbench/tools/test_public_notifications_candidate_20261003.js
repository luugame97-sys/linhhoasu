'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(root, 'linhhoasu/lhs/newServer/src/services/PublicNotificationService.js'),
  'utf8',
);
const claims = new Set();
const messages = [];
const config = {
  TaskConfig: {
    90006: { id: 90006, type: 9, isGlobal: 1, updateCycle: 0 },
    140002: { id: 140002, type: 14, isGlobal: 1, updateCycle: 0 },
    10002: { id: 10002, type: 1, isGlobal: 1, updateCycle: 0 },
    70001: { id: 70001, type: 7, isGlobal: 1, updateCycle: 0 },
  },
  AssetsConfig: {
    90001: { id: 90001, quality: 8, ifShow: 1 },
    2: { id: 2, quality: 1, ifShow: 1 },
    99001: { id: 99001, quality: 10, ifShow: 0 },
  },
  GemLevelConfig: { 25091: { id: 25091, level: 10 } },
};
const context = {
  module: { exports: {} },
  exports: {},
  require(name) {
    if (name === './ConfigService') return { get: key => config[key] || {} };
    if (name === './ChatBus') return {
      claim: async key => {
        if (claims.has(key)) return false;
        claims.add(key);
        return true;
      },
    };
    if (name === '../handlers/chat') return {
      pushSystemBroadcast: async content => {
        messages.push(content);
        return { content };
      },
    };
    throw new Error(`unexpected dependency ${name}`);
  },
  process: { env: { SERVER_ID: '1001', SERVER_NAME: 'S1' } },
  console,
  Number,
  String,
  Set,
  Map,
  Promise,
  Math,
  JSON,
};
vm.runInNewContext(source, context, { filename: 'PublicNotificationService.js' });
const service = context.module.exports;

(async () => {
  const player = { playerId: 'p-1', userId: 'secret-user', name: '<A>\n', serverId: 1001 };

  const taskResults = await service.announceTaskClaims(player, [90006, 140002, 10002, 70001]);
  assert.equal(taskResults.filter(row => row.sent).length, 2);
  assert.equal(messages.length, 2);
  assert.ok(messages.every(text => !text.includes('secret-user') && !text.includes('<') && !text.includes('\n')));

  const first = await service.announceFirstClear(player, 23);
  const duplicateFirst = await service.announceFirstClear({ ...player, playerId: 'p-2', name: 'B' }, 23);
  assert.equal(first.sent, true);
  assert.equal(duplicateFirst.skipped, 'duplicate');

  assert.equal((await service.announceRank({ ...player, eventKey: 'arena:1', rank: 1, event: 'Võ Đạo Hội' })).sent, true);
  assert.equal((await service.announceRank({ ...player, eventKey: 'arena:1', rank: 4, event: 'Võ Đạo Hội' })).skipped, 'rank-range');

  await service.observeResult(player, [{ tag: 2000, data: {
    result: 0,
    rewardInfo: { items: [{ id: 90001, count: 1 }, { id: 2, count: 99 }, { id: 99001, count: 1 }] },
  } }], 2000, 77);
  assert.equal(messages.filter(text => text.includes('vật phẩm hiếm')).length, 1);

  const beforeAdmin = messages.length;
  await service.observeResult({ ...player, isAdmin: true }, [{ data: {
    result: 0,
    rewardInfo: { items: [{ id: 90001, count: 1 }] },
  } }], 2000, 78);
  await service.observeResult(player, [{ data: {
    result: 0,
    rewardInfo: { items: [{ id: 90001, count: 1 }] },
  } }], 1750, 79);
  assert.equal(messages.length, beforeAdmin);

  console.log(JSON.stringify({ pass: true, messages: messages.length, claims: claims.size, checks: {
    achievementFilter: true,
    firstClearDedupe: true,
    rankRange: true,
    rareReward: true,
    adminAndSensitiveExcluded: true,
  } }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

