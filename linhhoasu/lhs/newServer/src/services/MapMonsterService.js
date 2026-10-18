/**
 * MapMonsterService
 *
 * Keeps the normal-map monster slots authoritative on the game server.
 *
 * Normal-map creeps are authored in the client map data (`animBorns`).  The
 * native client uses the array index as the monster handle when it sends the
 * open-box/auto-delegate RPC (tag 2000).  Loading the same data on the server
 * lets us validate that handle and serialize claims so a human player and a
 * managed bot cannot receive the same monster reward at the same time.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const configService = require('./ConfigService');
const logger = require('../logger');

function toSafeInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function readPositiveInt(value, fallback, min = 1) {
  const number = toSafeInt(value, fallback);
  return number >= min ? number : fallback;
}

function clonePlain(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_err) {
    return value && typeof value === 'object' ? { ...value } : value;
  }
}

function lookup(table, id) {
  if (!table || typeof table !== 'object') return null;
  return table[id] || table[String(id)] || null;
}

function normalizePoint(point) {
  if (!point || typeof point !== 'object' || Array.isArray(point)) return null;
  const x = toSafeInt(point.x, 0);
  const y = toSafeInt(point.y, 0);
  if (x <= 0 || y <= 0) return null;
  return { x, y };
}

function normalizeMonsterSlots(animBorns, options = {}) {
  if (!Array.isArray(animBorns)) return [];
  const originalLength = animBorns.length;
  const maxX = Math.max(1, toSafeInt(options.width, 1000000) - 1);
  const maxY = Math.max(1, toSafeInt(options.height, 1000000) - 1);
  const offsets = [[64, 0], [-64, 0], [0, 64], [0, -64]];
  const originals = animBorns
    .map((row, index) => {
      const point = normalizePoint(row);
      if (!point) return null;
      const id = Math.max(0, toSafeInt(row.id, 0));
      if (id <= 0) return null;
      return {
        index,
        id,
        x: point.x,
        y: point.y,
      };
    })
    .filter(Boolean);
  const clones = originals.map((slot) => {
    const offset = offsets[slot.index % offsets.length];
    return {
      index: originalLength + slot.index,
      id: slot.id,
      x: Math.min(maxX, Math.max(1, slot.x + offset[0])),
      y: Math.min(maxY, Math.max(1, slot.y + offset[1])),
    };
  });
  return [...originals, ...clones];
}

function defaultResourceRoots() {
  const roots = [
    process.env.MAP_RESOURCE_ROOT,
    // Production layout: /linhhoasu/lhs/update/resource/assets/map
    path.join(__dirname, '..', '..', '..', 'update', 'resource', 'assets', 'map'),
    // Local checkout layout: .../linhhoasu/webgame/game/update/resource/assets/map
    path.join(__dirname, '..', '..', '..', '..', 'webgame', 'game', 'update', 'resource', 'assets', 'map'),
  ];
  return Array.from(new Set(roots.filter(Boolean).map((value) => path.resolve(String(value)))));
}

function decodeMapFile(filePath) {
  const raw = fs.readFileSync(filePath);
  const candidates = [raw];
  try {
    candidates.unshift(zlib.inflateSync(raw));
  } catch (_err) {
    // Some development mirrors keep the JSON uncompressed.  The raw candidate
    // below handles that layout without weakening validation.
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(Buffer.from(candidate).toString('utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (_err) {
      // Try the next representation/file.
    }
  }
  return null;
}

class MapMonsterService {
  constructor(options = {}) {
    this.leaseMs = Math.max(
      5000,
      readPositiveInt(options.leaseMs ?? process.env.MAP_MONSTER_CLAIM_LEASE_MS, 20000, 5000),
    );
    this.cooldownMs = Math.max(
      1000,
      readPositiveInt(options.cooldownMs ?? process.env.MAP_MONSTER_RESPAWN_MS, 10000, 1000),
    );
    this.resourceRoots = Array.isArray(options.resourceRoots) && options.resourceRoots.length > 0
      ? options.resourceRoots.map((value) => path.resolve(String(value)))
      : defaultResourceRoots();
    this._loaded = false;
    this._sceneSlots = new Map();
    this._mapSlots = new Map();
    this._sceneFiles = new Map();
    this._claims = new Map();
    this._claimSequence = 0;
    this._stats = {
      resourceRoot: '',
      scenesLoaded: 0,
      mapsLoaded: 0,
      mapsWithMonsters: 0,
      totalSlots: 0,
      originalSlots: 0,
      densityMultiplier: 2,
      loadErrors: 0,
      claims: 0,
      completed: 0,
      released: 0,
      busy: 0,
      invalid: 0,
    };
  }

  /**
   * Load the map manifest once.  This is intentionally lazy so unit tests and
   * non-map workers do not perform filesystem work during module bootstrap.
   */
  load() {
    if (this._loaded) return this;
    this._loaded = true;
    configService.loadAllTables();
    const mapConfig = configService.get('MapConfig') || {};
    const sceneConfig = configService.get('SceneConfig') || {};

    const normalMaps = Object.keys(mapConfig)
      .map((key) => lookup(mapConfig, key))
      .filter((row) => row && toSafeInt(row.type, 0) === 1)
      .sort((left, right) => toSafeInt(left.id, 0) - toSafeInt(right.id, 0));

    for (const mapRow of normalMaps) {
      const mapId = Math.max(0, toSafeInt(mapRow.id, 0));
      const sceneId = Math.max(0, toSafeInt(mapRow.sceneId, 0));
      if (mapId <= 0 || sceneId <= 0) continue;
      if (!this._sceneSlots.has(sceneId)) {
        const scene = lookup(sceneConfig, sceneId) || {};
        const sceneFile = String(scene.mapfilename || '').trim();
        const loaded = this._loadSceneSlots(sceneId, sceneFile);
        this._sceneSlots.set(sceneId, loaded.slots);
        if (loaded.filePath) this._sceneFiles.set(sceneId, loaded.filePath);
      }
      const slots = this._sceneSlots.get(sceneId) || [];
      this._mapSlots.set(mapId, slots);
    }

    const rootsUsed = Array.from(this._sceneFiles.values());
    if (rootsUsed.length > 0) {
      this._stats.resourceRoot = path.dirname(path.dirname(path.dirname(rootsUsed[0])));
    }
    this._stats.scenesLoaded = this._sceneSlots.size;
    this._stats.mapsLoaded = this._mapSlots.size;
    this._stats.mapsWithMonsters = Array.from(this._mapSlots.values()).filter((rows) => rows.length > 0).length;
    this._stats.totalSlots = Array.from(this._mapSlots.values()).reduce((sum, rows) => sum + rows.length, 0);
    this._stats.originalSlots = Math.floor(this._stats.totalSlots / 2);

    logger.info(
      `[MapMonsters] manifest scenes=${this._stats.scenesLoaded} maps=${this._stats.mapsLoaded} `
      + `mapsWithMonsters=${this._stats.mapsWithMonsters} slots=${this._stats.totalSlots}`
    );
    return this;
  }

  _loadSceneSlots(sceneId, sceneFile) {
    if (!sceneFile) {
      this._stats.loadErrors += 1;
      logger.warn(`[MapMonsters] scene=${sceneId} has no mapfilename`);
      return { slots: [], filePath: '' };
    }

    for (const root of this.resourceRoots) {
      const directory = path.join(root, sceneFile);
      let files = [];
      try {
        files = fs.readdirSync(directory)
          .filter((name) => /^mdata_.*\.bin$/i.test(name))
          .sort();
      } catch (_err) {
        continue;
      }
      for (const name of files) {
        const filePath = path.join(directory, name);
        try {
          const parsed = decodeMapFile(filePath);
          const slots = normalizeMonsterSlots(parsed && parsed.animBorns, {
            width: parsed && parsed.width,
            height: parsed && parsed.height,
          });
          // An empty animBorns array is valid for a scene without normal
          // creeps, but prefer a later mirror file if one contains the data.
          if (slots.length > 0 || parsed) {
            return { slots, filePath };
          }
        } catch (err) {
          this._stats.loadErrors += 1;
          logger.warn(`[MapMonsters] decode failed scene=${sceneId} file=${name}: ${err.message}`);
        }
      }
    }

    this._stats.loadErrors += 1;
    logger.warn(`[MapMonsters] map data not found scene=${sceneId} file=${sceneFile}`);
    return { slots: [], filePath: '' };
  }

  getSlots(mapId) {
    this.load();
    const rows = this._mapSlots.get(Math.max(0, toSafeInt(mapId, 0))) || [];
    return rows.map((row) => ({ ...row }));
  }

  getSlot(mapId, index) {
    this.load();
    const safeMapId = Math.max(0, toSafeInt(mapId, 0));
    const safeIndex = toSafeInt(index, -1);
    if (safeMapId <= 0 || safeIndex < 0) return null;
    const rows = this._mapSlots.get(safeMapId) || [];
    const row = rows.find((entry) => entry.index === safeIndex);
    return row ? { ...row } : null;
  }

  _claimKey(serverId, mapId, line, index) {
    return [
      Math.max(1, toSafeInt(serverId, 1)),
      Math.max(0, toSafeInt(mapId, 0)),
      Math.max(0, toSafeInt(line, 0)),
      Math.max(0, toSafeInt(index, 0)),
    ].join(':');
  }

  _prune(now = Date.now()) {
    for (const [key, claim] of this._claims) {
      if (!claim || Math.max(0, toSafeInt(claim.expiresAt, 0)) <= now) {
        this._claims.delete(key);
      }
    }
  }

  /**
   * Atomically claim one map monster in this Node process.  The operation is
   * synchronous by design: no await occurs between checking and inserting the
   * record, so concurrent WebSocket handlers cannot interleave the critical
   * section.  A deployment with multiple game processes should use one map
   * process per server or add a shared Redis lock before enabling that mode.
   */
  tryClaim({ serverId = 1, mapId, line = 0, index, ownerId }) {
    const slot = this.getSlot(mapId, index);
    if (!slot) {
      this._stats.invalid += 1;
      return { ok: false, reason: 'invalid_target', slot: null, retryAfterMs: 0 };
    }

    const owner = String(ownerId || '').trim();
    if (!owner) {
      this._stats.invalid += 1;
      return { ok: false, reason: 'owner_required', slot, retryAfterMs: 0 };
    }

    const now = Date.now();
    this._prune(now);
    const key = this._claimKey(serverId, mapId, line, index);
    const current = this._claims.get(key);
    if (current) {
      if (current.ownerId === owner && current.status === 'claimed') {
        return { ok: true, existing: true, slot, claim: { ...current }, retryAfterMs: 0 };
      }
      this._stats.busy += 1;
      return {
        ok: false,
        reason: current.status === 'cooldown' ? 'cooldown' : 'busy',
        slot,
        retryAfterMs: Math.max(0, current.expiresAt - now),
      };
    }

    const claim = {
      key,
      leaseId: crypto.randomBytes(8).toString('hex'),
      ownerId: owner,
      serverId: Math.max(1, toSafeInt(serverId, 1)),
      mapId: Math.max(0, toSafeInt(mapId, 0)),
      line: Math.max(0, toSafeInt(line, 0)),
      index: slot.index,
      monsterId: slot.id,
      status: 'claimed',
      createdAt: now,
      expiresAt: now + this.leaseMs,
      cooldownUntil: 0,
      sequence: ++this._claimSequence,
    };
    this._claims.set(key, claim);
    this._stats.claims += 1;
    return { ok: true, existing: false, slot, claim: { ...claim }, retryAfterMs: 0 };
  }

  _matches(claim, ownerId, leaseId) {
    if (!claim) return false;
    if (ownerId != null && claim.ownerId !== String(ownerId || '').trim()) return false;
    if (leaseId != null && claim.leaseId !== String(leaseId || '').trim()) return false;
    return true;
  }

  complete(claimOrParams, options = {}) {
    const input = claimOrParams && typeof claimOrParams === 'object' ? claimOrParams : {};
    const key = String(input.key || '').trim();
    const record = key ? this._claims.get(key) : null;
    const now = Date.now();
    if (!this._matches(record, options.ownerId ?? input.ownerId, options.leaseId ?? input.leaseId)) return false;
    // A reward may be settled only while the owner still holds the active
    // lease. Once it expires, another player/bot is allowed to claim the slot;
    // accepting a late 2001 would duplicate the monster reward.
    if (record.status !== 'claimed' || Math.max(0, toSafeInt(record.expiresAt, 0)) <= now) {
      this._claims.delete(key);
      return false;
    }
    record.status = 'cooldown';
    record.cooldownUntil = now + this.cooldownMs;
    record.expiresAt = record.cooldownUntil;
    record.completedAt = now;
    this._stats.completed += 1;
    return true;
  }

  release(claimOrParams, options = {}) {
    const input = claimOrParams && typeof claimOrParams === 'object' ? claimOrParams : {};
    const key = String(input.key || '').trim();
    const record = key ? this._claims.get(key) : null;
    if (!this._matches(record, options.ownerId ?? input.ownerId, options.leaseId ?? input.leaseId)) return false;
    this._claims.delete(key);
    this._stats.released += 1;
    return true;
  }

  getActiveClaims(mapId = 0, line = 0) {
    const safeMapId = Math.max(0, toSafeInt(mapId, 0));
    const safeLine = Math.max(0, toSafeInt(line, 0));
    this._prune(Date.now());
    return Array.from(this._claims.values())
      .filter((claim) => claim && claim.mapId === safeMapId && claim.line === safeLine)
      .map((claim) => ({ ...claim }));
  }

  clearClaims() {
    this._claims.clear();
  }

  getStats() {
    this.load();
    this._prune(Date.now());
    const active = Array.from(this._claims.values());
    return {
      ...this._stats,
      activeClaims: active.length,
      activeCooldowns: active.filter((claim) => claim.status === 'cooldown').length,
      resourceRoots: this.resourceRoots.slice(),
    };
  }
}

const singleton = new MapMonsterService();

module.exports = singleton;
module.exports.MapMonsterService = MapMonsterService;
module.exports.normalizeMonsterSlots = normalizeMonsterSlots;
module.exports.defaultResourceRoots = defaultResourceRoots;
