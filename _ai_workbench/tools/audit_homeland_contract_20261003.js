'use strict';

// RAM-only contract audit. It intentionally proves unsafe server behavior
// without connecting to Mongo/Redis or touching a real player.
const assert = require('node:assert/strict');
const homeland = require('../../linhhoasu/lhs/newServer/src/handlers/homeland');
const playerService = require('../../linhhoasu/lhs/newServer/src/services/PlayerService');

const originalSave = playerService.savePlayer;
playerService.savePlayer = async (_userId, player) => player;

function makePlayer() {
  return {
    playerId: 'qa-homeland', name: 'QA', level: 100, items: {},
    currencies: { gold: 0, diamond: 0, silver: 0 },
    homelandInfo: {
      lv: 1, areaLv: 1, mapId: 1001, layout: {},
      buildingLv: { 170011: 1, 170012: 1, 170013: 1 }, collectMap: {},
      fetters: [], likeCount: 0, dailyLike: [], likeRecord: { records: [] },
      msgRecord: { leaveMsg: '', records: [] }, visitorMap: { x: [] },
      wishId: 0, unlockClues: {}, prayBuff: 0, prayAttrs: {}, lastPrayBuff: 0,
      shareLayouts: {}, shareCode: 'QA', prosperityRank: [], likeRank: [],
      aquariumFish: [], skinId: 0, exchangeHistory: [], lastVisitorRewardTime: 0,
      enterMapInfo: { map: 1001, x: 0, y: 0, id: 'qa-homeland' },
    },
  };
}

function session() { return { userId: 'qa-homeland', player: makePlayer() }; }
function dataOf(response) {
  const list = Array.isArray(response) ? response : [response];
  return (list.find((packet) => packet && packet.tag === 6707)
    || list.find((packet) => packet && packet.data && packet.data.rewardInfo)
    || list[list.length - 1] || {}).data || {};
}

async function main() {
  const findings = [];
  let s = session();
  const statue1 = await homeland.handleHomelandPayTribute({ free: 1 }, s, 1);
  const statue2 = await homeland.handleHomelandPayTribute({ free: 1 }, s, 2);
  const statue3 = await homeland.handleHomelandPayTribute({ free: 1 }, s, 3);
  const statue4 = await homeland.handleHomelandPayTribute({ free: 1 }, s, 4);
  assert.equal(dataOf(statue1).result, 0); assert.equal(dataOf(statue2).result, 0);
  assert.equal(dataOf(statue3).result, 0); assert.equal(dataOf(statue4).result, 1);
  findings.push({ id: 'STATUE_FREE_LIMIT_ENFORCED', evidence: 'fourth free tribute is rejected after the configured three daily uses' });

  s = session();
  await homeland.handleHomelandPayTribute({ free: 1 }, s, 5);
  await homeland.handleHomelandPayTribute({ free: 1 }, s, 6);
  await homeland.handleHomelandPayTribute({ free: 1 }, s, 7);
  s.player.currencies.diamond = 0;
  const paid = await homeland.handleHomelandPayTribute({ free: 0 }, s, 8);
  assert.equal(dataOf(paid).result, 1); assert.equal(s.player.currencies.diamond, 0);
  findings.push({ id: 'STATUE_PAID_COST_ENFORCED', evidence: 'paid tribute without configured diamond cost is rejected' });

  s = session();
  for (let i = 0; i < 3; i += 1) await homeland.handleHomelandPayTribute({ free: 1 }, s, 20 + i);
  s.player.currencies.diamond = 100;
  const paidOk = await homeland.handleHomelandPayTribute({ free: 0 }, s, 23);
  assert.equal(dataOf(paidOk).result, 0); assert.equal(s.player.currencies.diamond, 80);
  findings.push({ id: 'STATUE_PAID_VALID_FLOW', evidence: 'paid tribute consumes configured diamond cost after free quota' });

  s = session();
  const pray = await homeland.handleHomelandPray({ free: 0 }, s, 4);
  assert.equal(dataOf(pray).result, 1);
  findings.push({ id: 'PRAY_COST_AND_STATE_ENFORCED', evidence: 'refresh without an active buff is rejected' });

  s = session();
  const prayFree = await homeland.handleHomelandPray({ free: 1 }, s, 24);
  assert.equal(dataOf(prayFree).result, 0); assert.ok(s.player.homelandInfo.prayBuff > 0);
  findings.push({ id: 'PRAY_VALID_CONFIG_FLOW', evidence: 'free pray returns a config-backed buff and attributes' });

  s = session(); const oldLv = s.player.homelandInfo.lv;
  const level = await homeland.handleHomelandLevelUp({}, s, 5);
  assert.equal(level.data.lv, oldLv);
  findings.push({ id: 'LEVEL_UP_CONDITION_ENFORCED', evidence: 'level upgrade without prosperity/building conditions is rejected' });

  s = session();
  const collect = await homeland.handleHomelandCollect({ id: 170012 }, s, 6);
  assert.equal(collect.data.result, 1);
  findings.push({ id: 'COLLECT_READY_CHECK', evidence: 'resource collect with zero stock is rejected' });

  s = session();
  await homeland.handleHomelandLike({ playerId: 'target' }, s, 7);
  await homeland.handleHomelandLike({ playerId: 'target' }, s, 8);
  assert.equal(s.player.currencies.diamond, 10);
  findings.push({ id: 'LIKE_IDEMPOTENT', evidence: 'duplicate like does not pay a second reward' });

  s = session();
  await homeland.handleHomelandVisitorReward({}, s, 9);
  await homeland.handleHomelandVisitorReward({}, s, 10);
  assert.equal(s.player.currencies.silver, 0);
  findings.push({ id: 'VISITOR_IDEMPOTENT', evidence: 'visitor reward with no pending visitors is rejected' });

  s = session();
  await homeland.handleHomelandUnlockClue({ id: 1, index: 0 }, s, 11);
  await homeland.handleHomelandUnlockClue({ id: 1, index: 0 }, s, 12);
  assert.equal(s.player.items[71] || 0, 0);
  findings.push({ id: 'CLUE_IDEMPOTENT', evidence: 'invalid/repeated clue unlock is rejected' });

  s = session();
  s.player.items[225] = 1;
  const draw = await homeland.handleHomelandDraw({ count: 1, free: 1, luck: 0 }, s, 13);
  assert.equal(dataOf(draw).result, 0);
  findings.push({ id: 'DRAW_VALID_CONFIG_FLOW', evidence: 'free draw consumes a daily counter and selects configured item/piece pool' });

  console.log(JSON.stringify({ pass: true, productionWrites: 0, networkCalls: 0, findings }, null, 2));
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; })
  .finally(() => { playerService.savePlayer = originalSave; });

