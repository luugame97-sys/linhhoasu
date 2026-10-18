'use strict';
const crypto = require('crypto');
const MAX = 64;
const TTL = 24 * 60 * 60 * 1000;
function identify(tag, params) {
  if (!params?.requestId) return null; // old client: WS replay cache still applies
  const key = String(params.requestId);
  const modern = /^v3_([a-f0-9]{32})_([1-9][0-9]{0,9})$/.exec(key);
  const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().filter(k => k !== 'requestId').map(k => [k, sorted(value[k])])) : value;
  const hash = crypto.createHash('sha256').update(JSON.stringify(sorted(params))).digest('hex');
  if (modern) return { key: `${tag}:${key}`, epoch: modern[1], sequence: Number(modern[2]), hash, time: Date.now() };
  if (!/^[0-9]{13}-[a-zA-Z0-9_-]{8,64}$/.test(key)) throw new Error('INVALID_FEATURE_REQUEST_ID');
  const time = Number(key.slice(0, 13));
  if (time > Date.now() + 60000 || time < Date.now() - TTL) throw new Error('EXPIRED_FEATURE_REQUEST_ID');
  return { key: `${tag}:${key}`, time, hash };
}
function epochState(journal, id) {
  const epoch = journal?.epochs?.find(row => row.id === id.epoch);
  if (!epoch || epoch.expiresAt <= Date.now()) throw new Error('FEATURE_EPOCH_EXPIRED');
  return epoch;
}
function read(player, tag, params) {
  const id = identify(tag, params);
  if (!id) return null;
  const journal = player.other_attr_info?.featureReceipts;
  const epoch = id.epoch ? epochState(journal, id) : null;
  const row = journal?.rows?.find(row => row.key === id.key);
  if (row) {
    if (row.hash !== id.hash) throw new Error('FEATURE_REQUEST_CONFLICT');
    return JSON.parse(JSON.stringify(row.data));
  }
  if (epoch ? id.sequence <= epoch.maxSequence : id.time <= (journal?.retiredBefore || 0)) throw new Error('FEATURE_REQUEST_RETIRED');
  return null;
}
function record(player, tag, params, data) {
  const id = identify(tag, params);
  if (!id) return;
  player.other_attr_info ||= {};
  const journal = player.other_attr_info.featureReceipts ||= { rows: [], retiredBefore: 0 };
  if (id.epoch) {
    const epoch = epochState(journal, id);
    if (id.sequence <= epoch.maxSequence) throw new Error('FEATURE_REQUEST_RETIRED');
    epoch.maxSequence = id.sequence;
  }
  journal.rows = (journal.rows || []).filter(row => row.key !== id.key);
  journal.rows.push({ ...id, data: JSON.parse(JSON.stringify(data)) });
  journal.rows.sort((a, b) => a.time - b.time);
  while (journal.rows.length > MAX || journal.rows[0]?.time < Date.now() - TTL) {
    const retired = journal.rows.shift();
    if (!retired.epoch) journal.retiredBefore = Math.max(journal.retiredBefore || 0, retired.time);
  }
}
function createEpoch(player, now = Date.now()) {
  player.other_attr_info ||= {};
  const journal = player.other_attr_info.featureReceipts ||= { rows: [], retiredBefore: 0 };
  journal.epochs = (journal.epochs || []).filter(row => row.expiresAt > now).slice(-3);
  const epoch = { id: crypto.randomBytes(16).toString('hex'), issuedAt: now, expiresAt: now + TTL, maxSequence: 0 };
  journal.epochs.push(epoch);
  return { result: 0, epoch: epoch.id, expiresIn: TTL, serverTime: now, sequence: 0 };
}
async function issue(_params, session, msgUid) {
  return require('./PlayerMutationService').run(session?.userId, async () => {
    if (!session?.player || !session.userId) return { tag: 2499, msgUid, data: { result: -1 } };
    const players = require('./PlayerService');
    await players.drainPendingSaves(session.userId);
    const existing = session.player.other_attr_info?.featureReceipts?.epochs?.find(row => row.id === session._featureIssuedEpoch && row.expiresAt > Date.now() + 60000);
    if (existing) return { tag: 2499, msgUid, data: { result: 0, epoch: existing.id, sequence: existing.maxSequence, serverTime: Date.now(), expiresIn: existing.expiresAt - Date.now() } };
    const other = JSON.parse(JSON.stringify(session.player.other_attr_info || {}));
    const draft = { other_attr_info: other };
    const result = createEpoch(draft);
    try { if (!await players.savePlayer(session.userId, draft, { returnSaved: false })) throw new Error('FEATURE_EPOCH_SAVE_FAILED'); }
    catch (e) { require('./RuntimeBus').getWsServer()?.invalidatePlayerForMutation(session.userId); session.player = null; throw e; }
    session.player.other_attr_info = other;
    session._featureIssuedEpoch = result.epoch;
    return { tag: 2499, msgUid, data: result };
  });
}
module.exports = { read, record, createEpoch, issue };
