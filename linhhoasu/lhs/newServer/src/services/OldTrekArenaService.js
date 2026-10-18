'use strict';
const crypto = require('node:crypto');
const config = require('./ConfigService');
const arr = x => Array.isArray(x) ? x : [];
const obj = x => x && typeof x === 'object' && !Array.isArray(x) ? x : {};
const num = (x, fallback = 0) => Number.isFinite(Number(x)) ? Number(x) : fallback;
const info = player => obj(player.other_attr_info?.oldTrekInfo);
const id = player => String(player._id || player.playerId || '');
const score = player => Math.max(0, num(player.oldTrekArenaScore, 1000));
const eligible = p => !p.isBot && !p.managedBot && !/^lhs_real_bot_|^qa_/.test(String(p.userId || ''));
const table = name => config.get(name) || {};
function commonAttrs(player) {
  const state = info(player), attrs = {}, slots = arr(state.sailorSlotList);
  for (const skin of new Set(arr(state.shipSkins))) for (const [key,value] of Object.entries(table('OldTrekShipDressConfig')[skin]?.attrs || {})) attrs[key] = num(attrs[key]) + num(value);
  const echo = slots.length ? Math.min(...slots.map(s=>num(s.level,1))) : 1;
  const base = table('OldTrekSailorLevelUpConfig')[echo]?.fishSoulBaseAttrs || {};
  for (const soul of Object.values(obj(player.fishInfo?.fishSoulSlots)).flatMap(arr)) {
    const row = table('FishSoulConfig')[soul.id]; if (!row) continue;
    const ratio = table('FishSoulTypeConfig')[row.type]?.baseAttrProportion || {};
    for (const [key,value] of Object.entries(ratio)) attrs[key] = num(attrs[key]) + Math.floor(num(value)/10000*num(base[key])*num(soul.multi)/10000*num(arr(row.minAddRate)[0])/10000);
  }
  return attrs;
}
function teams(player, arena = true) {
  const state = info(player), sailors = arr(state.sailorList), slots = arr(state.sailorSlotList);
  const levels = slots.map(s => num(s.level,1));
  const echo = levels.length ? Math.min(...levels) : 1, common = commonAttrs(player);
  return arr(state.setMap?.[arena ? state.arenaSetId : state.sailSetId]).map(line => {
    const people = arr(line.slots).filter(x => x > 0).map(sid => {
      const owned = sailors.find(s => s.id === sid), row = table('OldTrekSailorConfig')[sid];
      if (!owned || !row) return null;
      const level = num(slots.find(s => s.sailorId === sid)?.level, echo);
      const lv = table('OldTrekSailorLevelUpConfig')[level], star = table('OldTrekSailorStarUpConfig')[row.quality]?.[owned.star];
      if (!lv || !star) return null;
      const attrs = {};
      for (const key of ['1','2','3','4']) attrs[key] = Math.floor(Math.floor(num(row.attrs?.[key]) * lv.levelAttrsUp / 10000) * (1 + num(star.attrsUp?.[key]) / 10000));
      return { id: sid, level, star: owned.star, dim: owned.dim, attrs };
    }).filter(Boolean);
    const attrs = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const s of people) for (const key of Object.keys(attrs)) attrs[key] += s.attrs[key];
    for (const [key,value] of Object.entries(common)) attrs[key] = num(attrs[key]) + value;
    for (const [key,value] of Object.entries(attrs)) {
      const definition = table('OldTrekAttrConfig')[key];
      if (definition && definition.dataType !== 1) for (const linked of arr(definition.linkId)) attrs[linked] = Math.floor(num(attrs[linked]) * (1 + value/10000));
    }
    return { id: line.id, leader: people.some(s => s.id === line.leader) ? line.leader : people[0]?.id || 0,
      skill: num(line.skill, -1), skillLevel: num(state.moraleSkill?.[line.skill]), sailors: people, attrs };
  }).filter(line => line.sailors.length);
}
function profile(player, arena = true) {
  const rows = teams(player, arena), state = info(player);
  return { dbid: id(player), name: player.name || 'Đạo hữu', avatar: player.avatar || 11301, avatarFrame: num(player.avatarFrame),
    level: num(player.level, 1), title: num(player.title), serverId: player.serverId, serverName: player.serverName,
    sailorIds: rows.map(r => r.sailors.map(s => s.id)), sailors: rows, commonAttr: commonAttrs(player), cabin: [], privilege: [],
    hp: rows.reduce((s, r) => s + r.attrs[1], 0), maxHp: rows.reduce((s, r) => s + r.attrs[1], 0),
    skinId: state.skin || 300001, job: state.job || 0, shipName: state.name || 'Linh thuyền', skill: state.skillId || 0,
    score: arena ? score(player) : num(state.totalDistance), sailPower: rows.reduce((s, r) => s + Object.entries(r.attrs).reduce((sum,[key,value]) => sum + value * num(table('OldTrekAttrConfig')[key]?.power),0), 0) };
}
// Explicit approximation: 3 parallel line battles, speed order, deterministic
// attack-defense mitigation, 20 rounds and HP-ratio tie-break. No fake victory.
function battle(left, right) {
  const a = teams(left), b = teams(right);
  if (!a.length || !b.length) throw Error('OLD_TREK_FORMATION_EMPTY');
  const results = [], maxRounds = Math.min(50, Number(table('OldTrekBaseConfig').fightMaxRound || 20));
  for (let index = 0; index < 3; index++) {
    const l = a.find(x => x.id === index), r = b.find(x => x.id === index);
    if (!l || !r) throw Error('OLD_TREK_FORMATION_EMPTY');
    const hp = [Math.max(1, l.attrs[1]), Math.max(1, r.attrs[1])], initial = hp.slice(), lines = [l, r], events = [];
    for (let turn = 0; turn < maxRounds && hp[0] > 0 && hp[1] > 0; turn++) {
      const actions = [], order = l.attrs[4] >= r.attrs[4] ? [0,1] : [1,0];
      for (const side of order) {
        const target = 1 - side;
        if (hp[side] <= 0) break;
        const atk = Math.max(1, lines[side].attrs[2]), def = Math.max(0, lines[target].attrs[3]);
        const damage = Math.min(hp[target], Math.max(1, Math.floor(atk * atk / (atk + def))));
        hp[target] -= damage;
        actions.push({ type: 2, index: 101, caster: side === 0 ? 1 : -1, target: 0, args: [], values: {}, events: [
          { type: 3, index: 101, caster: side === 0 ? 1 : -1, target: target === 0 ? 1 : -1, args: [0], values: { 1: -damage }, events: [] },
        ] });
      }
      actions.push({ type: 8888, index: 0, caster: 0, target: 0, args: [300], values: {}, events: [] });
      events.push({ type: 0, index: turn + 1, caster: 0, target: 0, args: [], values: {}, events: actions });
    }
    const win = hp[0] / initial[0] > hp[1] / initial[1] ? 1 : 0;
    results.push({ win, line: index + 1, entitys: [
      { side: 1, leader: l.leader, ids: l.sailors.map(s => s.id), maxHp: initial[0] },
      { side: -1, leader: r.leader, ids: r.sailors.map(s => s.id), maxHp: initial[1] },
    ], events: [{ type: 0, index: 0, caster: 0, target: 0, args: [], values: {}, events: [] }, ...events] });
  }
  return { win: results.filter(r => r.win === 1).length >= 2 ? 1 : 0, results, params: { weather: 1 }, playerInfos: { 1: profile(left), '-1': profile(right) } };
}
function ratingChange(a, b, win) {
  const raw = Math.round(32 * (win ? 1 : 0) - 32 / (1 + Math.pow(10, (b - a) / 400)));
  return win ? Math.max(1, Math.min(32, raw)) : Math.min(-1, Math.max(-32, raw));
}
function grade(value) { return Object.values(table('OldTrekArenaScoreConfig')).find(r => value >= r.scoreLeft && (r.scoreRight < 0 || value < r.scoreRight))?.id || 1; }
function npc(player) {
  const s = info(player), ids = Object.values(table('OldTrekSailorConfig')).filter(r => r.quality === 4).slice(0,3).map(r => r.id);
  const level = Math.max(1, Math.min(300, Math.floor(num(arr(s.sailorSlotList)[0]?.level, 1) * 0.8)));
  return { _id: '000000000000000000000002', userId: 'npc-oldtrek', name: 'Thuyền tập luyện', level: 1, oldTrekArenaScore: score(player),
    other_attr_info: { oldTrekInfo: { arenaSetId: 0, sailorList: ids.map(id => ({ id, star: 0, dim: {} })), sailorSlotList: ids.map((id, slot) => ({ slot, sailorId: id, level })),
      setMap: { 0: ids.map((id, i) => ({ id: i, leader: id, skill: -1, slots: [id,0,0,0] })) } } } };
}
async function roster(season) {
  const rows = await require('../db/models/Player').collection.find({ 'other_attr_info.oldTrekInfo.season': season, isBot: { $ne: true }, managedBot: { $ne: true } },
    { projection: { userId: 1, playerId: 1, name: 1, avatar: 1, avatarFrame: 1, title: 1, level: 1, serverId: 1, serverName: 1, oldTrekArenaScore: 1, 'other_attr_info.oldTrekInfo': 1 }, maxTimeMS: 5000 }).toArray();
  return rows.filter(eligible);
}
async function rank(player, arena = true) {
  const rows = await roster(info(player).season);
  const others = rows.filter(p => p.userId !== player.userId); if (eligible(player)) others.push(player);
  const sorted = others.map(p => profile(p, arena)).filter(p => p.score > 0).sort((a,b) => b.score-a.score || a.dbid.localeCompare(b.dbid));
  const own = sorted.findIndex(p => p.dbid === id(player));
  return { list: sorted.slice(0,100).map((r,i) => ({ ...r, rank: i+1 })), rank: own + 1, score: arena ? score(player) : num(info(player).totalDistance) };
}
async function match(player) {
  const choices = (await roster(info(player).season)).filter(p => p.userId !== player.userId && teams(p).length === 3);
  choices.sort((a,b) => Math.abs(score(a)-score(player))-Math.abs(score(b)-score(player)) || id(a).localeCompare(id(b)));
  const opponent = choices.length ? choices[crypto.randomInt(Math.min(10, choices.length))] : npc(player);
  return { uid: crypto.randomBytes(12).toString('hex'), createdAt: Date.now(), expiresAt: Date.now()+120000, opponent, profile: profile(opponent) };
}
async function findProfile(player, target) {
  if ([id(player), player.playerId].includes(String(target))) return player;
  return (await roster(info(player).season)).find(p => [id(p), p.playerId].includes(String(target))) || null;
}
module.exports = { profile, teams, battle, ratingChange, grade, npc, rank, match, score, findProfile };
