'use strict';

/** In-memory transaction/ledger contract for checkpoint-4 cash callback. */

const assert = require('assert');
const path = require('path');

const appRoot = path.resolve(process.env.APP_ROOT || path.join(__dirname, '..', '..', 'linhhoasu', 'lhs', 'newServer'));
const configPath = path.join(appRoot, 'src', 'services', 'ConfigService.js');
const transactionPath = path.join(appRoot, 'src', 'db', 'models', 'Transaction.js');
const playerPath = path.join(appRoot, 'src', 'db', 'models', 'Player.js');
const mailPath = path.join(appRoot, 'src', 'db', 'models', 'Mail.js');
const rechargeConfigPath = path.join(appRoot, 'src', 'services', 'RechargeConfigService.js');
const distPath = path.join(appRoot, 'src', 'services', 'DistClient.js');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function makePlayer(userId = 'cash-user') {
  const player = {
    userId,
    playerId: `${userId}-player`,
    name: userId,
    level: 80,
    exp: 0,
    currencies: { diamond: 0, silver: 0, gold: 0 },
    items: {},
    rechargeInfo: { area: 1, records: [], monthCards: {}, monthCardRecords: {}, periodRecords: {} },
    shopInfo: { pack: [], chainPack: [] },
    roleInfo: {},
    taskInfo: { tasks: {}, tasksMap: {} },
    activityInfo: { datas: [] },
    markModified() {},
    toObject() { return clone(this); },
  };
  return player;
}

function state(player) {
  return clone({
    currencies: player.currencies,
    items: player.items,
    rechargeInfo: player.rechargeInfo,
    activityInfo: player.activityInfo,
    fashionInfo: player.fashionInfo,
    other_attr_info: player.other_attr_info,
  });
}

const players = new Map();
const transactions = new Map();
let playerSaveHook = null;
let playerSaveCount = 0;
let transactionSaveHook = null;

function installPlayerSave(player) {
  player.save = async function () {
    playerSaveCount += 1;
    if (playerSaveHook) {
      const hook = playerSaveHook;
      playerSaveHook = null;
      await hook(player);
    }
    players.set(player.userId, player);
    return player;
  };
}

function makeTransaction(data) {
  const row = { ...clone(data) };
  row.save = async function () {
    if (transactionSaveHook) {
      const hook = transactionSaveHook;
      transactionSaveHook = null;
      await hook(row);
    }
    transactions.set(row.orderId, row);
    return row;
  };
  return row;
}

const Transaction = {
  async findOne(query) { return transactions.get(String(query.orderId)) || null; },
  async create(data) {
    if (transactions.has(String(data.orderId))) {
      const error = new Error('duplicate order');
      error.code = 11000;
      throw error;
    }
    const row = makeTransaction(data);
    transactions.set(row.orderId, row);
    return row;
  },
  async findOneAndUpdate(query, update) {
    const row = transactions.get(String(query.orderId));
    if (!row) return null;
    if (query.status && String(row.status) !== String(query.status)) return null;
    if (query['extra.recharge.claimId']) {
      const claimId = row.extra && row.extra.recharge && row.extra.recharge.claimId;
      if (String(claimId) !== String(query['extra.recharge.claimId'])) return null;
    }
    if (query.$or) {
      const statusAllowed = query.$or.some((branch) => branch.status && String(branch.status) === String(row.status));
      if (!statusAllowed) return null;
    }
    if (update.$set) {
      Object.entries(update.$set).forEach(([key, value]) => {
        if (key.startsWith('extra.recharge.')) {
          row.extra = row.extra || {};
          row.extra.recharge = row.extra.recharge || {};
          row.extra.recharge[key.slice('extra.recharge.'.length)] = clone(value);
        } else row[key] = clone(value);
      });
    }
    if (update.$inc && update.$inc['extra.recharge.attempts']) {
      row.extra = row.extra || {};
      row.extra.recharge = row.extra.recharge || {};
      row.extra.recharge.attempts = Number(row.extra.recharge.attempts || 0) + Number(update.$inc['extra.recharge.attempts']);
    }
    transactions.set(row.orderId, row);
    return row;
  },
  async updateOne(query, update) {
    const row = transactions.get(String(query.orderId));
    if (!row) return { matchedCount: 0 };
    if (update.$set) Object.entries(update.$set).forEach(([key, value]) => {
      if (key === 'status') row.status = value;
      else if (key.startsWith('extra.recharge.')) {
        row.extra = row.extra || {};
        row.extra.recharge = row.extra.recharge || {};
        row.extra.recharge[key.slice('extra.recharge.'.length)] = clone(value);
      }
    });
    if (update.$unset && row.extra && row.extra.recharge) {
      Object.keys(update.$unset).forEach((key) => {
        if (key.startsWith('extra.recharge.')) delete row.extra.recharge[key.slice('extra.recharge.'.length)];
      });
    }
    return { matchedCount: 1 };
  },
};

const Player = {
  async findOne(query) { return players.get(String(query.userId)) || null; },
};

const Mail = {
  async findOne() { return null; },
  async create(data) { return { _id: `mail-${data.eventKey}`, ...clone(data) }; },
};

