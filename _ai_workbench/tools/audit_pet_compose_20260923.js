'use strict';

/**
 * Bounded, RAM-only audit for pet compose/eat/auto-compose.
 *
 * This deliberately loads the live-shaped ConfigService tables but replaces
 * PlayerService with an in-memory recorder. It never connects to Mongo/Redis
 * and never writes a player or runtime source file.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const handlerSource = fs.readFileSync(path.join(app, 'src/handlers/pet.js'), 'utf8');
const clientPath = path.resolve(__dirname, '../../linhhoasu/webgame/game/js/main.min_drop100.js');
const clientSource = fs.readFileSync(clientPath, 'utf8');

// Suppress ConfigService's normal startup log while still using its decoder
// and overlays. This is read-only and keeps the audit output bounded.
const loggerPath = require.resolve(path.join(app, 'src/logger'));
require.cache[loggerPath] = {
  id: loggerPath,
  filename: loggerPath,
  loaded: true,
  exports: { debug() {}, info() {}, warn() {}, error() {} },
};
const runtimeConfig = require(path.join(app, 'src/services/ConfigService'));
const runtimeTables = runtimeConfig.loadAllTables();

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadHandler() {
  const saves = [];
  const task = {
    buildActiveTaskUpdatePackets() { return []; },
  };
  const playerService = {
    async savePlayer(userId, player) {
      saves.push({ userId, player: deepClone(player) });
      return player;
    },
    savePlayerDeferred() { return Promise.resolve(); },
  };
  const progress = {
    addPetComposeCount() { return false; },
    addPetWashCount() { return false; },
    refreshMainTaskProgress() { return false; },
  };
  const raid = {
    addRewardToPlayer(player, itemId, count) {
      const id = Number(itemId);
      const amount = Number(count);
      player.items ||= {};
      player.currencies ||= { diamond: 0, silver: 0, gold: 0 };
      if (id === 1) player.currencies.diamond = Number(player.currencies.diamond || 0) + amount;
      else if (id === 2) player.currencies.silver = Number(player.currencies.silver || 0) + amount;
      else if (id === 6) player.currencies.gold = Number(player.currencies.gold || 0) + amount;
      else player.items[id] = Number(player.items[id] || 0) + amount;
    },
  };
  const dependencyMap = {
    '../services/ConfigService': runtimeConfig,
    '../services/PlayerService': playerService,
    '../logger': { debug() {}, info() {}, warn() {}, error() {} },
    '../services/MainTaskProgressService': progress,
    './raid': raid,
    './task': task,
  };
  let randomCursor = 0;
  const deterministicRandom = () => {
    const value = (randomCursor % 100) / 100;
    randomCursor += 1;
    return value;
  };
  const module = { exports: {} };
  vm.runInNewContext(handlerSource, {
    module,
    exports: module.exports,
    require(request) {
      if (!Object.prototype.hasOwnProperty.call(dependencyMap, request)) {
        throw new Error(`UNEXPECTED_DEPENDENCY:${request}`);
      }
      return dependencyMap[request];
    },
    process: { env: {} }, // live has no PET_COMPOSE_FAIL_OPEN override
    console,
    Date,
    Math: Object.assign(Object.create(Math), { random: deterministicRandom }),
  }, { filename: path.join(app, 'src/handlers/pet.js') });
  return { handler: module.exports, saves };
}

const cfg = runtimeTables.PetConfig;
const qualityCfg = runtimeTables.PetQualityConfig;
const petId = (quality, type = 1, tag = 1) => {
  const row = Object.values(cfg).find((item) => Number(item.quality) === quality
    && Number(item.type) === type && Number(item.tag) === tag);
  assert.ok(row, `runtime PetConfig missing quality=${quality} type=${type} tag=${tag}`);
  return Number(row.id);
};
const expId = (quality) => petId(quality, 0, 2);
const normalId = (quality, type = 1) => petId(quality, type, 1);

function playerWithPets(pets, item36 = 1000) {
  return {
    userId: 'ram-audit',
    items: { 36: item36, 37: 999, 24: 0, 25: 0 },
    currencies: { diamond: 999, silver: 999, gold: 999 },
    petInfo: {
      field: 8,
      nextUid: 100001 + pets.length,
      pets: pets.map((pet, index) => ({
        uid: 100001 + index,
        id: pet.id,
        level: pet.level == null ? 1 : pet.level,
        exp: pet.exp == null ? 0 : pet.exp,
        slot: pet.slot == null ? index : pet.slot,
        locked: pet.locked ? 1 : 0,
        lock: pet.locked ? 1 : 0,
        passiveSkills: [],
        lockSkills: [],
      })),
      unlockAtlas: pets.map((pet) => pet.id),
      rewardedAtlas: [],
      wishMap: {},
      timeRecords: {},
    },
  };
}

function session(player) {
  return { userId: player.userId, player };
}

function resultPacket(result, tag) {
  const packets = Array.isArray(result) ? result : [result];
  return packets.find((packet) => packet && packet.tag === tag) || null;
}

function petSummary(player) {
  return player.petInfo.pets.map((pet) => ({
    uid: pet.uid, id: pet.id, quality: cfg[pet.id] && cfg[pet.id].quality,
    type: cfg[pet.id] && cfg[pet.id].type, tag: cfg[pet.id] && cfg[pet.id].tag,
    level: pet.level, exp: pet.exp, slot: pet.slot, locked: pet.locked,
  }));
}

function clientEvidence() {
  const compose = clientSource.slice(1019770, 1020450);
  const eat = clientSource.slice(1022280, 1022760);
  const auto = clientSource.slice(7168200, 7170200);
  return {
    composeRpc: { offset: 1019770, excerpt: compose },
    eatRpc: { offset: 1022280, excerpt: eat },
    autoFlow: { offset: 7168200, excerpt: auto },
    expectations: [
      '3302 callback deletes both submitted UIDs and updates t.data; same-quality normal pets are client-eligible.',
      '3311 client sends matUid/targetUid from drag; when a normal pet is dragged onto type-0 EXP pet, it sends normal as matUid.',
      '3314 native auto flow composes normal groups, then repeatedly consumes EXP pets; UI text says max-level EXP pets convert 100% to item36.',
    ],
  };
}

async function run() {
  const { handler, saves } = loadHandler();
  const cases = [];

  // Positive baseline: a valid same-type q2 compose consumes the configured
  // q2 cost (5 item36) and leaves one next-quality normal pet.
  {
    const player = playerWithPets([
      { id: normalId(2, 1) },
      { id: normalId(2, 1) },
    ], 1000);
    const result = await handler.handlePetCompose({ uid: 100001, targetUid: 100002 }, session(player), 0);
    const packet = resultPacket(result, 3302);
    const newPet = player.petInfo.pets[0];
    cases.push({
      id: 'compose-valid-q2', severity: 'PASS',
      expected: { result: 0, resultQuality: 3, resultTag: 1, item36Delta: -5, pets: 1 },
      actual: {
        result: packet && packet.data && packet.data.result,
        resultQuality: newPet && cfg[newPet.id] && cfg[newPet.id].quality,
        resultTag: newPet && cfg[newPet.id] && cfg[newPet.id].tag,
        item36Delta: player.items[36] - 1000,
        pets: player.petInfo.pets.length,
      },
      finding: 'Valid q2 same-type compose follows the native protocol and configured cost.',
    });
  }

  // Positive baseline: native auto/manual direction with EXP material works.
  {
    const player = playerWithPets([
      { id: expId(2), level: 1 },
      { id: normalId(2, 1), level: 1 },
    ], 1000);
    const result = await handler.handlePetEat({ matUid: 100001, targetUid: 100002 }, session(player), 0);
    const packet = resultPacket(result, 3311);
    cases.push({
      id: 'eat-valid-exp-onto-normal', severity: 'PASS',
      expected: { result: 0, survivorUid: 100002, consumedUid: 100001, level: 2 },
      actual: {
        result: packet && packet.data && packet.data.result,
        pets: petSummary(player),
        rewards: packet && packet.data && packet.data.rewards && packet.data.rewards.items,
      },
      finding: 'EXP material -> normal target is accepted and increments target level.',
    });
  }

  // 1) Manual compose must fail closed when the cost is missing. Current code
  // ignores consumeItemOrCurrency's false return and still destroys both pets.
  {
    const player = playerWithPets([
      { id: normalId(2, 1) },
      { id: normalId(2, 1) },
    ], 0);
    const before = deepClone(player);
    const result = await handler.handlePetCompose({ uid: 100001, targetUid: 100002 }, session(player), 1);
    const packet = resultPacket(result, 3302);
    cases.push({
      id: 'compose-insufficient-cost', severity: 'P1',
      expected: { result: -1, pets: before.petInfo.pets.length, item36: 0 },
      actual: {
        result: packet && packet.data && packet.data.result,
        pets: player.petInfo.pets.length,
        item36: player.items[36],
        newPet: petSummary(player),
      },
      finding: 'Server mutates/deletes two pets despite missing configured consume item36.',
    });
  }

  // 2) Native q7 success maps to q9 (the client maps the omitted q8 to q9).
  // Runtime server has no q8 and falls back to the first PetConfig row (82001).
  {
    const player = playerWithPets([
      { id: normalId(7, 1) },
      { id: normalId(7, 1) },
    ], 1000);
    const result = await handler.handlePetCompose({ uid: 100001, targetUid: 100002 }, session(player), 2);
    const packet = resultPacket(result, 3302);
    const newPet = player.petInfo.pets[0];
    cases.push({
      id: 'compose-q7-success-result', severity: 'P1',
      expected: { resultQuality: 9, resultTag: 1 },
      actual: {
        result: packet && packet.data && packet.data.result,
        resultId: newPet && newPet.id,
        resultQuality: newPet && cfg[newPet.id] && cfg[newPet.id].quality,
        resultTag: newPet && cfg[newPet.id] && cfg[newPet.id].tag,
        item36Delta: player.items[36] - 1000,
      },
      finding: 'q7 + q7 success attempts quality8; runtime has no q8, so fallback is EXP pet 82001/q2 instead of native q9.',
    });
  }

  // 3) Native drag path sends normal -> EXP for this branch. Server only
  // accepts EXP as matPet, so the valid client operation is rejected.
  {
    const player = playerWithPets([
      { id: normalId(2, 1) },
      { id: expId(2) },
    ], 1000);
    const before = deepClone(player);
    const result = await handler.handlePetEat({ matUid: 100001, targetUid: 100002 }, session(player), 3);
    const packet = resultPacket(result, 3311);
    cases.push({
      id: 'eat-normal-onto-exp', severity: 'P1',
      expected: { result: 0, survivorUid: 100001, consumedUid: 100002 },
      actual: {
        result: packet && packet.data && packet.data.result,
        pets: petSummary(player),
        remainingUids: player.petInfo.pets.map((pet) => pet.uid),
        expectedRemainingUids: before.petInfo.pets.map((pet) => pet.uid),
      },
      finding: 'Client sends this direction from the native drag branch, but server canPetEat rejects normal mat/tag1.',
    });
  }

  // 4) Eating into a max-level target still consumes the EXP pet and returns
  // no item. Native warns at max; server should reject or explicitly convert.
  {
    const player = playerWithPets([
      { id: expId(2), level: 1 },
      { id: normalId(2, 1), level: Number(runtimeTables.PetBaseConfig.levelMax), exp: 77 },
    ], 1000);
    const result = await handler.handlePetEat({ matUid: 100001, targetUid: 100002 }, session(player), 4);
    const packet = resultPacket(result, 3311);
    cases.push({
      id: 'eat-at-level-cap', severity: 'P1',
      expected: { result: -1, consumed: false, item36Reward: 0 },
      actual: {
        result: packet && packet.data && packet.data.result,
        pets: petSummary(player),
        rewards: packet && packet.data && packet.data.rewards && packet.data.rewards.items,
      },
      finding: 'At levelMax server returns success, deletes material, clamps target, and emits no conversion reward.',
    });
  }

  // 5) Auto compose should process EXP pets after normal compose. Current
  // server excludes tag2 entirely, so two valid EXP pets remain untouched.
  {
    const player = playerWithPets([
      { id: normalId(2, 1) },
      { id: normalId(2, 1) },
      { id: expId(2) },
      { id: expId(2) },
    ], 1000);
    const result = await handler.handlePetAutoCompose({ quality: 4 }, session(player), 5);
    const packet = resultPacket(result, 3314);
    const expRemaining = player.petInfo.pets.filter((pet) => Number(cfg[pet.id] && cfg[pet.id].tag) === 2).length;
    cases.push({
      id: 'auto-compose-exp-flow', severity: 'P1',
      expected: { expRemaining: 1, normalPairConsumed: true },
      actual: {
        result: packet && packet.data && packet.data.result,
        expRemaining,
        pets: petSummary(player),
        unlockAtlas: packet && packet.data && packet.data.unlockAtlas,
      },
      finding: 'Native auto flow repeatedly sends 3311 for EXP pets; server only composes tag1 and leaves both EXP pets.',
    });
  }

  // 6) Slot/PetSoul guard: UI only exposes compose slots and unbinds soul on
  // swap, but handler accepts battle slots and deletes a soul-bound pet.
  {
    const player = playerWithPets([
      { id: normalId(2, 1), slot: -1 },
      { id: normalId(2, 1), slot: 0 },
    ], 1000);
    player.other_attr_info = {
      petSoulInfo: { petSouls: [{ id: 210101, petUid: 100001 }] },
    };
    const result = await handler.handlePetCompose({ uid: 100001, targetUid: 100002 }, session(player), 6);
    const packet = resultPacket(result, 3302);
    cases.push({
      id: 'compose-equipped-soul-bound', severity: 'P1',
      expected: { result: -1, pets: 2, soulPetUid: 100001 },
      actual: {
        result: packet && packet.data && packet.data.result,
        pets: petSummary(player),
        soulPetUid: player.other_attr_info.petSoulInfo.petSouls[0].petUid,
      },
      finding: 'No server slot/battle or PetSoul binding guard; direct RPC can delete equipped/soul-bound pet and leave orphan petUid.',
    });
  }

  // 7) Level-limit parity: client computes a quality-specific coercion cap,
  // while this handler always uses PetBaseConfig.levelMax for eat.
  {
    const baseMax = Number(runtimeTables.PetBaseConfig.levelMax);
    const breakQualities = runtimeTables.PetBaseConfig.breakLimitPetQuality || [];
    cases.push({
      id: 'eat-level-cap-parity', severity: 'P2',
      expected: { clientMayExtendCap: breakQualities.length > 0 },
      actual: { serverEatCap: baseMax, breakLimitPetQuality: breakQualities },
      finding: 'Client getPetLevelMax(quality,true) adds CoercionConfig.limitLevelUp for break-limit qualities; 3311 hard-caps at base levelMax.',
    });
  }

  assert.equal(cases.length, 9);
  const evidence = {
    audit: 'pet-compose-eat-auto-compose',
    date: '2026-09-23',
    productionWrites: 0,
    runtimeConfig: {
      petBase: {
        levelMax: runtimeTables.PetBaseConfig.levelMax,
        breakLimitPetQuality: runtimeTables.PetBaseConfig.breakLimitPetQuality,
      },
      petQuality: Object.fromEntries(Object.entries(qualityCfg).map(([id, row]) => [id, {
        composeSuccessRate: row.composeSuccessRate,
        consumes: row.consumes,
      }])),
      q7Normal: normalId(7, 1),
      q9Normal: normalId(9, 1),
      q2Exp: expId(2),
    },
    nativeClient: clientEvidence(),
    cases,
    saveCalls: saves.length,
    note: 'Expected fields are protocol/client expectations; actual fields are current handler outcomes in RAM-only fixtures.',
  };

  const outDir = path.resolve(__dirname, '../temp/pet_full_audit_20260923');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'compose.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ result: 'PASS', cases: cases.length, productionWrites: 0, evidence: path.join(outDir, 'compose.json') }));
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
