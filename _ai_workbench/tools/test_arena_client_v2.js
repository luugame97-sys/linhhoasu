'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');
const base = path.resolve(__dirname, '../..');
const native = fs.readFileSync(path.join(base, 'linhhoasu/webgame/game/js/main.min_a6195824.js'), 'utf8');
const patch = fs.readFileSync(path.join(base, 'linhhoasu/webgame/game/js/lhs-arena-v1.js'), 'utf8');
const timers = new Map(), storage = new Map(), sent = [], notices = [];
let timerId = 0;
function Base() {}
Base.prototype.Rpc = function (tag, data, ok, fail) { sent.push({tag, data, ok, fail}); };
function Arena() {}
Arena.prototype = Object.create(Base.prototype); Arena.prototype.constructor = Arena;
// Extract actual native model methods as one block, not invented model behavior.
const start = native.indexOf('m.onArenaInfoUpdate=function');
const end = native.indexOf('hNe.getArenaTicketMax=function', start);
const ctx = { m: Arena.prototype, A: {ins: () => ({dispatch() {}})}, E: {}, window: null,
  Object, Array, Number, String, Function, Date, Math, console: {warn: x => notices.push(x)},
  setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
  sessionStorage: {getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k)} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(native.slice(start, end).replace(/,$/, ';'), ctx);
