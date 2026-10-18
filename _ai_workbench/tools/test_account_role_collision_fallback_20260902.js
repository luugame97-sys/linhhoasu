'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const account = {
  accountId: 'qa_collision',
  passwordHash: '$2fake',
  roles: [],
  inviteCode: null,
  activeRoleByServer: {},
  save: async function save() { return this; },
  markModified() {},
  toObject() { return this; },
};
const createdNames = [];
let createAttempts = 0;
const fakePlayerService = {
  createPlayer: async (userId, name, extra) => {
    createAttempts += 1;
    createdNames.push(name);
    if (createAttempts === 1) {
      const error = new Error('duplicate name');
      error.code = 11000;
      throw error;
    }
    return { userId, playerId: `p_${userId}`, name, ...extra };
  },
  savePlayer: async (_userId, data) => data,
};
const fakeAccountModel = {
  findOne: async () => { console.error('FAKE_FIND_ONE'); return account; },
  updateOne: async () => ({ matchedCount: 1 }),
  create: async () => account,
};
const fakeServerConfig = { findServerConfig: async () => ({ serverName: 'S1' }) };
const fakePreparedNames = {
  isDefaultGeneratedName: () => true,
  resolveNewPlayerName: () => 'ExistingName',
};
const fakePlayerName = { validatePlayerName: (name) => ({ ok: true, name, code: 'OK' }) };
const fakeBan = { resolveAccountBanState: async () => ({ banned: false }) };
const fakeDist = { bindInvite: async () => ({}) };
const fakeAppearance = { ensureRoleAppearance() {} };
const fakeLogger = { info() {}, warn() {}, error() {} };
const fakeBcrypt = { hash: async () => 'hash', compare: async () => { console.error('FAKE_COMPARE'); return true; } };

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  const normalized = String(request).replace(/\\/g, '/');
  if (normalized.endsWith('/db/models/Account')) return fakeAccountModel;
  if (normalized.endsWith('/db/models/Player')) return {};
  if (normalized.toLowerCase().includes('playerservice')) return fakePlayerService;
  if (normalized.toLowerCase().includes('serverconfigservice')) return fakeServerConfig;
  if (normalized.endsWith('/PreparedNameService')) return fakePreparedNames;
  if (normalized.endsWith('/PlayerNameService')) return fakePlayerName;
  if (normalized.endsWith('/RoleAppearanceService')) return fakeAppearance;
  if (normalized.endsWith('/DistClient')) return fakeDist;
  if (normalized.toLowerCase().includes('accountbanservice')) return fakeBan;
  if (normalized.endsWith('/logger')) return fakeLogger;
  if (normalized === 'bcrypt') return fakeBcrypt;
  return originalLoad.call(this, request, parent, isMain);
};

const target = path.resolve(__dirname, '..', '..', 'linhhoasu', 'lhs', 'newServer', 'src', 'services', 'AccountService.js');
const accountService = require(target);

(async () => {
  const result = await accountService.createRole('qa_collision', { password: 'Pass12345', serverId: 1001, deferRoleSelection: true });
  assert.strictEqual(createAttempts, 2);
  assert.strictEqual(result.role.serverId, 1001);
  assert(/^HanhGia_1001_[a-f0-9]+/i.test(createdNames[1]), `unexpected fallback name: ${createdNames[1]}`);
  assert.strictEqual(result.role.name, createdNames[1]);
  console.log(JSON.stringify({ result: 'PASS', attempts: createAttempts, firstCandidate: createdNames[0], fallbackCandidatePattern: 'HanhGia_<server>_<entropy>' }));
})().finally(() => { Module._load = originalLoad; });
