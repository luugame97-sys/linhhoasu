'use strict';

// RAM-only pet/fragment audit.  It intentionally injects a tiny config and
// PlayerService stub into pet.js; it never loads a DB, network, PM2, or a real
// player.  Findings are observations of the current handler contract.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const sourcePath = path.join(ROOT, 'linhhoasu', 'lhs', 'newServer', 'src', 'handlers', 'pet.js');
const source = fs.readFileSync(sourcePath, 'utf8');

const baseConfig = {
  PetBaseConfig: {
    initialField: 8,
    fieldMax: 16,
    fieldConsume: [100],
    levelMax: 200,
    resetConsume: [{ id: 1, count: 0 }],
    returnRate: 10000,
    pSkillWashConsume: [{ id: 37, count: 10 }],
  },
  PetEggConfig: {
    24: { id: 24, pools: [{ id: 1001, weight: 100 }] },
    25: { id: 25, pools: [{ id: 1002, weight: 100 }], consume: { id: 1, count: 100 } },
    26: { id: 26, pools: [{ id: 1003, weight: 100 }] },
  },
  PetConfig: {
    82001: { id: 82001, quality: 2, type: 0, tag: 2 },
    82101: { id: 82101, quality: 2, type: 1, tag: 1, swapCost: 0, swapCostCount: 0 },
    82201: { id: 82201, quality: 2, type: 2, tag: 1, swapCost: 0, swapCostCount: 0 },
    83101: { id: 83101, quality: 3, type: 1, tag: 1 },
  },
  PetQualityConfig: {
    2: { id: 2, passiveSkillCount: 0, composeSuccessRate: 9000,
      consumes: [{ id: 36, count: 5 }], addConsumes: [{ id: 36, count: 3 }] },
    3: { id: 3, passiveSkillCount: 0, composeSuccessRate: 7500,
      consumes: [{ id: 36, count: 10 }], addConsumes: [{ id: 36, count: 6 }] },
  },
  PetPassiveSkillConfig: {},
  PetPassiveSkillWashConfig: {
    1: { level: 1, exp: 500, rate: [{ id: 2, weight: 10000 }] },
    2: { level: 2, exp: 1000, rate: [{ id: 2, weight: 10000 }] },
    20: { level: 20, exp: 0, rate: [{ id: 2, weight: 10000 }] },
  },
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function loadHandler(config = baseConfig, env = {}) {
  const saves = [];
  const deps = {
    '../services/ConfigService': { get: (key) => config[key] || {} },
    '../services/PlayerService': {
      async savePlayer(userId, player) { saves.push({ userId, player: clone(player) }); return player; },
      savePlayerDeferred() { return Promise.resolve(); },
    },
    '../logger': { debug() {}, info() {}, warn() {}, error() {} },
    '../services/MainTaskProgressService': {
      addPetComposeCount() { return false; }, addPetWashCount() { return false; }, refreshMainTaskProgress() { return false; },
    },
    './raid': { addRewardToPlayer(player, id, count) {
      player.items ||= {};
      player.currencies ||= { diamond: 0, silver: 0, gold: 0 };
      if (Number(id) === 1) player.currencies.diamond = Number(player.currencies.diamond || 0) + Number(count);
      else if (Number(id) === 2) player.currencies.silver = Number(player.currencies.silver || 0) + Number(count);
      else if (Number(id) === 6) player.currencies.gold = Number(player.currencies.gold || 0) + Number(count);
      else player.items[id] = Number(player.items[id] || 0) + Number(count);
    } },
    './task': { buildActiveTaskUpdatePackets() { return []; } },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require(request) { if (!(request in deps)) throw new Error(`UNEXPECTED_DEPENDENCY:${request}`); return deps[request]; },
    process: { env: { ...env } }, console, Date, Math,
  }, { filename: sourcePath });
  return { handler: module.exports, saves };
}

function player(pets, extra = {}) {
  return {
    userId: 'ram-audit', items: {}, currencies: { diamond: 0, silver: 0, gold: 0 },
    petInfo: { field: 8, nextUid: 100003, pets, unlockAtlas: pets.map(p => p.id), rewardedAtlas: [], wishMap: {}, timeRecords: {} },
    ...extra,
  };
}

