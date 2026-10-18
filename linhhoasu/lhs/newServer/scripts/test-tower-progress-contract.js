'use strict';
// Hư Thiên Bảo Điện (2300 type 9 / 3700): quick challenge, speed-clear tier reward,
// bonus attrs in tower battles, rank sync. Real handlers/config; storage/network denied.
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');

const app = path.resolve(__dirname, '..');
const clone = (x) => JSON.parse(JSON.stringify(x));
const deny = () => { throw Error('TEST_NETWORK_DENIED'); };
require('net').Socket.prototype.connect = deny;
for (const id of ['http', 'https']) { require(id).request = deny; require(id).get = deny; }
global.fetch = deny;

let saves = 0;
let rankThrows = false;
const rankCalls = [];
const unknownPlayerCalls = new Set();
function stub(rel, value) {
  const p = path.join(app, 'src', rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports: value };
}
stub('logger.js', { info() {}, warn() {}, error() {}, debug() {} });
// Unknown PlayerService calls (a live build may call more) resolve to null and are reported.
const playerServiceStub = {
  async savePlayer() { saves += 1; return true; },
  async findByPlayerId() { return null; },
  async loadPlayer() { return null; },
  async drainPendingSaves() { return true; },
};
stub('services/PlayerService.js', new Proxy(playerServiceStub, {
  get(target, key) {
    if (typeof key === 'symbol' || key in target || ['__esModule', 'then', 'default'].includes(key)) return target[key];
    return async () => { unknownPlayerCalls.add(key); return null; };
  },
}));
stub('services/RankService.js', {
  async updateScore(type, playerId, score) {
    if (rankThrows) throw Error('TEST_RANK_DOWN');
    rankCalls.push({ type, playerId, score });
  },
  async getRank() { return -1; },
  async getTopN() { return []; },
});
const originalLoad = Module._load;
class Schema { constructor() { this.statics = {}; this.methods = {}; } index() {} pre() {} }
Schema.Types = { Mixed: class {} };
Module._load = function load(id, parent, main) {
  if (id === 'mongoose') {
    const connection = { models: {}, model: () => ({}), useDb() { return this; } };
    return { Schema, connection, model: connection.model };
  }
  if (id === 'ioredis') return class {};
  return originalLoad.call(this, id, parent, main);
};

const tables = require('../src/services/ConfigService').loadAllTables();
const battle = require('../src/services/BattleService');
const progress = require('../src/services/TowerProgressService');
const raid = require('../src/handlers/raid');
const tower = require('../src/handlers/tower');

const list = (v) => (Array.isArray(v) ? v : [v]);
const reply = (v) => list(v).find((p) => p.tag === 2300).data;
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r.count]));
const tierRewards = (floor) => byId(tables.TowerRewardConfig[floor].rewards);

const fight = (s, index) => raid.handleStartFight({ type: 9, enemyid: '', index }, s, 7);

async function fresh(sword = {}, extra = {}) {
  const player = {
    userId: 'tower_fixture', playerId: 'tower_fixture', name: 'fixture', level: 2000,
    roleInfo: { stage: 36, stageId: 36, kungfuId: 4 },
    items: {}, currencies: { diamond: 0, gold: 0, silver: 0 },
    raidInfo: { chapter: 1, level: 1 }, equipInfo: { curIndex: 0, equipSetMap: { 0: {} } },
    petInfo: { pets: [] }, boxInfo: { level: 1 }, taskInfo: { tasks: {}, tasksMap: {} },
    swordInfo: {},
    ...extra,
  };
  const s = { userId: player.userId, player };
  // A deployed daily reset may rewrite tower state on first touch: let it run, then pin the fixture.
  await tower.handleTowerSetAutoSelect({ autoSelect: 0 }, s, 1);
  await tower.handleTowerSelectSkill({ select: -1, replace: -1 }, s, 1);
  await fight(s, 1);
  Object.assign(player.swordInfo, {
    curlayer: 0, maxlayer: 0, score: 0, dailyCount: 0, skills: [], slotlist: [], skillCount: 0, ...sword,
  });
  player.items = {};
  player.currencies = { diamond: 0, gold: 0, silver: 0 };
  saves = 0;
  rankCalls.length = 0;
  return s;
}

