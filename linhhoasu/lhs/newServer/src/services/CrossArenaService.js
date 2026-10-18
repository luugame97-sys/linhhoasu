'use strict';
const crypto = require('crypto');
const config = require('./ConfigService');
const cross = require('./CrossServerEventService');
const readModel = require('./ArenaReadModelService');
const mutation = require('./PlayerMutationService');
const gameDay = require('./GameDayService');
const scoreMutation = require('./CompetitionScoreService');
const clone = value => JSON.parse(JSON.stringify(value));
const int = (v, d = 0) => Number.isFinite(Number(v)) ? Math.floor(Number(v)) : d;
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const fail = (code, retryable = false) => Object.assign(new Error(code), { code, retryable });
const MAX_LEDGER = 32;
const SNAPSHOT_MS = 90000;
const messages = {
  CROSS_ARENA_CLOSED: 'Đỉnh Phong Diễn Võ chưa đến kỳ mở. Không trừ vé.',
  CROSS_ARENA_SERVER_NOT_IN_POOL: 'Máy chủ chưa nằm trong nhóm Đỉnh Phong Diễn Võ kỳ này.',
  CROSS_ARENA_LOCKED: 'Chưa đủ điều kiện mở Đỉnh Phong Diễn Võ.',
  CROSS_ARENA_TICKET_NOT_ENOUGH: 'Không đủ vé Đỉnh Phong Diễn Võ.',
  CROSS_ARENA_REFRESH_COST_NOT_ENOUGH: 'Không đủ kim cương để làm mới.',
  CROSS_ARENA_REFRESH_NO_CHANGE: 'Chưa có đối thủ mới. Không thu phí làm mới.',
  CROSS_ARENA_REFRESH_COOLDOWN: 'Hãy chờ hết thời gian làm mới.',
  CROSS_ARENA_TARGET_PROTECTED: 'Đối thủ đang được bảo hộ. Hãy chọn đối thủ khác.',
  CROSS_ARENA_SNAPSHOT_STALE: 'Danh sách đối thủ đã thay đổi. Hãy tải lại danh sách.',
  CROSS_ARENA_REQUEST_REQUIRED: 'Vui lòng tải lại game để cập nhật Đỉnh Phong Diễn Võ.',
  CROSS_ARENA_COMMIT_UNKNOWN: 'Đang đối soát kết quả. Hãy đăng nhập lại, không gửi trận mới.',
};

