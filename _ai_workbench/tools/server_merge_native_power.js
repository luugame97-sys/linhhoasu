'use strict';

// Offline-only worker for a future server-merge coordinator.  It deliberately
// has no database, network, dotenv, or production-write path.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

const BLOCKED_MODULES = /^(mongoose|mongodb|ioredis|redis|net|tls|http|https|dns|dgram|undici|dotenv)(\/|$)/i;
const originalLoad = Module._load;
let guardInstalled = false;
function installGuards() {
  if (guardInstalled) return;
  guardInstalled = true;
  Module._load = function guardedLoad(request, parent, isMain) {
    if (/(^|[\\/])logger(?:\.js)?$/.test(String(request || ''))) {
      return { debug() {}, info() {}, warn() {}, error() {} };
    }
    if (BLOCKED_MODULES.test(String(request || ''))) {
      const error = new Error(`OFFLINE_DEPENDENCY_BLOCKED: ${request}`);
      error.code = 'OFFLINE_DEPENDENCY_BLOCKED';
      throw error;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
}

function fail(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  throw error;
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function assertFinite(value, where) {
  if (typeof value === 'number' && !Number.isFinite(value)) fail('NONFINITE_INPUT', where);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertFinite(entry, `${where}[${index}]`));
  } else if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => assertFinite(value[key], `${where}.${key}`));
  }
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value) {
  return crypto.createHash('sha256').update(stable(value)).digest('hex');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.keys(value).forEach((key) => deepFreeze(value[key]));
  return value;
}

function playerKey(player) {
  const id = player && (player.playerId || player.userId || player._id);
  if (id === undefined || id === null || String(id).trim() === '') fail('PLAYER_ID_REQUIRED');
  return String(id);
}

function validatePlayers(players, label) {
  if (!Array.isArray(players) || players.length === 0) fail(`${label}_REQUIRED`);
  const seen = new Set();
  players.forEach((player, index) => {
    if (!player || typeof player !== 'object' || Array.isArray(player)) fail(`${label}_INVALID`, String(index));
    assertFinite(player, `${label}[${index}]`);
    const key = playerKey(player);
    if (seen.has(key)) fail(`${label}_DUPLICATE_ID`, key);
    seen.add(key);
  });
  return seen;
}

function requireNative(sourceRoot, configPath) {
  installGuards();
  const root = path.resolve(String(sourceRoot || path.resolve(__dirname, '..', '..', 'linhhoasu', 'lhs', 'newServer')));
  const services = path.join(root, 'src', 'services');
  const configFile = path.resolve(String(configPath || ''));
  if (!fs.existsSync(path.join(services, 'BattleService.js')) || !fs.existsSync(path.join(services, 'ConfigService.js'))) {
    fail('SOURCE_ROOT_INVALID', root);
  }
  if (!configPath || !fs.existsSync(configFile) || !fs.statSync(configFile).isFile()) fail('CONFIG_FILE_MISSING', configFile);
  const ConfigService = require(path.join(services, 'ConfigService.js'));
  // Explicit path only. No .env loader or implicit production config is used.
  const isolatedEnv = [
    'CONFIG_BIN_PATH', 'FASHION_CONTENT_OVERLAY_PATH', 'FASHION_CHOICE_OVERLAY_PATH',
    'FASHION_CHOICE_STARS_OVERLAY_PATH', 'DROP_LEVEL_200_DISABLED', 'DROP_LEVEL_100_DISABLED',
    'DROP_LEVEL_200_ENABLED', 'DROP_LEVEL_100_ENABLED', 'SERVER_ID', 'DEFAULT_SERVER_ID',
    'DROP_LEVEL_46_ENABLED', 'FISHING_SCENES_8_10_ENABLED', 'FISHING_SCENES_8_10_DISABLED',
    'ROLE_LEVEL_2000_ENABLED', 'ROLE_LEVEL_2000_DISABLED',
  ];
  const savedEnv = Object.fromEntries(isolatedEnv.map((key) => [key, process.env[key]]));
  isolatedEnv.forEach((key) => { delete process.env[key]; });
  let tables;
  try { tables = ConfigService.loadAllTables(configFile); }
  finally {
    isolatedEnv.forEach((key) => {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    });
  }
  if (!tables || !tables.AttrConfig || !tables.FormationBaseConfig) fail('CONFIG_REQUIRED_TABLE_MISSING');
  const battle = require(path.join(services, 'BattleService.js'));
  const readModel = require(path.join(services, 'ArenaReadModelService.js'));
  return { battle, readModel, configPath: configFile };
}

