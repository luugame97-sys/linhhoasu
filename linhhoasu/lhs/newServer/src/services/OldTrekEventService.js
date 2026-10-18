'use strict';
// Native wire shapes with explicitly owner-approved custom balance.
// Pure state mutation only: caller must clone, lock and persist state+receipt
// atomically with the rewards before publishing any response.
const crypto = require('node:crypto');
const config = require('./ConfigService');
const policy = require('../config/oldTrekGameplayPolicy.json');
const puzzle = require('./OldTrekPuzzleService');
const combat = require('./OldTrekArenaService');
const obj = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const arr = value => Array.isArray(value) ? value : [];
const copy = value => JSON.parse(JSON.stringify(value));
const fail = code => ({ ok: false, code });

function createService({ get = name => config.get(name), randomInt = (n) => crypto.randomInt(n), rules = policy } = {}) {
  function pick(rows) {
    if (!rows.length) throw Error('OLD_TREK_EVENT_POOL_EMPTY');
    const index = randomInt(rows.length);
    if (!Number.isInteger(index) || index < 0 || index >= rows.length) throw Error('OLD_TREK_RNG_INVALID');
    return rows[index];
  }
  function roots() {
    const rows = Object.values(obj(get('OldTrekCommonEventConfig')));
    const referenced = new Set(rows.flatMap(r => [...arr(r.choiceNext), ...arr(r.nextId)]).flat().map(Number));
    return rows.filter(r => Number.isSafeInteger(r.id) && rules.eventTypeWeights[r.eventType] > 0 && !referenced.has(r.id)).concat(rules.eventTypeWeights[4] > 0 ? [{ id: 4041, eventType: 4, nextId: [[4001],[4002]], choiceNext: [], checkValue: [] }] : []);
  }
  function nextUid(info, now) {
    const uid = Math.max(Number(info.nextEventUid) || 0, Number(info.lastEventUid) || 0, now) + 1;
    if (!Number.isSafeInteger(uid)) throw Error('OLD_TREK_EVENT_UID_OVERFLOW');
    info.nextEventUid = uid;
    return uid;
  }
  function build(info, row, trek, now, previous = null, actor = null) {
    const event = { uid: nextUid(info, now), id: row.id, pre: previous ? previous.uid : -1,
      createdAt: now, policyVersion: rules.version, trekUid: trek.uid,
      season: info.season, rootUid: previous ? previous.rootUid || previous.uid : 0,
      chainStep: previous ? previous.chainStep + 1 : 0,
      failedCheck: !!(previous && previous.failedCheck) };
    if ([2,3].includes(row.eventType)) {
      event.enemySnapshot = combat.npc(actor || { other_attr_info: { oldTrekInfo: info } });
      event.enemy = combat.profile(event.enemySnapshot);
    }
    if (row.eventType === 4) {
      const game = row.id === 4041 ? { type: 4, levelRange: [1] } : obj(get('OldTrekMiniGameConfig'))[row.id];
      if (!game || ![1, 2, 3, 4].includes(game.type)) throw Error('OLD_TREK_MINIGAME_CONFIG');
      const levels = game.type === 4 ? { 1: { winScore: 1 } } : obj(get(`OldTrekMiniGame${game.type}Config`));
      event.miniGameLevel = pick(arr(game.levelRange).filter(id => levels[id]));
      event.miniGameType = game.type;
      event.deadline = now + rules.miniGameMaxElapsedMs;
      if (game.type === 4) { event.puzzleSeed = randomInt(2147483647); event.puzzleBoard = puzzle.board(event.puzzleSeed); }
    }
    return event;
  }
  function spawn(info, now = Date.now(), actor = null) {
    const sail = info.sailInfo, trek = sail && sail.trekData;
    if (!trek || sail.currentEvent) return null;
    // Existing journeys adopt at their current checkpoint; never backpay events.
    if (trek.eventPolicyVersion !== rules.version) {
      trek.eventPolicyVersion = rules.version;
      trek.nextEventDistance = Number(trek.dist || 0) + rules.eventDistance;
      trek.encounterCount = 0;
      return null;
    }
    if (trek.encounterCount >= rules.maxEncountersPerTrek || trek.dist < trek.nextEventDistance) return null;
    const supportedRoots = roots().filter(r => r.id !== 4041 || info.puzzleClientVersion === '20260921_v1');
    const groups = Object.entries(rules.eventTypeWeights).map(([type, weight]) => ({ weight, rows: supportedRoots.filter(r => Number(r.eventType) === Number(type)) })).filter(r => r.rows.length && r.weight > 0);
    if (!groups.length) throw Error('OLD_TREK_EVENT_POOL_EMPTY');
    let roll = randomInt(groups.reduce((sum, r) => sum + r.weight, 0)), selected = groups[0];
    for (const group of groups) { selected = group; roll -= group.weight; if (roll < 0) break; }
    const event = build(info, pick(selected.rows), trek, now, null, actor);
    event.rootUid = event.uid;
    sail.currentEvent = event;
    info.lastEventUid = event.uid;
    trek.encounterCount++;
    trek.nextEventDistance += rules.eventDistance;
    return event;
  }
  function resolve(info, params, now = Date.now(), actor = null) {
    const sail = info.sailInfo, trek = sail && sail.trekData;
    const uid = Number(params.eventUid), operate = Number(params.operate);
    if (!Number.isSafeInteger(uid) || uid <= 0) return fail('OLD_TREK_EVENT_UID_INVALID');
    const receipt = arr(info.eventLedger).find(r => r.uid === uid && r.season === info.season);
    if (receipt) {
      if (receipt.operate !== operate || receipt.param !== Number(params.param || 0)) return fail('OLD_TREK_REQUEST_CONFLICT');
      return { ok: true, replayed: true, rewardRows: [], event: sail.currentEvent };
    }
    const event = sail && sail.currentEvent;
    if (!trek || !event || Number(event.uid) !== uid) return fail('OLD_TREK_EVENT_UID_INVALID');
    if (event.policyVersion !== rules.version || event.trekUid !== trek.uid || event.season !== info.season) return fail('OLD_TREK_EVENT_POLICY_REQUIRED');
    if (params.revision != null && Number(params.revision) !== info.stateRevision) return fail('OLD_TREK_REVISION_STALE');
    if (![0, 1].includes(operate) || !Number.isSafeInteger(Number(params.param || 0))) return fail('OLD_TREK_EVENT_ACTION_INVALID');
    const table = { ...obj(get('OldTrekCommonEventConfig')), 4041: { id: 4041, eventType: 4, nextId: [[4001],[4002]], choiceNext: [], checkValue: [] } }, row = table[event.id];
    if (!row || ![1,2,3,4,6,98,99].includes(row.eventType)) return fail('OLD_TREK_EVENT_TYPE_UNSUPPORTED');
    if (event.chainStep >= rules.maxChainSteps) return fail('OLD_TREK_EVENT_CHAIN_LIMIT');
    const choices = arr(row.choiceNext);
    if ((!choices.length && ![3,4].includes(row.eventType) && operate !== 0) || (choices.length && !Array.isArray(choices[operate])) || (![2,3,4].includes(row.eventType) && Number(params.param || 0) !== 0)) return fail('OLD_TREK_EVENT_ACTION_INVALID');
    let outcome = 0, check = [], battleResult = null, battleLog = null;
    if ([2,3].includes(row.eventType)) {
      if (!event.enemySnapshot || !actor || Number(params.param || 0) < 0 || Number(params.param || 0) > 3) return fail('OLD_TREK_BATTLE_STATE_REQUIRED');
      if (operate === 1) outcome = 1;
      else {
        // Use the sailing formation for an encounter, arena formation for PvP.
        const attacker = copy(actor); attacker.other_attr_info.oldTrekInfo.arenaSetId = info.sailSetId;
        battleResult = combat.battle(attacker, event.enemySnapshot); outcome = battleResult.win ? 0 : 1;
        battleLog = { logTime: now, recordId: String(event.uid), dbid: event.enemy.dbid, win: battleResult.win,
          stableChange: outcome ? -rules.seaBattleStableLoss : 0, enemyStableChange: outcome ? 0 : -rules.seaBattleStableLoss };
      }
    }
    if (row.eventType === 4) {
      const level = event.miniGameType === 4 ? { winScore: 1 } : obj(get(`OldTrekMiniGame${event.miniGameType}Config`))[event.miniGameLevel];
      const threshold = Number(level && (level.winScore || level.successScore));
      const score = Number(params.param || 0), elapsed = now - event.createdAt;
      if (!Number.isFinite(threshold) || threshold <= 0) return fail('OLD_TREK_MINIGAME_CONFIG');
      if (score < 0 || score > threshold * rules.miniGameMaxScoreMultiple || score > 0 && elapsed < rules.miniGameMinElapsedMs) return fail('OLD_TREK_MINIGAME_SCORE_INVALID');
      outcome = elapsed <= rules.miniGameMaxElapsedMs && score >= threshold && operate === 0 ? 0 : 1;
      if (event.miniGameType === 4 && outcome === 0 && !puzzle.validate(event.puzzleSeed, params.proof)) return fail('OLD_TREK_PUZZLE_PROOF_INVALID');
    }
    if (arr(row.checkValue).length) {
      const spec = row.checkValue[0], dice = obj(obj(get('OldTrekEventDiceConfig'))[trek.id])[trek.diff];
      if (!dice || !arr(dice.dice).length || dice.dice.some(d => !Number.isSafeInteger(d) || d < 1 || d > 100)) return fail('OLD_TREK_DICE_CONFIG_INVALID');
      const sailors = arr(info.sailorList), ids = new Set(arr(obj(info.setMap)[info.sailSetId]).flatMap(r => arr(r.slots)));
      const dim = Math.max(0, ...sailors.filter(s => ids.has(s.id)).map(s => Number(obj(s.dim)[spec[0]]) || 0));
      const baseValue = dice.dice.map(d => randomInt(d) + 1);
      const effectTable = obj(get('OldTrekSailEffectConfig')), entryTable = obj(get('OldTrekEntryConfig'));
      const grouped = new Map(), independent = [];
      for (const sailor of sailors.filter(s => ids.has(s.id))) {
        const cfg = obj(get('OldTrekSailorConfig'))[sailor.id]; if (!cfg) continue;
        const star = obj(obj(get('OldTrekSailorStarUpConfig'))[cfg.quality])[sailor.star];
        for (const entryId of arr(cfg.entry).slice(0, star?.entryUnlockNum ?? cfg.initialEntryNum)) {
          const entry = entryTable[entryId]; if (!entry) continue;
          if (entry.group === -1) independent.push(entry);
          else if (!grouped.has(entry.group) || grouped.get(entry.group).quality < entry.quality) grouped.set(entry.group, entry);
        }
      }
      function rollEffect(effectId) {
        const e = effectTable[effectId], a = arr(e?.args);
        if (!e) return null;
        if (e.type === 5 && a.length) return Number(a[0]);
        if (a[0] !== spec[0]) return null;
        if (e.type === 1 && a.length >= 2) return Number(a[1]);
        if (e.type === 2 && a.length >= 3 && Number.isSafeInteger(a[1]) && Number.isSafeInteger(a[2]) && a[2] >= a[1]) return a[1] + randomInt(a[2]-a[1]+1);
        return null;
      }
      const entries = [], effect = [], baseEffect = [];
      for (const e of [...grouped.values(), ...independent]) if (e.type === 1 && arr(e.eventSubType).some(t => t === 0 || t === row.eventSubType) && (!arr(e.activeDestination).length || e.activeDestination.includes(trek.id))) {
        for (const effectId of arr(e.effect)) { const bonus=rollEffect(effectId); if (bonus != null) entries.push([e.id, bonus]); }
      }
      for (const e of arr(sail.effects)) if (effectTable[e.id]?.ifShow === 1 && !(effectTable[e.id].duration > 0 && trek.dist > e.endDist)) { const bonus=rollEffect(e.id); if(bonus!=null)effect.push([e.id,bonus]); }
      for (const effectId of arr(row.baseEffect)) { const bonus=rollEffect(effectId); if(bonus!=null)baseEffect.push([effectId,bonus]); }
      const extra=[...entries,...effect,...baseEffect].reduce((sum,r)=>sum+r[1],0);
      outcome = baseValue.reduce((a, b) => a + b, dim+extra) >= Number(spec[1]) + Number(dice.checkFloat || 0) ? 0 : 1;
      check = [{ baseValue, dim, baseEffect, effect, entries }];
    }
    const branches = choices.length ? choices : arr(row.nextId), branch = branches[choices.length ? operate : outcome];
    if (branches.length && !Array.isArray(branch)) return fail('OLD_TREK_EVENT_BRANCH_INVALID');
    const nextId = branch && branch.length ? pick(branch) : 0;
    if (nextId && !table[nextId]) return fail('OLD_TREK_EVENT_CONFIG_MISSING');
    const previous = { ...event, failedCheck: event.failedCheck || outcome === 1 };
    const next = nextId ? build(info, table[nextId], trek, now, previous) : null;
    const terminal = !next;
    const rewardRows = terminal ? copy(previous.failedCheck ? rules.terminalFailureReward : rules.terminalSuccessReward) : [];
    const itemUpdate = [];
    if (terminal && !previous.failedCheck && arr(sail.cabin).length < rules.maxCargoRows && randomInt(10000) < rules.cargoChanceBps) {
      const pool = arr(obj(obj(get('OldTrekDestinationConfig'))[trek.id])[trek.diff]?.floatRewards).filter(r => obj(get('OldTrekItemConfig'))[r.id]);
      if (pool.length) {
        const chosen = pick(pool), item = { uid: nextUid(info, now), id: chosen.id, count: 1, state: 1, targetUid: -1 };
        sail.cabin = arr(sail.cabin).concat(item); itemUpdate.push(item);
      }
    }
    const lastLog = { uid: event.uid, id: event.id, pre: event.pre, result: outcome, param: Number(params.param || 0), time: now, rewards: rewardRows };
    sail.currentEvent = next;
    if (battleResult) {
      trek.stable = Math.max(1, Number(trek.stable || 100) + battleLog.stableChange);
      info.battleRecords = obj(info.battleRecords); info.battleRecords[battleLog.recordId] = battleResult;
      for (const key of Object.keys(info.battleRecords).slice(0,-100)) delete info.battleRecords[key];
      info.battleLogs = arr(info.battleLogs).concat(battleLog).slice(-100); info.battleLogUid = now;
    }
    sail.eventLogs = arr(sail.eventLogs).concat(lastLog).slice(-rules.logLimit);
    info.eventLedger = arr(info.eventLedger).concat({ uid, season: info.season, trekUid: trek.uid, operate, param: Number(params.param || 0), policyVersion: rules.version, rewardRows, time: now }).slice(-rules.replayWindow);
    info.lastEventUid = next ? next.uid : event.uid;
    info.stateRevision = Number(info.stateRevision || 0) + 1;
    info.taskRecord = obj(info.taskRecord);
    // Event objectives are keyed by the event type.  Type 3 (large battle)
    // must not be recorded as the generic type-2 encounter objective.
    const taskType = Number(row.eventType) || 2;
    const key = 10000 * event.id + 100 * trek.id + taskType;
    info.taskRecord[key] = Number(info.taskRecord[key] || 0) + 1;
    for (const item of itemUpdate) {
      const quality = obj(get('AssetsConfig'))[item.id]?.quality;
      if (quality) { const k=10000*quality+100*trek.id+6;info.taskRecord[k]=Number(info.taskRecord[k]||0)+item.count; }
    }
    return { ok: true, event: next, lastLog, check, rewardRows, itemUpdate, battleResult, battleLog, shipExp: terminal ? rules.terminalShipExp : 0, terminal };
  }
  return { rules, roots, spawn, resolve };
}
module.exports = Object.assign(createService(), { createService });