let groups = 0;
async function test(name, work) {
  try { await work(); groups += 1; } catch (e) { e.message = `${name}: ${e.message}`; throw e; }
}

(async () => {
  await test('sweep floor matches the native client state machine', () => {
    assert.equal(progress.getCfgMaxLevel(), 800);
    const cases = [[800, 770], [900, 770], [799, 770], [505, 480], [500, 480], [30, 10], [29, 0], [0, 0]];
    for (const [max, target] of cases) assert.equal(progress.getSweepTarget(max), target, `max ${max}`);
    assert.equal(progress.isSweepRequest({ type: 9, index: 0 }), true);
    assert.equal(progress.isSweepRequest({ type: 9, index: '0' }), true);
    assert.equal(progress.isSweepRequest({ type: 9, index: 31 }), false);
    assert.equal(progress.isSweepRequest({ type: 9 }), false);
    assert.equal(progress.isSweepRequest({ type: 9, index: 0, levelId: 5 }), false);
    assert.equal(progress.getSkillInterval(), 10);
    assert.equal(progress.countSkillPicks(0, 770), 77);
    assert.equal(progress.countSkillPicks(755, 770), 1);
    assert.equal(progress.countSkillPicks(765, 770), 0);
    assert.equal(progress.countSkillPicks(0, 1), 1);
    assert.equal(progress.countSkillPicks(9, 10), 0);
    assert.equal(progress.countSkillPicks(10, 11), 1);
  });

  await test('quick challenge 0->770 pays tier 770 once, no battle, 77 picks', async () => {
    const s = await fresh({ maxlayer: 800 });
    const packets = list(await fight(s, 0));
    const data = reply(packets);
    assert.equal(data.result, 0);
    assert.equal(data.fightResult, undefined, 'client shows reward popup only when fightResult is absent');
    assert.equal(data.sweep, 1);
    assert.deepEqual(byId(data.rewards), tierRewards(770));
    assert.equal(data.updateInfo.curlayer, 770);
    assert.equal(data.updateInfo.maxlayer, 800);
    assert.equal(data.updateInfo.skillCount, 77);
    assert(data.updateInfo.skills.length > 0, 'first offer is shown');
    const sword = s.player.swordInfo;
    assert.equal(sword.dailyCount, 770);
    assert.equal(sword.score, 10 * (770 * 771) / 2);
    assert.equal(s.player.items[60], tierRewards(770)[60]);
    assert.equal(s.player.currencies.silver, tierRewards(770)[2]);
    assert.equal(s.player.currencies.gold, tierRewards(770)[6]);
    assert.equal(s.player.items[61], undefined, 'first-clear rewards are not paid by a sweep');
    assert.equal(saves, 1);
    assert.equal(rankCalls.length, 0, 'maxlayer unchanged');
    assert(packets.some((p) => p.tag === 1202), 'bag sync packet sent');
  });

  await test('index 0 after the sweep only resyncs: no battle, no second tier reward', async () => {
    const s = await fresh({ maxlayer: 800, curlayer: 770 });
    const data = reply(await fight(s, 0));
    assert.equal(data.result, 0);
    assert.equal(data.fightResult, undefined);
    assert.deepEqual(data.rewards, [], 'empty list opens no reward popup');
    assert.equal(data.updateInfo.curlayer, 770);
    assert.equal(s.player.swordInfo.curlayer, 770);
    assert.deepEqual(s.player.items, {});
    assert.equal(saves, 0);
  });

  await test('below the sweep floor any type-9 request is the quick challenge', async () => {
    const s = await fresh({ maxlayer: 800, curlayer: 0 });
    const data = reply(await fight(s, 1));
    assert.equal(data.fightResult, undefined, 'state 3 shows only quick challenge, so no floor-1 battle');
    assert.equal(data.sweep, 1);
    assert.equal(data.updateInfo.curlayer, 770);
    const again = reply(await fight(s, 0));
    assert.deepEqual(again.rewards, [], 'a resent quick challenge pays nothing more');
    assert.equal(saves, 1);
  });

  await test('past the last floor: error reply still carries updateInfo', async () => {
    const s = await fresh({ maxlayer: 800, curlayer: 800 });
    const data = reply(await fight(s, 801));
    assert.equal(data.result, -1);
    assert.equal(data.msg, 'invalid tower layer');
    assert.deepEqual(data.rewards, []);
    assert.equal(data.updateInfo.curlayer, 800);
    assert.equal(saves, 0);
  });

  await test('partial sweep 755->770 keeps native tier and pick count', async () => {
    const s = await fresh({ maxlayer: 800, curlayer: 755 });
    const data = reply(await fight(s, 0));
    assert.equal(data.updateInfo.curlayer, 770);
    assert.equal(data.updateInfo.skillCount, 1);
    assert.deepEqual(byId(data.rewards), tierRewards(770));
    assert.equal(s.player.swordInfo.dailyCount, 15);
  });

  await test('no sweep below 30 floors of history', async () => {
    const s = await fresh({ maxlayer: 25 });
    assert.equal(progress.buildSweepPlan(s.player.swordInfo), null);
    assert.deepEqual(reply(await fight(s, 0)).rewards, [], 'no quick-challenge button, a stray index 0 pays nothing');
    const data = reply(await fight(s, 1));
    assert(data.fightResult);
    assert.equal(data.id, 1);
  });

  await test('cumulative mode pays every tier passed in this sweep', () => {
    const sum = (floors) => {
      const want = {};
      for (const f of floors) for (const r of tables.TowerRewardConfig[f].rewards) want[r.id] = (want[r.id] || 0) + r.count;
      return want;
    };
    process.env.TOWER_SWEEP_REWARD_MODE = 'cumulative';
    try {
      assert.deepEqual(byId(progress.buildSweepRewards(30)), sum([10, 20, 30]));
      assert.deepEqual(byId(progress.buildSweepRewards(30, 'cumulative', 15)), sum([20, 30]));
      const plan = progress.buildSweepPlan({ curlayer: 755, maxlayer: 800 });
      assert.deepEqual(byId(plan.rewards), sum([760, 770]), 'tiers already passed today are not paid again');
    } finally {
      delete process.env.TOWER_SWEEP_REWARD_MODE;
    }
    assert.deepEqual(byId(progress.buildSweepRewards(30)), tierRewards(30));
  });

  await test('normal climb: pick only every 10 floors, rank only on a new best', async () => {
    const s = await fresh({ maxlayer: 9, curlayer: 9 });
    let data = reply(await fight(s, 10));
    assert(data.fightResult.win);
    assert.equal(data.updateInfo.skillCount, 0, 'floor 10 grants no pick');
    assert.deepEqual(rankCalls, [{ type: 'tower', playerId: 'tower_fixture', score: 10 }]);
    data = reply(await fight(s, 11));
    assert(data.fightResult.win);
    assert.equal(data.updateInfo.skillCount, 1);
    assert(data.updateInfo.skills.length > 0);
    assert.equal(rankCalls.length, 2);

    const replay = await fresh({ maxlayer: 50, curlayer: 31 });
    data = reply(await fight(replay, 32));
    assert(data.fightResult.win);
    assert.equal(rankCalls.length, 0, 'no rank write below the best floor');
    assert.equal(data.updateInfo.skillCount, 0);

    const bot = await fresh({ maxlayer: 0 }, { managedBot: true });
    await fight(bot, 1);
    assert.equal(rankCalls.length, 0, 'managed bots stay off the tower rank');

    const down = await fresh({ maxlayer: 0 });
    rankThrows = true;
    try { data = reply(await fight(down, 1)); } finally { rankThrows = false; }
    assert(data.fightResult.win, 'a rank outage never fails the fight');
    assert.equal(down.player.swordInfo.maxlayer, 1);
    assert.equal(saves, 1);
  });

  await test('unlocked bonus slots scale tower battle attrs only', async () => {
    const sword = { curlayer: 5, slotlist: [{ id: 2, lv: 2 }, { id: 6, lv: 1 }, { id: 10, lv: 1 }, { id: 14, lv: 3 }] };
    const attrs = progress.getTowerBattleAttrs(sword);
    const expect = {};
    for (const slot of sword.slotlist.slice(0, 3)) {
      for (const [k, v] of Object.entries(tables.TowerAttrConfig[slot.id].attrs)) expect[k] = (expect[k] || 0) + v * slot.lv;
    }
    assert.deepEqual(attrs, expect, '4th slot is locked until floor 31');
    assert.equal(progress.getUnlockedSlotCount({ curlayer: 30 }), 4);
    assert.equal(progress.getUnlockedSlotCount({ curlayer: 800 }), 8);

    const s = await fresh({ curlayer: 5, maxlayer: 5, slotlist: [{ id: 2, lv: 2 }] });
    const plain = battle.calcPlayerPower(s.player);
    const boosted = battle.calcPlayerPower(s.player, { extraAttrs: progress.getTowerBattleAttrs(s.player.swordInfo) });
    const pct = tables.TowerAttrConfig[2].attrs[51] * 2;
    assert.equal(Object.keys(tables.TowerAttrConfig[2].attrs).join(), '51');
    assert(boosted[1] > plain[1], 'HP% bonus raises HP');
    assert(Math.abs(boosted[1] - Math.floor(plain[1] * (1 + pct / 10000))) <= plain[1] * 0.001 + 2);
    assert.equal(battle.calcPlayerPower(s.player)[1], plain[1], 'outside the tower nothing changes');

    const original = battle.simulateBattle;
    let seen = null;
    battle.simulateBattle = (playerAttrs, ...rest) => { seen = playerAttrs; return original(playerAttrs, ...rest); };
    try { await fight(s, 6); } finally { battle.simulateBattle = original; }
    assert.equal(seen[1], boosted[1], 'tower fight uses boosted attrs');
  });

  await test('3700 re-offers while picks remain and respects slot locks', async () => {
    const s = await fresh({ curlayer: 5, maxlayer: 5 });
    tower.addTowerSkillChoices(s.player.swordInfo, 3, 5);
    const firstOffer = s.player.swordInfo.skills.slice();
    tower.addTowerSkillChoices(s.player.swordInfo, 2, 5);
    assert.deepEqual(s.player.swordInfo.skills, firstOffer, 'pending offer is kept');
    assert.equal(s.player.swordInfo.skillCount, 5);

    for (let pick = 0; pick < 3; pick += 1) {
      const res = await tower.handleTowerSelectSkill({ select: 0, replace: pick }, s, 1);
      assert.equal(res.data.result, 0);
      assert.equal(res.data.slotlist.length, pick + 1);
      assert.equal(res.data.skillCount, 5 - pick - 1);
      assert(res.data.skills.length > 0, 'fresh offer for the next pick');
      const equipped = new Set(res.data.slotlist.map((x) => x.id));
      assert(res.data.skills.every((id) => !equipped.has(id)));
    }
    const locked = await tower.handleTowerSelectSkill({ select: 0, replace: 3 }, s, 1);
    assert.equal(locked.data.result, -1);
    assert.equal(locked.data.msg, 'tower_slot_locked');
    const replaced = await tower.handleTowerSelectSkill({ select: 0, replace: 1 }, s, 1);
    assert.equal(replaced.data.result, 0);
    assert.equal(replaced.data.skillCount, 1);
    const skip = await tower.handleTowerSelectSkill({ select: -1, replace: -1 }, s, 1);
    assert.equal(skip.data.skillCount, 0);
    assert.deepEqual(skip.data.skills, []);

    // Double tap on confirm: the client resends the same {select, replace} before the reply lands.
    const tap = await fresh({ curlayer: 5, maxlayer: 5 });
    tower.addTowerSkillChoices(tap.player.swordInfo, 3, 5);
    const first = await tower.handleTowerSelectSkill({ select: 0, replace: 0 }, tap, 1);
    const second = await tower.handleTowerSelectSkill({ select: 0, replace: 0 }, tap, 1);
    assert.equal(first.data.result, 0);
    assert.equal(second.data.result, -1);
    assert.equal(second.data.msg, 'tower_pick_repeat');
    assert.equal(tap.player.swordInfo.skillCount, 2, 'only one pick spent');
    assert.equal(tap.player.swordInfo.slotlist.length, 1);

    // Give up discards every pending pick (same as before this change).
    const giveUp = await tower.handleTowerSelectSkill({ select: -1, replace: -1 }, tap, 1);
    assert.equal(giveUp.data.skillCount, 0);
  });

  if (unknownPlayerCalls.size > 0) console.warn(`PlayerService calls stubbed as null: ${[...unknownPlayerCalls].join(', ')}`);
  console.log(JSON.stringify({ ok: true, groups }));
})().catch((err) => { console.error(err); process.exit(1); });