function Raid() {}
Raid.prototype = Object.create(Base.prototype); Raid.prototype.constructor = Raid;
Raid.prototype.sendStartFightPart = function (data) { this.Rpc(2300, data, response => { this.battle = response; }); };
function Rank() {}
Rank.prototype.updateUI = function () {};
ctx.GlobalManager = {ArenaModel: Arena, RaidInfoModel: Raid, ArenaRankView: Rank, ActorModel: {actorID: 'qa'}};
ctx.UserInfo = {ServerID: 1002};
vm.runInContext(patch, ctx);
assert(ctx.LhsArenaContractV1.installed);
assert.equal(Function.prototype.onArenaInfo, undefined);
const arena = ctx.GlobalManager.ArenaModel = new Arena();
const raid = ctx.GlobalManager.RaidInfoModel = new Raid();
arena.onArenaInfo({score: 10, challengelist: [], loglist: []});
arena.rankInfo = {rank: 5, ranklist: [{rank: 1}], toplist: [{rank: 1}]};
arena.requestGetChallengeList(); sent.pop().ok({rank: 6, challengelist: [{dbid: 'abcdefabcdefabcdefabcdef', challengeVersion: 'v1'}]});
assert.equal(arena.rankInfo.ranklist.length, 1); assert.equal(arena.rankInfo.toplist.length, 1);
assert.equal(arena.rankInfo.rank, 6);
arena.requestRefreshChllengeList(); const first = sent.pop();
arena.requestRefreshChllengeList(); assert.equal(sent.length, 0);
first.fail(); assert.equal(arena.__lhsArenaRefreshPending, false);
arena.requestRefreshChllengeList(); const retry = sent.pop(); assert.equal(first.data.requestId, retry.data.requestId);
retry.ok({result: -1, message: 'busy', retryable: true}); assert.equal(arena.__lhsArenaRefreshPending, false);
arena.requestRefreshChllengeList(); const third = sent.pop(); assert.equal(first.data.requestId, third.data.requestId);
third.ok({challengelist: [], refreshtime: 3});
arena.requestRefreshChllengeList(); const fourth = sent.pop(); assert.notEqual(first.data.requestId, fourth.data.requestId);
arena.OnSocketClose(); fourth.ok({score: 999}); assert.equal(arena.arenaInfo.score, 10);
arena.Rpc = function () { throw Error('network'); };
arena.requestRefreshChllengeList(); assert.equal(arena.__lhsArenaRefreshPending, false);
arena.Rpc = Base.prototype.Rpc;
arena.requestRefreshChllengeList(); const timed = sent.pop();
for (const fn of [...timers.values()]) fn();
assert.equal(arena.__lhsArenaRefreshPending, false);
timed.ok({score: 888}); assert.equal(arena.arenaInfo.score, 10);
arena.arenaInfo.challengelist = [{dbid: 'abcdefabcdefabcdefabcdef', challengeVersion: 'v1'}];
raid.sendStartFightPart({type: 2, enemyid: 'abcdefabcdefabcdefabcdef'});
const fight = sent.pop(); assert.equal(fight.data.challengeVersion, 'v1'); assert(fight.data.requestId);
fight.ok({result: -1}); assert.equal(raid.battle, undefined);
raid.sendStartFightPart({type: 2, enemyid: 'abcdefabcdefabcdefabcdef'});
const retryFight = sent.pop(); assert.equal(fight.data.requestId, retryFight.data.requestId);
retryFight.ok({enemyid: 'abcdefabcdefabcdefabcdef'}); assert.equal(raid.battle, undefined);
raid.sendStartFightPart({type: 3, enemyid: '12345'});
const revenge = sent.pop(); assert.equal(revenge.data.logUid, '12345'); assert.equal(revenge.data.enemyid, '12345');
revenge.ok({enemyid: '12345', fightResult: {entitys: [{showInfo:{}},{showInfo:{}}]}}); assert(raid.battle);
arena.onArenaLogAdd({loginfo: {uid: 12345, revenge: 0}});
arena.onArenaLogAdd({loginfo: {uid: 12345, revenge: 1}});
assert.equal(arena.getLogList().length, 1); assert.equal(arena.getLogList()[0].revenge, 1);
// UNKNOWN reconnect must replay full payload, not reuse id with a new version.
raid.OnSocketClose();
arena.arenaInfo.challengelist[0].challengeVersion = 'v2';
raid.sendStartFightPart({type: 2, enemyid: 'abcdefabcdefabcdefabcdef'});
const immutable = sent.pop();
assert.equal(JSON.stringify(immutable.data), JSON.stringify(fight.data));
immutable.ok({result: -1, retryable: false, message: 'stale'});
raid.sendStartFightPart({type: 2, enemyid: 'abcdefabcdefabcdefabcdef'});
const fresh = sent.pop(); assert.equal(fresh.data.challengeVersion, 'v2'); assert.notEqual(fresh.data.requestId, fight.data.requestId);
fresh.fail();
raid.sendStartFightPart({type: 2, enemyid: 'bbbbbbbbbbbbbbbbbbbbbbbb'});
const otherTarget = sent.pop(); assert.notEqual(otherTarget.data.requestId, fresh.data.requestId); otherTarget.fail();
ctx.UserInfo.ServerID = 1001;
raid.sendStartFightPart({type: 2, enemyid: 'abcdefabcdefabcdefabcdef'});
const otherServer = sent.pop(); assert.notEqual(otherServer.data.requestId, fresh.data.requestId); otherServer.fail();
ctx.UserInfo.ServerID = 1002;
arena.OnSocketClose();
arena.requestRefreshChllengeList(); const refreshUnknown = sent.pop(); refreshUnknown.fail();
arena.arenaInfo.challengeVersion = 'new-list-version';
arena.OnSocketClose();
arena.requestRefreshChllengeList(); const refreshReplay = sent.pop();
assert.equal(JSON.stringify(refreshReplay.data), JSON.stringify(refreshUnknown.data));
refreshReplay.ok({result: -1, retryable: false});
arena.requestRefreshChllengeList(); const refreshNew = sent.pop();
assert.equal(refreshNew.data.challengeVersion, 'new-list-version'); assert.notEqual(refreshNew.data.requestId, refreshUnknown.data.requestId);
refreshNew.fail();
// V3 now explicitly protects CrossArena; ordinary PvE remains unmodified.
raid.sendStartFightPart({type: 16, enemyid: 'other'}); assert(sent.pop().data.requestId);
raid.sendStartFightPart({type: 1, enemyid: 'pve'}); assert.equal(sent.pop().data.requestId, undefined);
assert(notices.length >= 4);
console.log('PASS arena client v2: native Arena methods, constructor safety, rank merge, duplicate click, transport error/throw/timeout, stale callback, intent retry, malformed fight, revenge UID, log dedupe, CrossArena isolation. Offline only; no native E2E.');
