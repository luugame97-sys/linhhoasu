'use strict';
const crypto = require('node:crypto');
const persisted = new WeakMap();
const pending = new WeakMap();
const tracked = player => !!player && (persisted.has(player) || pending.has(player));
// Generic saves already own immutable snapshots. Retain references only;
// hash them lazily when this role next enters the OldTrek guarded flow.
function rememberConfirmed(player, snapshot, fields = null) {
  if (process.env.OLD_TREK_SCOPED_CAS !== '1' || !player || typeof player !== 'object') return;
  // A confirmed full save is an authoritative first-entry ancestor. Keep the
  // immutable save snapshot reference without hashing/cloning it globally.
  // Partial writes cannot establish missing values of an unknown baseline.
  if (fields && !tracked(player)) return;
  const queue = fields ? (pending.get(player) || []) : [];
  // Bound retained immutable snapshots. If too many partial saves occur
  // between OldTrek requests, discard the ancestor and require safe admission
  // again; never guess which unsaved field should win.
  if (queue.length >= 8) {
    pending.delete(player);
    persisted.delete(player);
    return;
  }
  queue.push({ snapshot, fields });
  pending.set(player, queue);
}
function materialize(player) {
  const queue = pending.get(player);
  if (!queue) return;
  pending.delete(player);
  for (const entry of queue) remember(player, entry.snapshot, entry.fields);
}
const ignored = new Set(['_id', '__v', 'createdAt', 'updatedAt']);
const identity = new Set(['userId', 'accountId', 'playerId', 'roleId', 'serverId']);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    if (typeof value.toJSON === 'function') return stable(value.toJSON());
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  }
  return value;
}
function fingerprint(value) {
  return crypto.createHash('sha256').update(value === undefined ? '<missing>' : JSON.stringify(stable(value))).digest('hex');
}
function flatten(player) {
  const out = {};
  for (const [key,value] of Object.entries(player || {})) {
    if (ignored.has(key)) continue;
    if (key === 'other_attr_info' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [nested,v] of Object.entries(value)) out['other_attr_info.' + nested] = v;
    } else out[key] = value;
  }
  return out;
}
function remember(player, written = player, fields = null) {
  if (!player || typeof player !== 'object') return player;
  const previous = fields ? { ...(persisted.get(player) || {}) } : {};
  const values = flatten(written);
  for (const key of Object.keys(values)) {
    if (!fields || fields.some(field => key === field || key.startsWith(field + '.'))) previous[key] = fingerprint(values[key]);
  }
  persisted.set(player, previous);
  return player;
}
function inherit(target, source) {
  materialize(source);
  if (persisted.has(source)) persisted.set(target, { ...persisted.get(source) });
}
function transfer(target, source) {
  if (!tracked(source) || !target) return;
  if (persisted.has(source)) persisted.set(target, { ...persisted.get(source) });
  if (pending.has(source)) pending.set(target, [...pending.get(source)]);
}
function assignPath(out, key, value) {
  const parts = key.split('.');
  if (parts.length === 2) {
    out[parts[0]] = out[parts[0]] || {};
    if (value === undefined) delete out[parts[0]][parts[1]];
    else out[parts[0]][parts[1]] = clone(value);
  } else if (value === undefined) delete out[key];
  else out[key] = clone(value);
}
function rebase(local, remote) {
  if (!remote || local.userId !== remote.userId) return { conflicts: ['identity'] };
  materialize(local);
  materialize(remote);
  const base = persisted.get(local), a = flatten(local), b = flatten(remote);
  const out = clone(remote), conflicts = [];
  for (const key of new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(base || {})])) {
    const left = fingerprint(a[key]), right = fingerprint(b[key]), ancestor = base && (base[key] || fingerprint(undefined));
    if (left === right || (base && left === ancestor)) continue;
    if (base && right === ancestor && !identity.has(key)) assignPath(out, key, a[key]);
    else conflicts.push(key);
  }
  if (conflicts.length) return { conflicts };
  inherit(out, remote);
  return { player: out, conflicts: [] };
}
function patch(before, after) {
  const a = flatten(before), b = flatten(after), set = {}, unset = {}, guards = new Set(['other_attr_info.oldTrekInfo', 'items', 'currencies']);
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (fingerprint(a[key]) === fingerprint(b[key])) continue;
    if (!/^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)?$/.test(key) || identity.has(key)) throw Error('OLD_TREK_PATCH_FIELD_INVALID');
    if (key === 'level' && Number(b[key]) < Number(a[key])) throw Error('OLD_TREK_LEVEL_DOWNGRADE');
    guards.add(key);
    if (own(b,key)) set[key] = clone(b[key]); else unset[key] = '';
  }
  const conditions = [...guards].map(key => ({ [key]: own(a,key) ? { $eq: clone(a[key]) } : { $exists: false } }));
  return { set, unset, conditions };
}
module.exports = { remember, rememberConfirmed, tracked, transfer, inherit, rebase, patch };
