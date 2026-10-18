const assert = require('assert');
const Module = require('module');
const path = require('path');

const root = path.resolve(__dirname, '../../linhhoasu/lhs/newServer/src');
const serverListPath = path.join(root, 'handlers/serverList.js');
const accessServicePath = path.join(root, 'services/ServerAccessService.js');
const serverConfigService = {
  DEFAULT_SERVER_PAGES: [],
  DEFAULT_SERVERS_BY_PAGE: {},
  findServerConfig: async () => null,
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  const parentFile = parent && parent.filename ? parent.filename : '';
  if ((parentFile === serverListPath || parentFile === accessServicePath)
      && (request === '../services/ServerConfigService' || request === './ServerConfigService')) {
    return serverConfigService;
  }
  if (parentFile === serverListPath) {
    if (request === '../logger') return { info() {}, warn() {}, error() {} };
    if (request === '../services/ConfigService') return { get() { return {}; } };
    if (request === '../services/AccountBanService') return {};
    if (request.startsWith('../services/') && request !== '../services/ServerAccessService') return {};
  }
  return originalLoad(request, parent, isMain);
};

const handler = require(serverListPath);
Module._load = originalLoad;

const beforeOpen = 1788512400000;
const openTime = 1788516000000;
const publicPending = { serverId: 1002, running: true, status: 1, openTime, isNew: true };

assert.strictEqual(handler.resolveServerEntryState(publicPending, beforeOpen), 4);
assert.strictEqual(handler.resolveServerEntryState(publicPending, openTime), 1);
assert.strictEqual(handler.resolveServerEntryState({ ...publicPending, running: false }, openTime), 4);
assert.strictEqual(handler.resolveServerEntryState({ ...publicPending, status: 0 }, openTime), 4);

process.env.SERVER_ID = '1001';
process.env.WS_PUBLIC_PORT = '81';
process.env.WS_PUBLIC_PATH = '/ws';
process.env.WS_PUBLIC_PORT_1002 = '81';
process.env.WS_PUBLIC_PATH_1002 = '/ws-s2';
const endpoint = handler.buildWsEndpoint({ headers: { host: 'lhs.mg365.fun' } }, 1002);
assert.strictEqual(endpoint.url, 'lhs.mg365.fun:81/ws-s2');

serverConfigService.findServerConfig = async () => publicPending;
Promise.resolve()
  .then(async () => {
    const blocked = await handler.resolveServerAccess(1002, beforeOpen);
    assert.strictEqual(blocked.ok, false);
    assert.strictEqual(blocked.code, 'SERVER_NOT_OPEN');

    const allowed = await handler.resolveServerAccess(1002, openTime);
    assert.strictEqual(allowed.ok, true);
    console.log(JSON.stringify({ result: 'PASS', checks: 8 }));
  })
  .catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  });
