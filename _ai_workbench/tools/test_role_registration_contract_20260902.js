'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const calls = [];
const accounts = new Map();
const mockAccountService = {
  DEFAULT_SERVER_PAGES: [],
  DEFAULT_SERVERS_BY_PAGE: {},
  findAccount: async (id) => accounts.get(String(id).toLowerCase()) || null,
  createRegisteredAccount: async (id) => {
    const account = { accountId: String(id).toLowerCase(), inviteCode: '', roles: [] };
    accounts.set(account.accountId, account);
    calls.push({ method: 'createRegisteredAccount', accountId: account.accountId });
    return account;
  },
  createRole: async (_id, options) => {
    calls.push({ method: 'createRole', options });
    return { role: { roleId: 'r1', userId: 'u1', serverId: 1001, name: 'Role' }, roles: [] };
  },
  pickRole: () => null,
  normalizeAccountId: (id) => String(id || '').trim().toLowerCase(),
  authenticateAccountDetailed: async (id) => ({ account: accounts.get(String(id).toLowerCase()) || null }),
  ensureAccountForLogin: async () => ({ account: null, newlyCreated: false }),
  bindLegacyPlayerRole: async () => undefined,
  createRandomAccount: async () => ({ accountId: 'guest_test', password: 'Pass12345' }),
  markRoleLogin: async () => undefined,
  deleteRole: async () => ({ roles: [] }),
  setActiveRole: async () => ({ roles: [] }),
};
const mockConfigService = { get: () => ({}) };
const mockPlayerService = { loadPlayer: async () => null };
const mockAuthSessionService = { create: async () => ({ token: 'token' }) };
const mockServerConfigService = {
  DEFAULT_SERVER_PAGES: [],
  DEFAULT_SERVERS_BY_PAGE: {},
  findServerConfig: async () => ({ serverName: 'S1', pageId: 1, running: true }),
  listAllServers: async () => [],
  listServerPages: async () => [],
  listServersByPage: async () => [],
};
const mockAccountBanService = { buildBanView: () => ({}), resolveAccountBanState: async () => ({ banned: false }) };
const mockLogger = { info() {}, warn() {}, error() {} };

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  const normalized = String(request).replace(/\\/g, '/');
  if (normalized.endsWith('/services/AccountService')) return mockAccountService;
  if (normalized.endsWith('/services/AuthSessionService')) return mockAuthSessionService;
  if (normalized.endsWith('/services/ConfigService')) return mockConfigService;
  if (normalized.endsWith('/services/PlayerService')) return mockPlayerService;
  if (normalized.endsWith('/services/ServerConfigService')) return mockServerConfigService;
  if (normalized.endsWith('/services/AccountBanService')) return mockAccountBanService;
  if (normalized.endsWith('/logger')) return mockLogger;
  return originalLoad.call(this, request, parent, isMain);
};

const handlerPath = process.env.ROLE_FLOW_HANDLER_PATH
  ? path.resolve(process.env.ROLE_FLOW_HANDLER_PATH)
  : path.resolve(__dirname, '..', 'temp', 'role_flow_candidate_20260902', 'src', 'handlers', 'serverList.js');
const serverList = require(handlerPath);

(async () => {
  const registration = await serverList.handleCreateRoleByAccount({ account: 'QAFlow01', password: 'Pass12345' });
  assert.strictEqual(registration.ret, 0);
  assert.strictEqual(registration.result, 0);
  assert.strictEqual(registration.needCreateRole, 1);
  assert.deepStrictEqual(registration.roles, []);
  assert(calls.some((row) => row.method === 'createRegisteredAccount'));
  assert(!calls.some((row) => row.method === 'createRole'));

  calls.length = 0;
  const explicit = await serverList.handleCreateRoleByAccount({
    account: 'QAFlow01',
    password: 'Pass12345',
    serverId: 1001,
    roleName: 'ChosenRole',
    kungfuId: 4,
    subJob: 0,
  });
  assert.strictEqual(explicit.ret, 0);
  assert(calls.some((row) => row.method === 'createRole'));
  assert.strictEqual(calls.find((row) => row.method === 'createRole').options.deferRoleSelection, undefined);

  console.log(JSON.stringify({ result: 'PASS', accountOnlyRegistration: true, explicitRoleCompatibility: true }));
})().finally(() => { Module._load = originalLoad; });