function calculate(player, native) {
  const working = clone(player);
  const workingBefore = hash(working);
  const attrs = native.battle.calcPlayerPower(working);
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs) || Object.keys(attrs).length === 0) fail('POWER_ATTRIBUTES_EMPTY', playerKey(player));
  assertFinite(attrs, `attrs:${playerKey(player)}`);
  const displayPower = native.readModel.displayPower(attrs);
  const powerScore = native.battle.calcPowerScore(attrs);
  if (!Number.isFinite(displayPower) || !Number.isFinite(powerScore) || !Number.isSafeInteger(Math.floor(displayPower)) || !Number.isSafeInteger(Math.floor(powerScore))) fail('POWER_RESULT_INVALID', playerKey(player));
  return {
    id: playerKey(player),
    playerId: player.playerId == null ? null : String(player.playerId),
    userId: player.userId == null ? null : String(player.userId),
    attrs: clone(attrs),
    displayPower: Math.max(0, Math.floor(displayPower)),
    powerScore: Math.max(0, Math.floor(powerScore)),
    cloneMutationHashBefore: workingBefore,
    cloneMutationHashAfter: hash(working),
    cloneMutated: workingBefore !== hash(working),
  };
}

function run(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INPUT_OBJECT_REQUIRED');
  const clock = Number(input.clock);
  if (!Number.isFinite(clock)) fail('CLOCK_REQUIRED');
  const before = input.playersBefore;
  const after = input.playersAfter;
  const beforeIds = validatePlayers(before, 'PLAYERS_BEFORE');
  const afterIds = validatePlayers(after, 'PLAYERS_AFTER');
  if (beforeIds.size !== afterIds.size || [...beforeIds].some((id) => !afterIds.has(id))) fail('PLAYER_SET_MISMATCH');
  const originalBeforeHash = hash(before);
  const originalAfterHash = hash(after);
  deepFreeze(before);
  deepFreeze(after);
  const native = requireNative(input.sourceRoot, input.configPath);
  const beforeRows = before.map((player) => calculate(player, native));
  const afterRows = after.map((player) => calculate(player, native));
  const beforeMap = new Map(beforeRows.map((row) => [row.id, row]));
  const rows = afterRows.map((row) => {
    const prior = beforeMap.get(row.id);
    return {
      ...row,
      beforeDisplayPower: prior.displayPower,
      beforePowerScore: prior.powerScore,
      displayPowerDelta: row.displayPower - prior.displayPower,
      powerScoreDelta: row.powerScore - prior.powerScore,
      attrsHashBefore: hash(prior.attrs),
      attrsHashAfter: hash(row.attrs),
    };
  });
  if (hash(before) !== originalBeforeHash || hash(after) !== originalAfterHash) fail('INPUT_MUTATED');
  return {
    ok: true,
    mode: 'offline-native-power',
    evaluatedAt: clock,
    count: rows.length,
    ids: rows.map((row) => row.id),
    rows,
    inputHashes: { before: originalBeforeHash, after: originalAfterHash },
    sourceRoot: path.resolve(String(input.sourceRoot || path.resolve(__dirname, '..', '..', 'linhhoasu', 'lhs', 'newServer'))),
    configPath: native.configPath,
    coordinatorHashes: {
      source: input.sourceHash || null,
      config: input.configHash || null,
      build: input.buildHash || null,
    },
    outputHash: hash(rows),
    writes: 0,
    networkAttempts: 0,
    databaseAttempts: 0,
  };
}

async function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  try {
    const input = JSON.parse(raw);
    process.stdout.write(`${JSON.stringify(run(input))}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, code: error.code || 'SERVER_MERGE_NATIVE_POWER_FAILED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = { run, stableHash: hash, calculate };