function cacheModule(file, exports) {
  require.cache[require.resolve(file)] = { id: file, filename: file, loaded: true, exports };
}

cacheModule(transactionPath, Transaction);
cacheModule(playerPath, Player);
cacheModule(mailPath, Mail);
cacheModule(distPath, { rechargeCallback: async () => ({ success: true }) });
cacheModule(rechargeConfigPath, {
  normalizeProductId: (value) => String(value || '').trim(),
  normalizeRewardItems: (rows) => Array.isArray(rows) ? rows : [],
  getResolvedRow: async (productId) => {
    const pay = require(configPath).get('PayConfig') || {};
    const row = pay[productId] || pay[String(productId)];
    return row ? {
      productId: String(productId),
      name: String(row.name || productId),
      amount: Number(row.priceR),
      diamond: 0,
      firstBonus: 0,
      attachments: [],
      enabled: true,
      source: 'builtin',
    } : null;
  },
});

const recharge = require(path.join(appRoot, 'src', 'handlers', 'recharge.js'));

function rechargeCount(player, payId) {
  const found = (player.rechargeInfo.records || []).find((row) => Number(row.id) === Number(payId));
  return found ? Number(found.count) : 0;
}

function registerPlayer(player) {
  installPlayerSave(player);
  players.set(player.userId, player);
}

