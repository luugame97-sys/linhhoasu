'use strict';

// Small, reusable CAS helper for the two score-based PvP ladders.  The
// attacker receipt is durable, but the defender lives in another document (or
// another server database), so the defender mutation needs its own idempotency
// marker.  The compare-and-set loop also makes concurrent fights on one
// defender serialize without ever applying a stale absolute score.

const DEFAULT_RECEIPT_LIMIT = 512;

function asPlain(value) {
  if (!value) return null;
  if (value.value && typeof value.value === 'object' && value.playerId === undefined
    && value.score === undefined && value.arenaScore === undefined) return value.value;
  if (typeof value.toObject === 'function') return value.toObject();
  return value;
}

async function findOne(Model, filter) {
  const query = Model.findOne(filter);
  if (query && typeof query.lean === 'function') {
    return asPlain(await query.lean().exec());
  }
  return asPlain(await query);
}

async function findOneAndUpdate(Model, filter, update, options = {}) {
  const query = Model.findOneAndUpdate(filter, update, {
    new: true,
    returnDocument: 'after',
    returnOriginal: false,
    ...options,
  });
  if (query && typeof query.lean === 'function') {
    return asPlain(await query.lean().exec());
  }
  return asPlain(await query);
}

function markerDetails(value, marker) {
  if (Array.isArray(value)) {
    const row = value.find((item) => (item && typeof item === 'object' && String(item.id) === marker)
      || String(item) === marker);
    return row && typeof row === 'object' ? row : (row ? { id: marker } : null);
  }
  if (value && typeof value === 'object' && value[marker] !== undefined) {
    return value[marker] && typeof value[marker] === 'object' ? value[marker] : { id: marker };
  }
  return null;
}

function markerPresent(value, marker) {
  return !!markerDetails(value, marker);
}

function mergeOperator(target, operator, value) {
  if (!value || typeof value !== 'object') return;
  target[operator] = { ...(target[operator] || {}), ...value };
}

function safeScore(value, fallback) {
  const n = Number(value);
  return Number.isSafeInteger(n) ? Math.max(0, n) : fallback;
}

/**
 * Apply one defender score delta with a durable receipt marker.
 *
 * `query` must identify one real player/entry. `field` is the authoritative
 * score field (`arenaScore` or `score`). The function returns `duplicate` on a
 * retry of the same receipt and never applies that receipt twice.
 */
async function applyAtomicScoreMutation(options = {}) {
  const Model = options.Model;
  const query = options.query;
  const field = String(options.field || '').trim();
  const markerField = String(options.markerField || 'scoreReceipts').trim();
  const receiptId = String(options.receiptId || '').trim();
  const delta = Number(options.delta);
  const defaultScore = safeScore(options.defaultScore, 1000);
  const limit = Math.max(32, Math.min(2048, Number(options.receiptLimit) || DEFAULT_RECEIPT_LIMIT));
  const attempts = Math.max(2, Math.min(8, Number(options.attempts) || 5));
  if (!Model || typeof Model.findOne !== 'function' || typeof Model.findOneAndUpdate !== 'function') {
    throw Object.assign(new Error('SCORE_MODEL_UNAVAILABLE'), { code: 'SCORE_MODEL_UNAVAILABLE' });
  }
  if (!query || typeof query !== 'object' || !field || !markerField || !receiptId
    || !Number.isSafeInteger(delta) || delta === 0) {
    throw Object.assign(new Error('SCORE_MUTATION_INVALID'), { code: 'SCORE_MUTATION_INVALID' });
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await findOne(Model, query);
    if (!current) throw Object.assign(new Error('SCORE_TARGET_NOT_FOUND'), { code: 'SCORE_TARGET_NOT_FOUND' });
    const markers = current[markerField];
    const committedMarker = markerDetails(markers, receiptId);
    if (committedMarker) {
      const scoreAfter = safeScore(current[field], defaultScore);
      const scoreBefore = safeScore(committedMarker.before, scoreAfter);
      const scoreChange = Number.isSafeInteger(Number(committedMarker.delta))
        ? Number(committedMarker.delta) : scoreAfter - scoreBefore;
      return { status: 'duplicate', scoreBefore, scoreAfter, scoreChange, receiptId, document: current };
    }

    const raw = Number(current[field]);
    const exists = Number.isSafeInteger(raw);
    const scoreBefore = exists ? Math.max(0, raw) : defaultScore;
    const scoreAfter = Math.max(0, scoreBefore + delta);
    const cas = { $and: [query, { [markerField]: { $ne: receiptId } },
      { [markerField]: { $not: { $elemMatch: { id: receiptId } } } }] };
    if (exists) cas[field] = scoreBefore;
    else cas[field] = { $exists: false };

    const update = {
      $set: { [field]: scoreAfter },
      $push: { [markerField]: { $each: [{ id: receiptId, before: scoreBefore, after: scoreAfter,
        delta: scoreAfter - scoreBefore }], $slice: -limit } },
    };
    const extra = options.extraUpdate || {};
    mergeOperator(update, '$set', extra.$set);
    mergeOperator(update, '$inc', extra.$inc);
    mergeOperator(update, '$unset', extra.$unset);
    const updated = await findOneAndUpdate(Model, cas, update, options.updateOptions || {});
    if (updated) {
      return { status: 'applied', scoreBefore, scoreAfter, scoreChange: scoreAfter - scoreBefore,
        receiptId, document: updated };
    }

    // Another fight changed the score between the read and CAS.  A retry of
    // this same receipt is already committed if its marker is now present;
    // otherwise loop and calculate the delta from the new authoritative score.
    const afterRace = await findOne(Model, query);
    if (afterRace && markerPresent(afterRace[markerField], receiptId)) {
      const raceMarker = markerDetails(afterRace[markerField], receiptId);
      const score = safeScore(afterRace[field], defaultScore);
      const before = safeScore(raceMarker?.before, score);
      const change = Number.isSafeInteger(Number(raceMarker?.delta)) ? Number(raceMarker.delta) : score - before;
      return { status: 'duplicate', scoreBefore: before, scoreAfter: score,
        scoreChange: change, receiptId, document: afterRace };
    }
  }
  throw Object.assign(new Error('SCORE_MUTATION_CONFLICT'), { code: 'SCORE_MUTATION_CONFLICT', retryable: true });
}

module.exports = { applyAtomicScoreMutation, markerPresent, safeScore };