function createService(deps = {}) {
  const Entry = deps.Entry || require('../db/models/CrossEventEntry');
  const Action = deps.Action || require('../db/models/CrossArenaAction');
  const players = deps.players || require('./PlayerService');
  const clock = deps.clock || Date.now;
  const battle = deps.battle || require('./BattleService');
  const getServer = deps.getServer || require('./ServerConfigService').findServerConfig;
  const runtime = deps.runtime || require('./RuntimeBus');
  const logger = deps.logger || require('../logger');
  const helpers = () => require('../handlers/arena').competitionHelpers;
  const getSid = (s, p) => int((s || {}).serverId || (p || {}).serverId || process.env.SERVER_ID, 1001);
  const base = () => config.get('CrossArenaBaseConfig') || {};
  const entryId = (cycleKey, serverId, playerId) => sha(`crossArena:${cycleKey}:${serverId}:${playerId}`).slice(0, 32);
  const filter = cycle => ({ event: 'crossArena', cycleKey: cycle.key, serverId: { $in: cross.getServerIds() } });

  async function settlementServerIds() {
    const configured = new Set((Array.isArray(cross.schedule.serverIds) ? cross.schedule.serverIds : []).map(Number));
    try {
      const rows = await require('./ServerConfigService').listAllServers();
      rows.forEach((row) => {
        if (Number(row.pageId) === 1 && cross.isServerAllowed(row.serverId)) configured.add(Number(row.serverId));
      });
    } catch (_) {
      // Keep the immutable configured pool when the identity DB is unavailable;
      // settlement will fail closed on a missing server DB rather than inventing
      // a roster.
    }
    return [...configured].filter(Number.isFinite).sort((a, b) => a - b);
  }

  async function gate(s, p) {
    const sid = getSid(s, p), now = clock(), cycle = cross.cycleFor('crossArena', now);
    if (!cross.isServerAllowed(sid)) throw fail('CROSS_ARENA_SERVER_NOT_IN_POOL');
    if (!cycle || cycle.event !== 'crossArena') throw fail('CROSS_ARENA_CLOSED');
    const server = await getServer(sid);
    if (!server || !server.openTime || server.openTime > now || server.running === false) throw fail('CROSS_ARENA_LOCKED');
    const openDay = Math.floor((now + 7 * 3600000) / 86400000) - Math.floor((server.openTime + 7 * 3600000) / 86400000) + 1;
    for (const condition of config.get('SystemConfig')?.[317]?.conditions || []) {
      const progress = condition.type === 3 ? int(p.level, 1) : condition.type === 5 ? openDay : -1;
      if (condition.cond !== 4 || progress < condition.value) throw fail('CROSS_ARENA_LOCKED');
    }
    return { sid, now, cycle };
  }

  function state(p, cycle, now) {
    const old = p.crossArenaInfo || {};
    if (old.version !== 2 || old.cycleKey !== cycle.key) {
      const seasons = { ...(old.seasons || {}) };
      if (old.version === 2 && old.cycleKey) seasons[old.cycleKey] = {
        score: old.score, revision: old.revision, updatedAt: old.updatedAt,
        publicRow: old.publicRow, cycle: old.cycle, joinedAt: old.joinedAt,
      };
      // Never import unaudited legacy scores into a newly started season.
      p.crossArenaInfo = { version: 2, cycleKey: cycle.key, cycle: clone(cycle), seasons,
        score: int(base().arenaScoreDefault, 1000), joinedAt: now, dailyCount: 0, dayKey: gameDay.key(now),
        refreshtime: 0, revision: 0, ticketRecoveredAt: int(old.ticketRecoveredAt),
        ledger: old.ledger || [], outbox: old.outbox || [], revengeUsed: [], loglist: [] };
    }
    const info = p.crossArenaInfo;
    if (info.dayKey !== gameDay.key(now)) { info.dayKey = gameDay.key(now); info.dailyCount = 0; }
    info.ledger ||= []; info.outbox ||= []; info.revengeUsed ||= []; info.loglist ||= [];
    return info;
  }

  function recoverTickets(p, info, now) {
    const rule = config.get('AssetsRefreshConfig')?.[110];
    if (!rule || rule.time <= 0 || rule.count <= 0 || rule.countMax <= 0) throw fail('CROSS_ARENA_TICKET_CONFIG');
    p.items ||= {};
    const have = Math.max(0, int(p.items[110])), interval = rule.time * 1000;
    if (have >= rule.countMax) { info.ticketRecoveredAt = 0; return; }
    const start = int(info.ticketRecoveredAt);
    if (!start || start > now) { info.ticketRecoveredAt = now; return; }
    const ticks = Math.floor((now - start) / interval);
    if (ticks > 0) {
      p.items[110] = Math.min(rule.countMax, have + ticks * rule.count);
      info.ticketRecoveredAt = p.items[110] >= rule.countMax ? 0 : start + ticks * interval;
    }
  }

  function request(p, sid, kind, params) {
    const id = String(params?.requestId || '');
    if (!/^[A-Za-z0-9:_-]{12,160}$/.test(id)) throw fail('CROSS_ARENA_REQUEST_REQUIRED');
    const fingerprint = sha(JSON.stringify([kind, int(params?.type), String(params?.enemyid || ''),
      String(params?.challengeVersion || ''), String(params?.cycleKey || '')]));
    return { id: sha(`${sid}:${p.playerId}:${id}`), fingerprint };
  }

  async function save(s, draft) {
    try {
      if (!await players.savePlayer(s.userId, draft, { returnSaved: false })) throw Error('SAVE_NOT_CONFIRMED');
    } catch (err) {
      // A Mongo timeout may have committed. Invalidate every live copy instead
      // of saving an old rollback snapshot over an ambiguous economic commit.
      runtime.getWsServer()?.invalidatePlayerForMutation?.(s.userId);
      s.player = null;
      throw fail('CROSS_ARENA_COMMIT_UNKNOWN', true);
    }
    const canonical = runtime.getWsServer()?.getPlayerForMutation?.(s.userId) || s.player;
    if (canonical) { Object.keys(canonical).forEach(k => delete canonical[k]); Object.assign(canonical, draft); s.player = canonical; }
    else s.player = draft;
    return s.player;
  }

  function view(p, info, sid) {
    const v = readModel.buildPlayerView({ ...p, arenaScore: info.score }, sid);
    return { publicRow: v.publicRow, attrs: v.attrs, parts: v.playerSnapshot.parts, partValues: v.playerSnapshot.partValues };
  }

  // The shared entry is a score/membership record, not a live power cache.
  // Resolve display fields from the current player document.  Completed
  // fight receipts remain immutable for retries and battle replay.
  async function loadCurrentPlayer(serverId, playerId, userId) {
    const sid = Number(serverId);
    if (!cross.isServerAllowed(sid) || !playerId) return null;
    const local = userId ? runtime.getWsServer()?.getPlayerForMutation?.(userId) : null;
    if (local && String(local.playerId) === String(playerId) && Number(local.serverId || process.env.SERVER_ID) === sid) return local;
    if (deps.loadProfile) {
      const loaded = await deps.loadProfile(sid, playerId, userId);
      if (loaded) return loaded;
    }
    const prefix = process.env.CROSS_GAME_DB_PREFIX || 'lhs_s';
    if (!/^[A-Za-z0-9_]+$/.test(prefix)) throw fail('CROSS_ARENA_DB_PREFIX_INVALID');
    const identity = { playerId };
    if (userId) identity.userId = userId;
    return require('mongoose').connection.useDb(`${prefix}${sid}`, { useCache: true }).collection('players')
      .findOne(identity, { projection: readModel.PLAYER_PROJECTION, maxTimeMS: 1500 });
  }

  async function currentPublicRow(entry) {
    const row = entry?.payload?.publicRow || entry;
    const sid = Number(entry.serverId || row?.serverId);
    const playerId = entry.playerId || row?.playerId;
    const userId = entry.userId || row?.userId;
    const current = await loadCurrentPlayer(sid, playerId, userId);
    if (!current) throw fail('CROSS_ARENA_PROFILE_UNAVAILABLE', true);
    return readModel.buildPlayerView(current, sid).publicRow;
  }

  async function crossPlayerCollection(serverId) {
    const prefix = process.env.CROSS_GAME_DB_PREFIX || 'lhs_s';
    if (!/^[A-Za-z0-9_]+$/.test(prefix)) throw fail('CROSS_ARENA_DB_PREFIX_INVALID');
    return require('mongoose').connection.useDb(`${prefix}${Number(serverId)}`, { useCache: true }).collection('players');
  }

  // The shared CrossEventEntry is the cross-server score authority.  The
  // target server's player document is then refreshed to the same value so a
  // later login/action cannot resurrect the old score.
  async function applyCrossTargetScore(record) {
    const targetPlayerId = String(record && record.targetPlayerId || '').trim();
    const targetServerId = int(record && record.targetServerId, 0);
    const attackerDelta = int(record && record.log && record.log.scorechange, 0);
    if (!targetPlayerId || !targetServerId || !attackerDelta) return { status: 'skipped', scoreChange: 0 };
    if (typeof deps.applyDefenderScore === 'function') return deps.applyDefenderScore(record);

    const targetEntryId = String(record.targetEntryId || entryId(record.cycleKey, targetServerId, targetPlayerId));
    const mutationResult = await scoreMutation.applyAtomicScoreMutation({
      Model: Entry,
      query: { _id: targetEntryId, event: 'crossArena', cycleKey: record.cycleKey,
        serverId: targetServerId, playerId: targetPlayerId },
      field: 'score',
      markerField: 'scoreReceipts',
      receiptId: String(record._id),
      delta: -attackerDelta,
      defaultScore: int(base().arenaScoreDefault, 1000),
      extraUpdate: { $inc: { revision: 1 }, $set: { updatedAt: clock() } },
    });
    const latestEntry = mutationResult.document || await Entry.findById(targetEntryId).lean().exec();
    const latestScore = Math.max(0, int(latestEntry && latestEntry.score, mutationResult.scoreAfter));
    const latestRevision = Math.max(0, int(latestEntry && latestEntry.revision, 0));
    const collection = await crossPlayerCollection(targetServerId);
    const playerFilter = { playerId: targetPlayerId, 'crossArenaInfo.cycleKey': record.cycleKey,
      $or: [{ 'crossArenaInfo.revision': { $lte: latestRevision } },
        { 'crossArenaInfo.revision': { $exists: false } }] };
    if (record.targetUserId) playerFilter.userId = String(record.targetUserId);
    try {
      const synced = await collection.updateOne(playerFilter, {
        $set: { 'crossArenaInfo.score': latestScore, 'crossArenaInfo.revision': latestRevision },
      }, { maxTimeMS: 5000 });
      const matched = Number(synced && (synced.matchedCount ?? synced.n)) || 0;
      if (matched <= 0) {
        const current = await collection.findOne({ playerId: targetPlayerId }, {
          projection: { 'crossArenaInfo.cycleKey': 1, 'crossArenaInfo.revision': 1 }, maxTimeMS: 5000,
        });
        // A retry from an older season or an older shared revision must not
        // overwrite the target's newer cycle/score. The shared row remains
        // authoritative and the target refreshes from it on its next request.
        if (!current || (current.crossArenaInfo?.cycleKey === record.cycleKey
          && int(current.crossArenaInfo?.revision) <= latestRevision)) {
          throw fail('CROSS_ARENA_TARGET_SCORE_PLAYER_NOT_FOUND', true);
        }
      }
    } catch (err) {
      Object.assign(err, { scoreMutation: mutationResult, targetPlayerId, targetServerId });
      throw err;
    }
    let rankPending = false;
    try { await require('./RankService').updateScore('crossArena', targetPlayerId, latestScore); }
    catch (err) { rankPending = true; logger.warn(`[CrossArena] defender rank update deferred player=${targetPlayerId}: ${err.message}`); }
    return { ...mutationResult, targetPlayerId, targetServerId, scoreAfter: latestScore,
      scoreChange: mutationResult.scoreChange, rankPending };
  }

  async function syncAuthoritativeScore(p, info) {
    if (!p || !info || !p.playerId) return false;
    const sid = getSid(null, p);
    const row = await Entry.findOne({ event: 'crossArena', cycleKey: info.cycleKey,
      serverId: sid, playerId: String(p.playerId) }).select({ score: 1, revision: 1 }).lean().exec();
    if (!row) return false;
    const score = Math.max(0, int(row.score, info.score));
    const revision = Math.max(0, int(row.revision, info.revision));
    if (score === int(info.score, 0) && revision === int(info.revision, 0)) return false;
    info.score = score;
    info.revision = revision;
    info.updatedAt = clock();
    return true;
  }

  // A challenge list is only a read snapshot.  Re-resolve a real opponent at
  // the moment of the paid fight so the attributes used by the simulator and
  // the power shown to the attacker come from the same authoritative player
  // state.  Robots intentionally keep their configured snapshot.
  async function refreshFightTarget(target) {
    if (!target || target.isRobot) return target;
    const row = target.entryId
      ? await Entry.findById(target.entryId).select({ playerId: 1, userId: 1, serverId: 1, score: 1, payload: 1 })
        .maxTimeMS(1500).lean().exec()
      : null;
    const source = row || target;
    const sid = Number(source.serverId || target.serverId);
    const current = await loadCurrentPlayer(sid, source.playerId || target.playerId, source.userId || target.userId);
    if (!current) throw fail('CROSS_ARENA_TARGET_UNAVAILABLE', true);
    const resolved = readModel.buildPlayerView(current, sid);
    return { ...target, ...resolved.publicRow,
      userId: source.userId || target.userId || '',
      score: source.score ?? target.score ?? resolved.publicRow.score,
      point: source.score ?? target.point ?? resolved.publicRow.point,
      robotAttrs: clone(resolved.attrs), parts: resolved.playerSnapshot.parts,
      partValues: resolved.playerSnapshot.partValues, entryId: source._id || target.entryId, isRobot: false };
  }

  async function publish(p, info, sid) {
    const payload = view(p, info, sid);
    const id = entryId(info.cycleKey, sid, p.playerId);
    const update = { event: 'crossArena', cycleKey: info.cycleKey, serverId: sid, playerId: p.playerId, userId: p.userId,
      name: p.name, level: p.level, payload, updatedAt: info.updatedAt };
    try {
      // Publishing appearance must never replace a score changed by another
      // server. Only insert initializes the score; fights use receipt CAS for
      // BOTH participants below.
      await Entry.updateOne({ _id: id },
        { $set: update, $setOnInsert: { score: info.score, revision: info.revision } },
        { upsert: true, maxTimeMS: 5000 }).exec();
    } catch (err) {
      if (err.code !== 11000) throw err;
      const existing = await Entry.findById(id).maxTimeMS(5000).lean().exec();
      if (!existing || existing.playerId !== p.playerId) throw err;
    }
    info.publicRow = payload.publicRow;
  }

  async function flush(s) {
    const p = s.player, info = p?.crossArenaInfo;
    if (!info || info.version !== 2) return;
    for (const record of info.outbox || []) {
      const completed = await Action.findById(record._id).maxTimeMS(5000).lean().exec();
      if (completed) {
        if (completed.playerId !== record.playerId || completed.fingerprint !== record.fingerprint) {
          throw fail('CROSS_ARENA_RECEIPT_COLLISION', true);
        }
        if (record.scoreCommitVersion === 2) continue;
      }
      if (record.kind === 'fight' && record.scoreCommitVersion === 2 && record.log?.scorechange) {
        const own = await scoreMutation.applyAtomicScoreMutation({
          Model: Entry, query: { _id: entryId(record.cycleKey, record.serverId, record.playerId),
            event: 'crossArena', cycleKey: record.cycleKey, serverId: record.serverId, playerId: record.playerId },
          field: 'score', markerField: 'scoreReceipts', receiptId: `attacker:${record._id}`,
          delta: int(record.log.scorechange),
          defaultScore: int(base().arenaScoreDefault, 1000),
          extraUpdate: { $inc: { revision: 1 }, $set: { updatedAt: clock() } },
        });
        record.log.attackerScore = own.scoreBefore;
        record.log.attackerScoreAfter = own.scoreAfter;
        record.log.scorechange = own.scoreChange;
        record.log.attackerScoreCommitted = true;
        record.response.score = own.scoreAfter;
        record.response.scorechange = own.scoreChange;
      } else if (record.kind === 'fight' && record.scoreCommitVersion !== 2) {
        // Old outboxes predate attacker CAS. Reconcile only an unambiguous
        // legacy revision; never guess over a newer incoming score.
        const id = entryId(record.cycleKey, record.serverId, record.playerId);
        const row = await Entry.findById(id).maxTimeMS(5000).lean().exec();
        if (row && int(row.score) !== int(info.score)) {
          if (int(row.revision) >= int(info.revision)) throw fail('CROSS_ARENA_LEGACY_SCORE_PENDING', true);
          const synced = await Entry.updateOne({ _id: id, revision: row.revision, score: row.score },
            { $set: { score: info.score, revision: info.revision } }, { maxTimeMS: 5000 }).exec();
          if (!synced.matchedCount) throw fail('CROSS_ARENA_LEGACY_SCORE_PENDING', true);
        }
      }
      if (record.kind === 'fight' && record.targetPlayerId && record.targetServerId
        && record.log && record.log.scorechange) {
        try {
          const targetResult = await applyCrossTargetScore(record);
          record.log.zeroSumVersion = 1;
          record.log.targetScoreBefore = targetResult.scoreBefore;
          record.log.targetScoreAfter = targetResult.scoreAfter;
          record.log.targetScoreChange = targetResult.scoreChange;
          record.response.targetScorechange = targetResult.scoreChange;
          if (Number.isFinite(targetResult.scoreBefore)) record.response.enemyscore = targetResult.scoreBefore;
          record.response.targetScorePending = false;
        } catch (err) {
          // If the shared CAS committed but the target server write failed,
          // retain the authoritative target delta in the outbox.  A cutoff
          // settlement must not add that delta twice while sync is retried.
          const committed = err && err.scoreMutation;
          if (committed && Number.isSafeInteger(Number(committed.scoreChange))) {
            record.log.zeroSumVersion = 1;
            record.log.targetScoreBefore = committed.scoreBefore;
            record.log.targetScoreAfter = committed.scoreAfter;
            record.log.targetScoreChange = committed.scoreChange;
            record.response.targetScorechange = committed.scoreChange;
            record.response.targetScorePending = true;
          }
          throw err;
        }
      }
      try { await Action.create(record); }
      catch (err) {
        if (err.code !== 11000) throw err;
        const found = await Action.findById(record._id).maxTimeMS(5000).lean().exec();
        if (!found || found.playerId !== record.playerId || found.fingerprint !== record.fingerprint) throw fail('CROSS_ARENA_RECEIPT_COLLISION', true);
      }
      if (record.log?.revengeOf) {
        await Action.updateOne({ _id: record.log.revengeOf, playerId: record.playerId },
          { $set: { revengeReceipt: record._id } }, { maxTimeMS: 5000 }).exec();
      }
    }
    const scoreSynced = await syncAuthoritativeScore(p, info);
    await publish(p, info, getSid(s, p));
    if (info.outbox.length || scoreSynced) {
      const draft = clone(p); draft.crossArenaInfo.outbox = [];
      await save(s, draft);
    }
  }

  async function rankData(p, info) {
    const cycle = info.cycle, f = filter(cycle);
    const [rows, higher, count] = await Promise.all([
      Entry.find(f).select({ playerId: 1, userId: 1, serverId: 1, score: 1, payload: 1 }).sort({ score: -1, playerId: 1 }).limit(20).maxTimeMS(5000).lean().exec(),
      Entry.countDocuments({ ...f, $or: [{ score: { $gt: info.score } }, { score: info.score, playerId: { $lt: p.playerId } }] }).maxTimeMS(5000).exec(),
      Entry.countDocuments(f).maxTimeMS(5000).exec(),
    ]);
    const ranklist = await Promise.all(rows.map(async (r, i) => {
      if (!readModel.objectId24(r.payload?.publicRow?.dbid)) throw fail('CROSS_ARENA_ROSTER_INVALID', true);
      return { ...await currentPublicRow(r),
        score: r.score, point: r.score, rank: i + 1 };
    }));
    return { rank: higher + 1, count, ranklist, toplist: ranklist.slice(0, 3) };
  }

  async function pool(p, info) {
    const rows = await Entry.find({ ...filter(info.cycle), playerId: { $ne: p.playerId } })
      .sort({ score: -1, playerId: 1 }).limit(80).maxTimeMS(5000).lean().exec();
    const real = (await Promise.all(rows.map(async row => {
      const v = row.payload;
      if (!readModel.objectId24(v?.publicRow?.dbid) || !v?.attrs?.[1]) throw fail('CROSS_ARENA_ROSTER_INVALID', true);
      return { ...await currentPublicRow(row), userId: row.userId,
        score: row.score, point: row.score, robotAttrs: clone(v.attrs),
        parts: v.parts || {}, partValues: v.partValues || {}, entryId: row._id,
        nextChallengeTime: int(row.protectUntil), isRobot: false };
    }))).filter(row => row.nextChallengeTime <= clock());
    real.sort((a, b) => Math.abs(a.score - info.score) - Math.abs(b.score - info.score) || String(a.playerId).localeCompare(String(b.playerId)));
    const candidates = real.slice(0, 20);
    if (candidates.length < 5) candidates.push(...helpers().generateOpponents(p, { crossArena: true }));
    return candidates;
  }

  function snapshot(info, p, rows) {
    const next = { version: `${clock()}_${crypto.randomBytes(10).toString('hex')}`, cycleKey: info.cycleKey,
      expiresAt: Math.min(clock() + SNAPSHOT_MS, info.cycle.endTime), owner: p.playerId, rows: clone(rows) };
    info.challenge = next;
    return next;
  }
  function choose(candidates, previousIds = []) {
    const real = candidates.filter(row => !row.isRobot);
    const selected = readModel.chooseOpponents(real, previousIds, 5).opponents;
    if (selected.length < 5) selected.push(...readModel.chooseOpponents(candidates.filter(row => row.isRobot), previousIds, 5-selected.length).opponents);
    const old = new Set(previousIds.map(String));
    const changed = old.size !== selected.length || selected.some(row => !old.has(String(row.dbid)));
    return { opponents: selected, changed, noChange: !changed };
  }
  const publicList = info => (info.challenge?.rows || []).map(row => ({ ...row, robotAttrs: undefined, userId: undefined,
    entryId: undefined, parts: undefined, partValues: undefined, challengeVersion: info.challenge.version,
    challengeExpiresAt: info.challenge.expiresAt, cycleKey: info.cycleKey }));

  async function currentChallengeList(info) {
    return Promise.all(publicList(info).map(async row => {
      if (row.isRobot) return row;
      const stored = info.challenge.rows.find(r => String(r.dbid) === String(row.dbid));
      const entry = stored.userId ? stored : await Entry.findById(stored.entryId).maxTimeMS(1500).lean().exec();
      if (!entry) throw fail('CROSS_ARENA_PROFILE_UNAVAILABLE', true);
      const current = await currentPublicRow(entry);
      return { ...row, power: current.power, powerScore: current.powerScore, powerUnit: current.powerUnit };
    }));
  }

  async function logs(p, info) {
    const rows = await Action.find({ cycleKey: info.cycleKey, kind: 'fight',
      $or: [{ playerId: p.playerId }, { targetPlayerId: p.playerId }] })
      .select({ log: 1, playerId: 1, revengeReceipt: 1 }).sort({ committedAt: -1 }).limit(30).maxTimeMS(5000).lean().exec();
    return rows.map(r => {
      const defending = r.playerId !== p.playerId, row = r.log || {}, other = defending ? row.attacker : row.defender;
      return { ...other, uid: row.uid, fightId: String(r._id), atk: defending ? 0 : 1, type: defending ? 0 : 1,
        win: defending ? (row.win ? 0 : 1) : row.win, logtime: Math.floor(row.committedAt / 1000),
        score: defending ? (row.zeroSumVersion ? int(row.targetScoreChange, -int(row.scorechange, 0)) : 0) : row.scorechange,
        scorechange: defending ? (row.zeroSumVersion ? int(row.targetScoreChange, -int(row.scorechange, 0)) : 0) : row.scorechange,
        enemyscore: defending ? row.attackerScore : row.enemyScore,
        revenge: !defending && row.scorechange < 0 ? (r.revengeReceipt || info.revengeUsed.includes(String(r._id)) ? 1 : 0) : 3 };
    });
  }

  async function payload(p, info, includeLogs = false) {
    return { result: 0, open: true, cycleKey: info.cycleKey, endTime: info.cycle.endTime,
      score: info.score, dailyCount: info.dailyCount, maxCount: config.get('AssetsRefreshConfig')?.[110]?.countMax || 10,
      refreshtime: info.refreshtime, challengeVersion: info.challenge?.version || '', challengelist: await currentChallengeList(info),
      ...(includeLogs ? { loglist: await logs(p, info) } : {}), ...await rankData(p, info) };
  }
  function syncPackets(p, before, ids) {
    const delta = helpers().buildArenaInventoryDelta(before, p, ids);
    return [{ tag: 1202, msgUid: 0, data: { result: 0, ...delta } },
      { tag: 1220, msgUid: 0, data: { itemId: 110, time: int(p.crossArenaInfo?.ticketRecoveredAt) } }];
  }

  async function receipt(record, s, tag, msgUid) {
    const data = clone(record.response), p = s.player;
    if (data.fightResult) data.fightResult = helpers().recoverArenaFightResult({ ...record.response,
      playerAttrs: data.fightResult.atkAttr, opponentAttrs: data.fightResult.defAttr, win: data.fightResult.win }, p);
    data.recovered = true;
    // A retry can arrive after other actions. Do not roll the inventory/model
    // back to old absolute balances; preserve the original battle outcome only.
    if (p.crossArenaInfo?.cycleKey === record.cycleKey) {
      data.score = p.crossArenaInfo.score; data.challengelist = await currentChallengeList(p.crossArenaInfo);
      data.challengeVersion = p.crossArenaInfo.challenge?.version || '';
    }
    return [...syncPackets(p, p, [110, 1, 89]), { tag, msgUid, data }];
  }

  async function lookup(p, req) {
    const row = (p.crossArenaInfo?.ledger || []).find(x => x._id === req.id)
      || await Action.findById(req.id).maxTimeMS(5000).lean().exec();
    if (row && (row.playerId !== p.playerId || row.fingerprint !== req.fingerprint)) throw fail('CROSS_ARENA_REQUEST_CONFLICT');
    return row;
  }

  async function queryInfo(params, s, msgUid, tag = 5000) {
    return run(s, tag, msgUid, async () => {
      const { cycle, now } = await gate(s, s.player);
      await flush(s);
      const before = clone(s.player), draft = clone(s.player), info = state(draft, cycle, now);
      await syncAuthoritativeScore(draft, info);
      recoverTickets(draft, info, now); info.updatedAt = now;
      await save(s, draft); await flush(s);
      const next = clone(s.player), nextInfo = next.crossArenaInfo;
      if (!nextInfo.challenge || !nextInfo.challenge.rows?.length || nextInfo.challenge.expiresAt <= now || nextInfo.challenge.cycleKey !== cycle.key) {
        snapshot(nextInfo, next, choose(await pool(next, nextInfo)).opponents);
        await save(s, next);
      }
      const data = await payload(s.player, s.player.crossArenaInfo, true);
      return [...syncPackets(s.player, before, [110]), { tag, msgUid, data }];
    });
  }

  async function mutate(params, s, msgUid, kind) {
    const tag = kind === 'fight' ? 2300 : 5001;
    return run(s, tag, msgUid, async () => {
      const sid = getSid(s, s.player), req = request(s.player, sid, kind, params);
      const previous = await lookup(s.player, req);
      if (previous) { await flush(s); return receipt(previous, s, tag, msgUid); }
      const { cycle, now } = await gate(s, s.player);
      await flush(s);
      const before = clone(s.player), draft = clone(s.player), info = state(draft, cycle, now);
      await syncAuthoritativeScore(draft, info);
      recoverTickets(draft, info, now);
      const snap = info.challenge;
      if (!snap || snap.owner !== draft.playerId || snap.cycleKey !== cycle.key || snap.expiresAt <= now
        || params.challengeVersion !== snap.version || params.cycleKey !== cycle.key) throw fail('CROSS_ARENA_SNAPSHOT_STALE');
      let response, log, target, revengeOf = '', protectToken = '';
      const h = helpers();
      if (kind === 'refresh') {
        if (info.refreshtime * 1000 > now) throw fail('CROSS_ARENA_REFRESH_COOLDOWN');
        const choice = choose(await pool(draft, info), snap.rows.map(r => r.dbid));
        if (choice.noChange) throw fail('CROSS_ARENA_REFRESH_NO_CHANGE');
        const cost = base().arenaRefreshCost;
        if (!h.consumeArenaItem(draft, cost.id, cost.count)) throw fail('CROSS_ARENA_REFRESH_COST_NOT_ENOUGH');
        snapshot(info, draft, choice.opponents);
        info.refreshtime = Math.ceil((now + int(base().arenaRefreshTime, 3) * 1000) / 1000);
        response = { result: 0, score: info.score, dailyCount: info.dailyCount, maxCount: config.get('AssetsRefreshConfig')?.[110]?.countMax || 10,
          refreshtime: info.refreshtime, challengeVersion: info.challenge.version, challengelist: publicList(info), cycleKey: cycle.key };
      } else {
        if (![16, 17].includes(Number(params.type))) throw fail('CROSS_ARENA_FIGHT_TYPE');
        if (Number(params.type) === 17) {
          const original = await Action.findOne({ ...filter(cycle), 'log.uid': Number(params.enemyid), playerId: draft.playerId })
            .maxTimeMS(5000).lean().exec();
          if (!original || original.log?.scorechange >= 0 || original.revengeReceipt || info.revengeUsed.includes(original._id)) throw fail('CROSS_ARENA_REVENGE_UNAVAILABLE');
          if (original.targetPlayerId) {
            const row = await Entry.findOne({ ...filter(cycle), playerId: original.targetPlayerId }).maxTimeMS(5000).lean().exec();
            if (!row?.payload?.attrs || !readModel.objectId24(row.payload.publicRow?.dbid)) throw fail('CROSS_ARENA_TARGET_UNAVAILABLE');
            target = { ...row.payload.publicRow, power: readModel.displayPower(row.payload.attrs), powerUnit: 'native-weighted-point',
              robotAttrs: row.payload.attrs, parts: row.payload.parts,
              partValues: row.payload.partValues, entryId: row._id, score: row.score, isRobot: false };
          } else target = h.generateOpponents(draft, { crossArena: true }).find(row => row.dbid === original.log?.defender?.dbid);
          revengeOf = original._id; info.revengeUsed.push(revengeOf);
        } else target = snap.rows.find(r => String(r.dbid) === String(params.enemyid));
        target = await refreshFightTarget(target);
        if (!target || !target.robotAttrs?.[1]) throw fail('CROSS_ARENA_TARGET_UNAVAILABLE');
        const cost = base().arenaCost;
        if (!h.consumeArenaItem(draft, cost.id, cost.count)) throw fail('CROSS_ARENA_TICKET_NOT_ENOUGH');
        if (!info.ticketRecoveredAt) info.ticketRecoveredAt = now;
        const attacker = readModel.buildPlayerView(draft, sid), fight = battle.simulateBattle(attacker.attrs, target.robotAttrs, {
          isPvp: true, mode: 'crossArena',
          formulaVersion: process.env.CUSTOM_PVP_FORMULA_ENABLED === '1' ? 'custom-pvp-v1' : 'legacy',
        });
        if (clock() >= cycle.endTime) throw fail('CROSS_ARENA_CLOSED');
        const intendedDelta = h.calculateArenaScoreChange(info.score, target.score ?? target.point, !!fight.win);
        const oldScore = info.score; info.score = Math.max(0, info.score + intendedDelta); info.dailyCount++;
        const scorechange = info.score - oldScore;
        const rewards = rewardsFor(info.score, !!fight.win);
        rewards.forEach(r => require('../handlers/raid').addRewardToPlayer(draft, r.id, r.count));
        const fightResult = h.buildCompetitionFightResult(draft, target, attacker.attrs, target.robotAttrs, fight, Number(params.type), sid);
        const uid = parseInt(req.id.slice(0, 12), 16);
        log = { uid, committedAt: now, win: fight.win ? 1 : 0, scorechange, attackerScore: oldScore,
          enemyScore: target.score ?? target.point, attacker: attacker.publicRow, defender: target, revengeOf,
          // This stays 0 until flush has actually committed the defender
          // CAS.  An unflushed outbox record must not make settlement reverse
          // a target score that was never applied.
          zeroSumVersion: 0,
          targetScoreChange: !target.isRobot && scorechange !== 0 ? -scorechange : 0 };
        delete log.defender.robotAttrs; delete log.defender.parts; delete log.defender.partValues;
        snapshot(info, draft, snap.rows.filter(r => r.dbid !== target.dbid));
        response = { result: 0, enemyid: revengeOf ? String(uidForParams(params)) : String(target.dbid), score: info.score,
          scorechange, enemyscore: log.enemyScore, win: fight.win ? 1 : 0, rewards, rewardInfo: { items: rewards, equips: [], heros: [] },
          targetScorechange: log.targetScoreChange, targetScorePending: !!(!target.isRobot && scorechange !== 0),
          fightId: req.id, logUid: uid, fightResult, challengelist: publicList(info), challengeVersion: info.challenge.version, cycleKey: cycle.key };
        if (!target.isRobot) {
          protectToken = req.id;
          const claim = await Entry.findOneAndUpdate({ _id: target.entryId, ...(revengeOf ? {} : { $or: [{ protectUntil: { $lte: now } }, { protectUntil: { $exists: false } }] }) },
            { $set: { protectUntil: now + int(base().arenaProtectTime, 30) * 1000, protectToken } }, { new: true, maxTimeMS: 5000 }).lean().exec();
          if (!claim) throw fail('CROSS_ARENA_TARGET_PROTECTED');
        }
      }
      info.updatedAt = now;
      const stored = clone(response);
      if (stored.fightResult) stored.fightResult = h.compactArenaFightResult(stored.fightResult);
      const record = { _id: req.id, event: 'crossArena', cycleKey: cycle.key, serverId: sid, playerId: draft.playerId, userId: s.userId,
        fingerprint: req.fingerprint, kind, committedAt: now, response: stored, log, scoreCommitVersion: 2,
        targetPlayerId: target && !target.isRobot ? target.playerId || '' : '',
        targetUserId: target && !target.isRobot ? target.userId || '' : '',
        targetServerId: target && !target.isRobot ? int(target.serverId) : 0,
        targetEntryId: target && !target.isRobot ? String(target.entryId || '') : '' };
      if (Buffer.byteLength(JSON.stringify(record)) > 128 * 1024) throw fail('CROSS_ARENA_OUTCOME_TOO_LARGE');
      info.ledger.push(record); info.ledger = info.ledger.slice(-MAX_LEDGER); info.outbox.push(record);
      if (info.outbox.length > MAX_LEDGER) throw fail('CROSS_ARENA_OUTBOX_BUSY', true);
      await save(s, draft);
      let published = false;
      try { await flush(s); published = true; }
      catch (err) { logger.warn(`[CrossArena] committed outbox pending: ${err.message}`); }
      if (published) {
        response.score = s.player.crossArenaInfo.score;
        if (record.log) response.scorechange = record.log.scorechange;
        if (record.response?.enemyscore !== undefined) response.enemyscore = record.response.enemyscore;
      }
      if (published && record.targetPlayerId) {
        response.targetScorechange = int(record.log?.targetScoreChange, response.targetScorechange);
        response.targetScorePending = false;
      } else if (record.targetPlayerId) response.targetScorePending = true;
      // ACK a committed outcome even if the shared read model needs retry.
      // Never rerun a paid fight because a post-commit rank read failed.
      try { if (!published) throw Error('PUBLISH_PENDING'); const ranks = await rankData(s.player || draft, info); Object.assign(response, ranks,
        { rankList: ranks.ranklist, topList: ranks.toplist, loglist: await logs(s.player || draft, info) }); }
      catch (_) { response.rankPending = true; if (record.targetPlayerId) response.targetScorePending = true; }
      return [...syncPackets(s.player || draft, before, [110, 1, 89]), { tag, msgUid, data: response }];
    });
  }

  async function run(s, tag, msgUid, work) {
    return mutation.run(s?.userId, async () => {
      if (!s?.player || !s.userId) return { tag, msgUid, data: { result: -1, retryable: false, code: 'CROSS_ARENA_SESSION_INVALID' } };
      const canonical = runtime.getWsServer()?.getPlayerForMutation?.(s.userId);
      if (canonical) s.player = canonical;
      try { await players.drainPendingSaves?.(s.userId); return await work(); }
      catch (err) {
        const known = typeof err.code === 'string' && err.code.startsWith('CROSS_ARENA_');
        const code = known ? err.code : 'CROSS_ARENA_UNAVAILABLE', retryable = err.retryable ?? !known;
        if (retryable) logger.warn(`[CrossArena] ${code}: ${err.message}`);
        const closed = ['CROSS_ARENA_CLOSED','CROSS_ARENA_LOCKED','CROSS_ARENA_SERVER_NOT_IN_POOL'].includes(code);
        return { tag, msgUid, data: { result: -1, code, retryable, open: closed ? false : undefined, score: int(s.player?.crossArenaInfo?.score, 1000),
          // Old native clients check enemyid.length before fightResult exists.
          // A 24-character sentinel lets them finish the rejected RPC safely.
          rank: -1, challengelist: [], ranklist: [], toplist: [], loglist: [], enemyid: '000000000000000000000000',
          message: messages[code] || (retryable ? 'Đỉnh Phong Diễn Võ đang đồng bộ. Hãy thử lại.' : 'Yêu cầu không hợp lệ. Hãy tải lại danh sách.') } };
      }
    });
  }
  function rewardsFor(score, win) {
    const b = base(), rows = win ? b.arenaReward : b.arenaFailReward;
    let section = 0;
    (b.arenaScoreSection || []).forEach((v, i) => { if (score >= v) section = i; });
    const rewards = rows?.[Math.min(section, rows.length - 1)];
    if (!Array.isArray(rewards) || rewards.some(r => !Number.isSafeInteger(r.id) || r.id <= 0 || !Number.isSafeInteger(r.count) || r.count < 0)) throw fail('CROSS_ARENA_REWARD_CONFIG');
    return clone(rewards);
  }
  function uidForParams(params) { return Number(params.enemyid); }
  async function profile(serverId, id) {
    if (!cross.isServerAllowed(serverId) || !id || String(id).length > 160) return null;
    const entry = await Entry.findOne({ event: 'crossArena', serverId: Number(serverId),
      $or: [{ playerId: String(id) }, { 'payload.publicRow.dbid': String(id) }] })
      .select({ playerId: 1, userId: 1, serverId: 1 }).sort({ updatedAt: -1 }).maxTimeMS(1500).lean().exec();
    if (!entry?.playerId) return null;
    const loaded = await loadCurrentPlayer(Number(serverId), entry.playerId, entry.userId);
    const doc = loaded ? clone(loaded) : null;
    if (doc) {
      doc.serverId = Number(serverId);
      const rawName = String(doc.serverName || '').trim();
      if (!rawName || rawName.includes('长安')) {
        doc.serverName = Number(serverId) >= 1001 ? `S${Number(serverId) - 1000}` : `S${serverId}`;
      }
    }
    return doc;
  }

  async function finalRoster(cycle, cutoffAt = cycle.endTime) {
    if (cycle?.event !== 'crossArena' || cutoffAt < cycle.startTime || cutoffAt > cycle.endTime) throw fail('CROSS_ARENA_CUTOFF_INVALID');
    const load = deps.loadSeasonPlayers || (async (sid, key) => {
      const prefix = process.env.CROSS_GAME_DB_PREFIX || 'lhs_s';
      if (!/^[A-Za-z0-9_]+$/.test(prefix)) throw fail('CROSS_ARENA_DB_PREFIX_INVALID');
      const connection = require('mongoose').connection.useDb(`${prefix}${sid}`, { useCache: true });
      const history = `crossArenaInfo.seasons.${key}`;
      return connection.collection('players').find({ isBot: { $ne: true }, managedBot: { $ne: true },
        $or: [{ 'crossArenaInfo.cycleKey': key }, { [history]: { $exists: true } }] },
      { projection: { userId: 1, playerId: 1, 'crossArenaInfo.version': 1, 'crossArenaInfo.cycleKey': 1,
        'crossArenaInfo.score': 1, 'crossArenaInfo.joinedAt': 1, 'crossArenaInfo.outbox': 1, [history]: 1 } })
        .limit(10001).maxTimeMS(5000).toArray();
    });
    const all = [];
    for (const sid of await settlementServerIds()) {
      const rows = await load(sid, cycle.key);
      if (!Array.isArray(rows) || rows.length > 10000) throw fail('CROSS_ARENA_ROSTER_TOO_LARGE');
      for (const p of rows) {
        const info = p.crossArenaInfo?.cycleKey === cycle.key ? p.crossArenaInfo : p.crossArenaInfo?.seasons?.[cycle.key];
        if (!p.playerId || !p.userId || !info || !Number.isSafeInteger(info.score) || info.score < 0 || !info.joinedAt) throw fail('CROSS_ARENA_SEASON_INVALID');
        if (info.joinedAt > cutoffAt) continue;
        all.push({ playerId: String(p.playerId), userId: String(p.userId), serverId: sid,
          score: info.score, outbox: p.crossArenaInfo.outbox || [] });
      }
    }
    if (all.length > 10000) throw fail('CROSS_ARENA_ROSTER_TOO_LARGE');
    // The shared roster row is authoritative for the active cycle.  Player
    // documents may be temporarily stale while a defender is offline.
    const sharedServerIds = deps.loadSeasonPlayers
      ? [...new Set(all.map((row) => Number(row.serverId)).filter(Number.isFinite))]
      : await settlementServerIds();
    const shared = await Entry.find({ event: 'crossArena', cycleKey: cycle.key,
      serverId: { $in: sharedServerIds } })
      .select({ playerId: 1, serverId: 1, score: 1 }).limit(10001).maxTimeMS(5000).lean().exec();
    const sharedScores = new Map((Array.isArray(shared) ? shared : []).map((row) => [`${row.serverId}:${row.playerId}`, row.score]));
    all.forEach((row) => {
      const score = sharedScores.get(`${row.serverId}:${row.playerId}`);
      if (Number.isSafeInteger(Number(score)) && Number(score) >= 0) row.score = Number(score);
    });
    // Reverse later outcomes for daily catch-up, including unpublished outbox.
    const future = await Action.find({ cycleKey: cycle.key, kind: 'fight', committedAt: { $gt: cutoffAt } })
      .select({ playerId: 1, targetPlayerId: 1, targetServerId: 1, log: 1, committedAt: 1 }).limit(100001).maxTimeMS(5000).lean().exec();
    if (future.length > 100000) throw fail('CROSS_ARENA_CUTOFF_LOG_LIMIT');
    const unique = new Map(future.map(r => [String(r._id), r]));
    for (const p of all) for (const r of p.outbox) {
      if (r.cycleKey === cycle.key && r.kind === 'fight' && r.committedAt > cutoffAt) unique.set(String(r._id), r);
    }
    const reverse = new Map();
    for (const row of unique.values()) {
      const attackerId = String(row.playerId || '');
      const attackerDelta = int(row.log?.scorechange, 0);
      if (attackerId) reverse.set(attackerId, (reverse.get(attackerId) || 0) + attackerDelta);
      if (row.log?.zeroSumVersion && row.targetPlayerId) {
        const targetDelta = int(row.log.targetScoreChange, -attackerDelta);
        const targetId = String(row.targetPlayerId);
        reverse.set(targetId, (reverse.get(targetId) || 0) + targetDelta);
      }
    }
    const seen = new Set();
    const roster = all.map(({ outbox, ...r }) => {
      if (seen.has(r.playerId)) throw fail('CROSS_ARENA_DUPLICATE_IDENTITY'); seen.add(r.playerId);
      return { ...r, score: Math.max(0, r.score - (reverse.get(r.playerId) || 0)) };
    }).sort((a,b) => b.score-a.score || Buffer.compare(Buffer.from(a.playerId), Buffer.from(b.playerId)));
    return roster.map((row,i) => ({ ...row, rank: i+1 }));
  }
  return { info: (p,s,u) => queryInfo(p,s,u,5000), list: (p,s,u) => queryInfo(p,s,u,5002),
    refresh: (p,s,u) => mutate(p,s,u,'refresh'), fight: (p,s,u) => mutate(p,s,u,'fight'),
    flush, gate, state, recoverTickets, rewardsFor, rankData, publish, finalRoster, profile };
}
let singleton;
const current = () => singleton ||= createService();
module.exports = { createService, info: (...a) => current().info(...a), list: (...a) => current().list(...a),
  refresh: (...a) => current().refresh(...a), fight: (...a) => current().fight(...a), finalRoster: (...a) => current().finalRoster(...a),
  profile: (...a) => current().profile(...a) };
