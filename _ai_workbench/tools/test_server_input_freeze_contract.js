'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const ws = read('linhhoasu', 'lhs', 'newServer', 'src', 'net', 'WSServer.js');
const bots = read('linhhoasu', 'lhs', 'newServer', 'src', 'bots', 'RealBotWorker.js');
const basic = read('linhhoasu', 'lhs', 'newServer', 'src', 'handlers', 'basic.js');
const arena = read('linhhoasu', 'lhs', 'newServer', 'src', 'handlers', 'arena.js');
const account = read('linhhoasu', 'lhs', 'newServer', 'src', 'db', 'models', 'Account.js');

const observerStart = ws.indexOf('hasMapObservers(mapId, line = 0)');
const observerEnd = ws.indexOf('getRealBotStats()', observerStart);
const observer = ws.slice(observerStart, observerEnd);
assert.ok(observerStart >= 0 && observerEnd > observerStart, 'observer method missing');
assert.match(observer, /session\._isBot/, 'managed bots still count as human observers');

assert.match(ws, /logger\.debug\(`\[WSServer\] C->S/, 'inbound packet log is still info-level');
assert.match(ws, /logger\.debug\(\s*`\[WSServer\] 发送/, 'outbound packet log is still info-level');
assert.match(basic, /logger\.debug\(\s*`\[DEBUG\] tag:1400/, 'map-enter payload log is still info-level');

assert.match(bots, /Number\(message\.tag\) === 1400 && state\.mapRetryTimer/, 'map retry ACK cleanup missing');
assert.match(bots, /clearTimeout\(state\.mapRetryTimer\)/, 'map retry timer is not cancelled');

assert.match(arena, /maxTimeMS\(1500\)/, 'arena queries are not bounded');
assert.match(arena, /buildArenaChallengeRowFromPlayer\(targetPlayer, serverId, \{ clone: false \}\)/,
  'arena still clones every lean opponent');
assert.match(arena, /Promise\.all\(\[/, 'arena rank/opponent reads are still sequential');
assert.match(arena, /void notifyArenaTargetUpdate/, 'arena target notification still blocks requester');
assert.match(account, /accountSchema\.index\(\{ 'roles\.serverId': 1 \}\)/, 'roles.serverId index declaration missing');

console.log(JSON.stringify({
  result: 'ok',
  botObserverGuard: true,
  duplicateMapRetryCleanup: true,
  packetLogSampling: true,
  arenaDeadline: true,
  arenaNoFullClone: true,
  arenaParallelRead: true,
  arenaDetachedPush: true,
  accountRoleIndexes: true,
}));