async function run() {
  const findings = [];
  const add = (id, severity, expected, actual, evidence) => findings.push({ id, severity, expected, actual, evidence });

  // 3302 composition with zero item36 still succeeds and deletes both source pets.
  {
    const p = player([{ uid: 100001, id: 82101, slot: 0, level: 1 }, { uid: 100002, id: 82101, slot: 1, level: 1 }]);
    const { handler } = loadHandler();
    const out = await handler.handlePetCompose({ uid: 100001, targetUid: 100002 }, { userId: p.userId, player: p }, 1);
    add('compose-missing-cost', 'P1', 'result=-1 and pets/items unchanged', {
      result: Array.isArray(out) ? out.find(x => x.tag === 3302)?.data?.result : out.data?.result,
      petCount: p.petInfo.pets.length, item36: p.items[36] || 0,
    }, 'handlePetCompose calls consumeItemOrCurrency without hasEnoughCostMap; current fixture consumes 0 then creates result pet.');
  }

  // 3314 auto composition never consumes PetQualityConfig.consumes.
  {
    const p = player([{ uid: 100001, id: 82101, slot: 0, level: 1 }, { uid: 100002, id: 82101, slot: 1, level: 1 }]);
    const { handler } = loadHandler();
    const out = await handler.handlePetAutoCompose({ quality: 4 }, { userId: p.userId, player: p }, 2);
    add('auto-compose-missing-cost', 'P1', 'no composition without item36×5', {
      result: out.data?.result, petCount: p.petInfo.pets.length, item36: p.items[36] || 0,
    }, 'handlePetAutoCompose pairs pets directly and has no cost check/consume/sync.');
  }

  // Egg 25 has a configured 100-diamond consume, but handler only consumes item25.
  {
    const p = player([]); p.items[25] = 1;
    const { handler } = loadHandler();
    const out = await handler.handlePetUseEgg({ eggId: 25 }, { userId: p.userId, player: p }, 3);
    add('egg25-missing-diamond-cost', 'P1', 'result=-1 with diamond<100', {
      result: Array.isArray(out) ? out.find(x => x.tag === 3300)?.data?.result : out.data?.result,
      item25: p.items[25] || 0, diamond: p.currencies.diamond, petCount: p.petInfo.pets.length,
    }, 'PetEggConfig[25].consume={id:1,count:100}; handlePetUseEgg never reads eggCfg.consume.');
  }

  // Missing/zero eggId is treated as id 0: hasEnough/consume are no-ops, yet a pet is granted.
  {
    const p = player([]);
    const { handler } = loadHandler();
    const out = await handler.handlePetUseEgg({ eggId: 0 }, { userId: p.userId, player: p }, 4);
    add('egg-invalid-id-free-grant', 'P1', 'result=-1 and no pet', {
      result: Array.isArray(out) ? out.find(x => x.tag === 3300)?.data?.result : out.data?.result,
      petCount: p.petInfo.pets.length, item24: p.items[24] || 0,
    }, 'toSafeInt(eggId,24) preserves 0; hasEnoughItemOrCurrency(id<=0) returns true and consume is a no-op.');
  }

  // Buy-field succeeds without diamond and exceeds configured fieldMax.
  {
    const p = player([]); p.petInfo.field = 8;
    const { handler } = loadHandler();
    const out = await handler.handlePetBuyField({}, { userId: p.userId, player: p }, 5);
    add('buy-field-free', 'P1', 'result=-1 when diamond<100', { result: out.data?.result, field: p.petInfo.field, diamond: p.currencies.diamond }, 'handlePetBuyField conditionally consumes diamond but increments field unconditionally.');
    p.petInfo.field = 16;
    const outMax = await handler.handlePetBuyField({}, { userId: p.userId, player: p }, 6);
    add('buy-field-over-max', 'P1', 'field must remain <= fieldMax (16)', { result: outMax.data?.result, field: p.petInfo.field }, 'handlePetBuyField has no fieldMax guard.');
  }

  // Wash level 20 is terminal in config (exp=0), but handler increments forever.
  {
    const p = player([{ uid: 100001, id: 82101, slot: 0, level: 1 }]);
    p.petInfo.skillWashLevel = 20; p.items[37] = 10;
    const { handler } = loadHandler();
    const out = await handler.handlePetWashSkill({ uid: 100001 }, { userId: p.userId, player: p }, 7);
    add('wash-level-terminal', 'P2', 'terminal level must remain 20', { result: Array.isArray(out) ? out.find(x => x.tag === 3306)?.data?.result : out.data?.result, level: p.petInfo.skillWashLevel, exp: p.petInfo.skillWashExp }, 'config level20 exp=0; handler uses needExp=Math.max(1,0), then increments to 21.');
  }

  const result = { readOnly: true, productionWrites: 0, source: 'linhhoasu/lhs/newServer/src/handlers/pet.js', findings };
  const outPath = path.join(ROOT, '_ai_workbench', 'temp', 'pet_full_audit_20260923', 'fragments.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
}

run().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