async function run() {
  const checks = [];

  {
    const player = makePlayer('normal');
    registerPlayer(player);
    const result = await recharge.handleRecharge({ userId: player.userId, orderId: 'cash-normal', amount: 6, productId: '11027001', channel: 'fixture' });
    assert(result.success, JSON.stringify(result));
    assert.strictEqual(player.currencies.diamond, 60);
    assert.strictEqual(player.items[4], 60);
    assert.strictEqual(player.currencies.silver, 3000);
    assert.strictEqual(rechargeCount(player, 11027001), 1);
    assert.strictEqual(result.data.diamond, 60);
    assert.strictEqual(result.data.resolverVersion, 'catalog-v1');
    const tx = transactions.get('cash-normal');
    assert.strictEqual(tx.status, 'success');
    assert.deepStrictEqual(tx.extra.recharge.rewardSnapshot.items, [
      { id: 1, count: 60 }, { id: 2, count: 3000 }, { id: 4, count: 60 },
    ]);
    checks.push('catalog_reward_snapshot');
  }

  {
    const player = makePlayer('double');
    registerPlayer(player);
    const first = await recharge.handleRecharge({ userId: player.userId, orderId: 'cash-double-1', amount: 6, productId: '2000001' });
    assert(first.success);
    assert.strictEqual(player.currencies.diamond, 120, 'cash isDouble not granted');
    assert.deepStrictEqual(first.data.rewardInfo.extraReward[1].items, [{ id: 1, count: 60 }]);
    const second = await recharge.handleRecharge({ userId: player.userId, orderId: 'cash-double-2', amount: 6, productId: '2000001' });
    assert(second.success);
    assert.strictEqual(player.currencies.diamond, 180, 'cash isDouble replayed');
    assert(!second.data.rewardInfo.extraReward[1]);
    checks.push('cash_double_first_only');
  }

  {
    const player = makePlayer('type14');
    registerPlayer(player);
    const first = await recharge.handleRecharge({ userId: player.userId, orderId: 'cash-type14-1', amount: 1000, productId: '2000258' });
    assert(first.success);
    assert.strictEqual(player.currencies.diamond, 2000);
    assert((player.fashionInfo.activateFashion || []).includes(23022));
    assert(!player.items[23022], 'type14 fashion became bag item');
    const second = await recharge.handleRecharge({ userId: player.userId, orderId: 'cash-type14-2', amount: 1000, productId: '2000258' });
    assert(second.success);
    assert.strictEqual(player.currencies.diamond, 3500);
    assert(second.data.rewardInfo.items.some((row) => row.id === 53 && row.count === 1));
    checks.push('first_subsequent_native');
  }

  {
    const player = makePlayer('amount-mismatch');
    registerPlayer(player);
    const before = state(player);
    const result = await recharge.handleRecharge({ userId: player.userId, orderId: 'cash-wrong', amount: 7, productId: '11027001' });
    assert(!result.success && result.error === 'AMOUNT_MISMATCH');
    assert.deepStrictEqual(state(player), before);
    assert(!transactions.has('cash-wrong'), 'wrong amount created transaction');
    checks.push('amount_prevalidation');
  }

  {
    const player = makePlayer('pending-amount-mismatch');
    registerPlayer(player);
    const pending = makeTransaction({
      orderId: 'cash-pending-wrong', userId: player.userId, playerId: player.playerId,
      amount: 6, diamond: 0, productId: '11027001', status: 'pending', extra: {},
    });
    transactions.set(pending.orderId, pending);
    const before = state(player);
    const result = await recharge.handleRecharge({ userId: player.userId, orderId: pending.orderId, amount: 7, productId: '11027001', allowPendingOrder: true });
    assert(!result.success && result.error === 'AMOUNT_MISMATCH');
    assert.deepStrictEqual(state(player), before);
    assert.strictEqual(transactions.get(pending.orderId).status, 'pending');
    checks.push('pending_amount_mismatch');
  }

  {
    const player = makePlayer('specialized');
    registerPlayer(player);
    const before = state(player);
    const result = await recharge.handleRecharge({ userId: player.userId, orderId: 'cash-specialized', amount: 6, productId: '11000018' });
    assert(!result.success && result.error === 'ACTIVITY999_REQUIRES_ACTIVITY_RESOLVER');
    assert.deepStrictEqual(state(player), before);
    assert(!transactions.has('cash-specialized'));
    checks.push('specialized_fail_closed');
  }

  {
    const player = makePlayer('activity9');
    registerPlayer(player);
    const result = await recharge.handleRecharge({ userId: player.userId, orderId: 'cash-activity9', amount: 68, productId: '10501' });
    assert(result.success, JSON.stringify(result));
    assert.strictEqual(result.data.diamond, 0, 'Activity9 received synthetic diamond');
    assert.strictEqual(rechargeCount(player, 10501), 1);
    assert((player.activityInfo.datas || []).some((row) => (row.recordList || []).includes(10501)), 'Activity9 not activated');
    checks.push('activity9_cash_regression');
  }

  {
    const player = makePlayer('daily-limit');
    registerPlayer(player);
    const first = await recharge.handleRecharge({ userId: player.userId, orderId: 'cash-day-1', amount: 30, productId: '11002' });
    assert(first.success);
    const before = state(player);
    const second = await recharge.handleRecharge({ userId: player.userId, orderId: 'cash-day-2', amount: 30, productId: '11002' });
    assert(!second.success && second.error === 'LIMIT_REACHED');
    assert.deepStrictEqual(state(player), before, 'daily limit rejection mutated player');
    checks.push('cash_daily_limit');
  }

  {
    const player = makePlayer('duplicate');
    registerPlayer(player);
    const first = await recharge.handleRecharge({ userId: player.userId, orderId: 'cash-duplicate', amount: 6, productId: '11027001', idempotentSuccess: true });
    assert(first.success);
    const after = state(player);
    const second = await recharge.handleRecharge({ userId: player.userId, orderId: 'cash-duplicate', amount: 6, productId: '11027001', idempotentSuccess: true });
    assert(second.success && second.duplicate);
    assert.deepStrictEqual(state(player), after, 'duplicate callback granted twice');
    assert(second.data.rewardInfo, 'duplicate response lost reward snapshot');
    checks.push('idempotent_duplicate');
  }

  {
    const player = makePlayer('crash-recovery');
    registerPlayer(player);
    const pending = makeTransaction({
      orderId: 'cash-crash', userId: player.userId, playerId: player.playerId,
      amount: 6, diamond: 60, productId: '11027001', status: 'success',
      extra: { recharge: { resolverVersion: 'catalog-v1', rewardSnapshot: { items: [{ id: 1, count: 60 }], extraReward: {} } } },
    });
    transactions.set('cash-crash', pending);
    const afterCrash = state(player);
    const retry = await recharge.handleRecharge({ userId: player.userId, orderId: 'cash-crash', amount: 6, productId: '11027001', allowPendingOrder: true, idempotentSuccess: true });
    assert(retry.success && retry.duplicate);
    assert.deepStrictEqual(state(player), afterCrash, 'crash retry granted twice');
    checks.push('transaction_snapshot_replay');
  }

  {
    const player = makePlayer('pending-save-fail');
    registerPlayer(player);
    const pending = makeTransaction({
      orderId: 'cash-save-fail', userId: player.userId, playerId: player.playerId,
      amount: 6, diamond: 0, productId: '11027001', status: 'pending', extra: {},
    });
    transactions.set(pending.orderId, pending);
    transactionSaveHook = async () => { throw new Error('TX_SAVE_FAILURE'); };
    await assert.rejects(
      () => recharge.handleRecharge({ userId: player.userId, orderId: pending.orderId, amount: 6, productId: '11027001', allowPendingOrder: true }),
      /TX_SAVE_FAILURE/
    );
    assert.strictEqual(player.currencies.diamond, 60, 'player reward did not persist before transaction failure');
    assert.strictEqual(rechargeCount(player, 11027001), 1, 'recharge record missing after transaction failure');
    const meta = pending.extra && pending.extra.recharge;
    assert(meta && meta.rewardSnapshot && meta.resolverVersion === 'catalog-v1', 'pending transaction lost reward snapshot');
    pending.status = 'success';
    const retry = await recharge.handleRecharge({ userId: player.userId, orderId: pending.orderId, amount: 6, productId: '11027001', allowPendingOrder: true, idempotentSuccess: true });
    assert(retry.success && retry.duplicate);
    assert.strictEqual(player.currencies.diamond, 60, 'transaction retry granted twice');
    assert.strictEqual(rechargeCount(player, 11027001), 1, 'transaction retry doubled record');
    checks.push('pending_save_failure_snapshot');
  }

  console.log(JSON.stringify({ result: 'ok', checks: checks.length, names: checks, players: players.size, transactions: transactions.size, playerSaves: playerSaveCount, network: false }));
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
