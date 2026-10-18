'use strict';

const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const APP = path.resolve(process.env.LHS_APP_ROOT || path.resolve(ROOT, 'linhhoasu/lhs/newServer'));
process.env.CONFIG_BIN_PATH = path.resolve(process.env.LHS_CONFIG_PATH
  || path.resolve(ROOT, 'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'));

const config = require(path.join(APP, 'src/services/ConfigService'));
const playerService = require(path.join(APP, 'src/services/PlayerService'));
const item = require(path.join(APP, 'src/handlers/item'));

playerService.savePlayer = async (_userId, player) => player;
playerService.savePlayerDeferred = async (_userId, player) => player;

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function n(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function basePlayer(sourceId) {
  return {
    userId: 'usable-item-fix-contract',
    playerId: 'usable-item-fix-contract',
    name: 'usable-item-fix-contract',
    level: 999,
    exp: 0,
    roleInfo: { kungfuId: 4, subJob: 0, stage: 999999 },
    items: { [sourceId]: 10 },
    currencies: { diamond: 1000000000, silver: 1000000000, gold: 1000000000 },
    fashionInfo: {
      curFashion: {}, fashion: {}, fashionMap: {}, equipped: {}, fashions: {}, activateFashion: [],
      fashionData: [], suits: {}, suitColors: {}, starUp: {}, dress: [], sets: [], setId: 0,
      emoji: {}, emojiGroups: [], emojis: [],
    },
    formationInfo: {}, swordInfo: {}, spiritInfo: {}, artifactInfo: {}, petInfo: {}, petSoulInfo: {},
    equipInfo: { equipList: [], openList: [], setInfoMap: {}, curIndex: 0 },
    other_attr_info: {}, itemUseRecords: {}, shopInfo: { buyRecords: {}, pack: [] },
    rechargeInfo: { records: [], periodRecords: [], totalRecharge: 0, totalrecharge: 0 },
    activityInfo: { datas: [], giftCodeRecords: {} }, taskInfo: { tasks: {}, tasksMap: {} }, raidInfo: {},
  };
}

function responseOf(result) {
  return (Array.isArray(result) ? result : [result]).find((packet) => packet && packet.tag === 1300) || null;
}

function rewardTotal(info = {}) {
  return [
    'items', 'equips', 'swords', 'pets', 'petSouls', 'artifacts', 'gems', 'valhalla',
    'bloodline', 'fashion', 'formations', 'spirits', 'elves', 'curios', 'orbs', 'connects', 'emoji',
  ].reduce((sum, key) => sum + asArray(info[key]).length, 0);
}

async function use(itemId, params = {}) {
  const player = basePlayer(itemId);
  const result = await item.handleUseItem({ id: itemId, index: itemId, count: 1, ...params }, {
    userId: player.userId,
    player,
  }, 990000 + itemId);
  const response = responseOf(result);
  return { player, result, response, info: asObject(response && response.data && response.data.rewardInfo) };
}

function fail(message) {
  throw new Error(message);
}

async function main() {
  const tables = config.loadAllTables(process.env.CONFIG_BIN_PATH);
  const uses = asObject(tables.AssetsUseConfig);
  const report = { result: 'PASS', p0: {}, p1: {}, p2: {}, failClosed: {} };

  const p0Ids = [90044, 90045, 90046];
  for (const id of p0Ids) {
    const cfg = uses[id] || uses[String(id)];
    if (!cfg || !Array.isArray(cfg.rewards) || cfg.rewards.length <= 1) fail(`P0 config missing ${id}`);
    const cases = [];
    for (let index = 0; index < cfg.rewards.length; index += 1) {
      const tested = await use(id, { selects: { [index]: 1 } });
      const actual = tested.response && tested.response.data;
      if (!actual || actual.result !== 0 || tested.player.items[id] !== 9 || rewardTotal(tested.info) !== 1) {
        fail(`P0 option failed id=${id} index=${index}`);
      }
      cases.push(index);
    }
    const missing = await use(id);
    const multi = await use(id, { selects: { 0: 1, 1: 1 } });
    if (!missing.response || missing.response.data.result === 0 || missing.player.items[id] !== 10) fail(`P0 missing accepted ${id}`);
    if (!multi.response || multi.response.data.result === 0 || multi.player.items[id] !== 10) fail(`P0 multi accepted ${id}`);
    report.p0[id] = { options: cases.length, missing: 'REJECT_NO_CONSUME', multi: 'REJECT_NO_CONSUME' };
  }

  for (const id of [90021, 90022]) {
    const tested = await use(id, { selects: { 0: 1 } });
    if (!tested.response || tested.response.data.result === 0 || tested.player.items[id] !== 10) fail(`missing option not fail-closed ${id}`);
    report.failClosed[id] = 'REJECT_NO_CONSUME_NO_POOL';
  }

  const randomIds = Object.values(uses)
    .filter((cfg) => n(cfg && cfg.type, 0) === 102)
    .map((cfg) => n(cfg && cfg.id, 0))
    .filter((id) => id > 0);
  for (const id of randomIds) {
    const tested = await use(id);
    const data = tested.response && tested.response.data;
    if (!data || data.result !== 0 || tested.player.items[id] !== 9 || rewardTotal(tested.info) <= 0) {
      fail(`P1 random reward failed id=${id}`);
    }
  }
  report.p1 = { type102: randomIds.length, consumedExactlyOne: true, rewardOrNativeState: true };

  const type103 = Object.values(uses)
    .filter((cfg) => n(cfg && cfg.type, 0) === 103 && asArray(cfg.rewards).length > 0
      && Object.keys(asObject(cfg.attrs)).length === 0)
    .map((cfg) => cfg);
  for (const cfg of type103) {
    const id = n(cfg.id, 0);
    const tested = await use(id, { count: 2 });
    const data = tested.response && tested.response.data;
    const reward = asArray(tested.info.items);
    const expected = n(cfg.rewards[0].count, 0) * 2;
    if (!data || data.result !== 0 || tested.player.items[id] !== 8 || reward.length !== 1
      || n(reward[0].id, 0) !== n(cfg.rewards[0].id, 0) || n(reward[0].count, 0) !== expected
      || n(tested.player.itemUseRecords[String(id)], 0) !== 2) {
      fail(`P2 reward/ledger failed id=${id}`);
    }
  }
  report.p2 = { type103: type103.length, rewardRowsAndLedger: true };

  const permanent = Object.values(uses).find((cfg) => n(cfg && cfg.type, 0) === 103
    && Object.keys(asObject(cfg.attrs)).length > 0);
  if (permanent) {
    const id = n(permanent.id, 0);
    const tested = await use(id);
    const data = tested.response && tested.response.data;
    if (!data || data.result !== 0 || tested.player.items[id] !== 9
      || n(tested.player.itemUseRecords[String(id)], 0) !== 1
      || n(tested.player.other_attr_info.record && tested.player.other_attr_info.record[String(id)], 0) !== 1) {
      fail(`permanent type103 regression id=${id}`);
    }
    report.p2.permanentAttrsRegression = id;
  }

  console.log(JSON.stringify(report));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ result: 'FAIL', error: error.message }));
    process.exitCode = 1;
  });
}

module.exports = { main, use, basePlayer, rewardTotal };
