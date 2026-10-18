'use strict';
const cross = require('./CrossServerEventService');
const config = require('./ConfigService');
const SYSTEMS = { crossArena: 317, crossRival: 324, topArena: 322 };
const LABELS = { crossArena: 'Đỉnh Phong Diễn Võ', crossRival: 'Tiên Vực Tranh Phong', topArena: 'Thiên Hạ Đệ Nhất' };
const TOP_TAGS = new Set([2350,6200,6201,6202,6203,6210,6211,6212,6213,6214,6215,6216,6217,6218,6220,6221]);
const RIVAL_TAGS = new Set([6550,6551,6553,6554,6555,6556,6557,6560,6562,6563,6564,6565,6566,6567,6568,6569,6570,6571,6572,6573,6575,6580,6582]);
// Leave/cancel packets remain available so an old client can exit a closed map.
function eventForTag(tag) { return TOP_TAGS.has(Number(tag)) ? 'topArena' : RIVAL_TAGS.has(Number(tag)) ? 'crossRival' : null; }
function metadata(event, cycle) {
  if (!cycle) return null;
  if (event === 'topArena') return require('./TopArenaService').calendar(cycle).matchConfig;
  const table = config.get(event === 'topArena' ? 'TopArenaOpenConfig' : 'CrossRivalOpenConfig') || {};
  const template = Object.values(table).sort((a,b)=>Number(a.id)-Number(b.id))[0] || {};
  const row = { ...template, id: cycle.index + 10000, startTime: cycle.startTime, endTime: cycle.endTime };
  if (event === 'topArena') {
    // Translate the native phase offsets, never reuse its expired calendar.
    for (const key of ['promotionStartTime','attrsLockTime','gamePassStartTime','settleTime']) {
      const offset = Number(template[key]) - Number(template.startTime);
      row[key] = Math.min(cycle.endTime, cycle.startTime + Math.max(0, Number.isFinite(offset) ? offset : 0));
    }
  }
  return row;
}
function describe(event, player, server, now = Date.now(), serverId = player.serverId || process.env.SERVER_ID) {
  const cycle = cross.cycleFor(event, now), upcoming = cross.nextCycle(event, now);
  let reason = '';
  if (!cross.isServerAllowed(serverId)) reason = 'SERVER_NOT_IN_POOL';
  else if (!server || !server.openTime || server.openTime > now || server.running === false) reason = 'LOCKED';
  else {
    const openDay = Math.floor((now + 25200000)/86400000) - Math.floor((Number(server.openTime) + 25200000)/86400000) + 1;
    const conditions = config.get('SystemConfig')?.[SYSTEMS[event]]?.conditions;
    if (!conditions || conditions.some(c => c.cond !== 4 || (c.type === 3 ? Number(player.level)||1 : c.type === 5 ? openDay : -1) < c.value)) reason = 'LOCKED';
  }
  const eligible = !reason;
  if (!reason && !cycle) reason = 'CLOSED';
  return { event, systemId: SYSTEMS[event], open: !reason, eligible, reason, cycle, next: upcoming,
    matchConfig: event === 'crossArena' ? null : metadata(event, cycle || upcoming) };
}
async function snapshot(session, now = Date.now()) {
  const sid = Number(session.serverId || session.player?.serverId || process.env.SERVER_ID);
  const server = await require('./ServerConfigService').findServerConfig(sid);
  const events=Object.fromEntries(cross.EVENTS.map(event=>[event,describe(event,session.player||{},server,now,sid)]));
  const top=events.topArena;
  if(top.cycle){top.info=topInfo(top.cycle,now);if(top.open&&!await require('./TopArenaService').canOpen(top.cycle)){top.open=false;top.reason='SETTLEMENT_PENDING';}}
  return { result: 0, version: cross.schedule.version, serverTime: now, serverId: sid,events };
}
async function dispatch(tag, params, session, msgUid, handler) {
  const data = await snapshot(session);
  if (Number(tag) === 6199) return { tag, msgUid, data };
  const event = eventForTag(tag), state = data.events[event];
  if (!state.open) return { tag, msgUid, data: { result: Number(tag) === 2350 ? 1 : -1,
    code: `CROSS_EVENT_${state.reason}`, msg: state.reason === 'CLOSED' ? `${LABELS[event]} chưa đến kỳ mở.`
      : state.reason === 'SERVER_NOT_IN_POOL' ? 'Máy chủ chưa nằm trong nhóm sự kiện.' : `Chưa đủ điều kiện mở ${LABELS[event]}.`,
    schedule: data, challengeInfo: { rank: 200, refreshtime: 0, challengeList: [], infoMap: {} } } };
  return handler(params, session, msgUid);
}
function seasonState(player, event, now = Date.now()) {
  const field = event + 'Info', cycle = cross.cycleFor(event, now);
  let info = player[field] && typeof player[field] === 'object' ? player[field] : {};
  if (cycle && info.cycleKey !== cycle.key) {
    // Adopt the already running C0 without resetting its score or task receipts.
    const adopt = event === 'crossRival' && cycle.index === 0 && !info.cycleKey;
    if (!adopt) {
      const seasons = { ...(info.seasons || {}) }, old = { ...info }; delete old.seasons;
      if (Object.keys(old).length) seasons[info.cycleKey || 'legacy'] = old;
      info = { seasons };
    }
    info.cycleKey = cycle.key; info.cycle = { ...cycle };
  }
  player[field] = info;
  return { info, cycle };
}
function topInfo(cycle, now = Date.now()) {
  if (!cycle) return { stage: 0, phase: 'closed', active: false, season: 0, round: -1, matchId: 0,
    startTime: 0, endTime: 0, cycleKey: '', passDays: [], playerInfo: {} };
  const t=require('./TopArenaService').calendar(cycle);
  return {...require('./TopArenaRules').phase(t,now),season:cycle.index+1,matchId:t.matchId,
    startTime:cycle.startTime,endTime:cycle.endTime,cycleKey:cycle.key};
}
module.exports = { SYSTEMS, eventForTag, describe, snapshot, dispatch, metadata, seasonState, topInfo };
