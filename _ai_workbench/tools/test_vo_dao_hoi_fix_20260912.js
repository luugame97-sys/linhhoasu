'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const arenaPath = path.join(root, 'linhhoasu', 'lhs', 'newServer', 'src', 'handlers', 'arena.js');
const arena = fs.readFileSync(arenaPath, 'utf8');
const index = fs.readFileSync(path.join(root, 'linhhoasu', 'webgame', 'game', 'index.html'), 'utf8');
const handler = require(arenaPath);
const settlement = require(path.join(root, 'linhhoasu', 'lhs', 'newServer', 'src', 'services', 'ArenaSettlementService.js'));

assert.equal(handler.calculateArenaScoreChange(1000, 1000, true), 10);
assert.ok(handler.calculateArenaScoreChange(1000, 2000, true) > 10);
assert.ok(handler.calculateArenaScoreChange(1000, 500, false) < 0);

const player = { arenaDayKey: '2000-01-01', arenaDailyCount: 9, arenaRefreshAt: -1, arenaProtectUntil: -1 };
const state = handler.ensureArenaState(player, Date.UTC(2026, 8, 12));
assert.equal(state.dailyCount, 0);
assert.equal(player.arenaRefreshAt, 0);
assert.equal(player.arenaProtectUntil, 0);

assert.match(arena, /rank\.getTopN\('arena'/, 'Arena info must read authoritative Top-N');
assert.match(arena, /ARENA_TICKET_NOT_ENOUGH/, 'fight ticket must be server-validated');
assert.match(arena, /ARENA_REFRESH_COST_NOT_ENOUGH/, 'refresh cost must be server-validated');
assert.match(arena, /ARENA_TARGET_STALE/, 'stale target must be rejected');
assert.match(arena, /arenaProtectUntil/, 'target protection state missing');
assert.match(arena, /arenaReceiptId\(/, 'fight idempotency receipt missing');
assert.match(arena, /robotAttrs: clonePlain\(attrs\)/, 'real-player combat snapshot missing');
assert.doesNotMatch(arena, /rankList:\s*challengelist\s*,/, 'fight response still aliases challenge list as rank list');
assert.ok(settlement.rewardsForRank('day', 1).length > 0, 'daily arena reward config not readable');
assert.match(index, /lhs-arena-v1\.js\?v=20260913_arena_contract_v2/, 'arena client patch not wired');
assert.match(index, /lhs-socket-send-v3\.js\?v=20260913_socket_send_v3/, 'socket guard not wired');

console.log(JSON.stringify({ result: 'ok', checks: 14 }));
