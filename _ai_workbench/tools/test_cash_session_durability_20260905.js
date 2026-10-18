'use strict';

// Isolated regression: real cash resolver/grants and live-session projection;
// all persistence, delivery, logger, and network-facing dependencies are fakes.
// Does not prove cross-process ordering or already-captured gameplay snapshots.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const APP = path.resolve(process.env.LHS_APP_ROOT
  || path.join(__dirname, '../../linhhoasu/lhs/newServer'));
const CONFIG = path.resolve(process.env.LHS_CONFIG_PATH
  || path.join(__dirname, '../temp/reward_release_20260905/config.bin'));
assert(fs.existsSync(CONFIG), 'Pinned production config snapshot is required');
process.env.CONFIG_BIN_PATH = CONFIG;
const WRITER_GATES = process.argv.includes('--writer-gates');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function stub(relative, exports) {
  const filename = require.resolve(path.join(APP, relative));
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}

let fixture;
function makeDocument(value, save) {
  return Object.assign(clone(value), {
    markModified() {},
    toObject() { return clone(this); },
    async save() { return save(this); },
  });
}

function failOnce(key, message) {
  if (!fixture.failures[key]) return;
  fixture.failures[key] -= 1;
  throw new Error(message);
}

stub('src/logger', {
  info() {}, warn() {}, error() {}, debug() {}, verbose() {}, log() {},
});
stub('src/db/models/Player', {
  async findOne(query) {
    assert.equal(String(query.userId), fixture.durable.userId);
    fixture.playerReads += 1;
    return makeDocument(fixture.durable, async (player) => {
      failOnce('player', 'FIXTURE_PLAYER_SAVE_FAIL');
      if (fixture.playerSaveHook) await fixture.playerSaveHook();
      fixture.durable = clone(player);
      fixture.playerSaves += 1;
      fixture.events.push('player-commit');
      return player;
    });
  },
});
function saveTransaction(row) {
  fixture.events.push('transaction-finalize');
  failOnce('transaction', 'FIXTURE_TRANSACTION_FINALIZE_FAIL');
  fixture.transactions.set(row.orderId, clone(row));
  return row;
}
stub('src/db/models/Transaction', {
  async findOne(query) {
    const row = fixture.transactions.get(query.orderId);
    return row ? makeDocument(row, saveTransaction) : null;
  },
  async create(row) {
    assert(!fixture.transactions.has(row.orderId), 'Duplicate transaction creation');
    return saveTransaction(row);
  },
});
stub('src/db/models/Mail', {
  async findOneAndUpdate(query, update, options) {
    fixture.events.push('mail-finalize');
    if (fixture.mailHook) await fixture.mailHook();
    failOnce('mail', 'FIXTURE_MAIL_FINALIZE_FAIL');
    assert(options.upsert && options.new);
    const key = `${query.userId}:${query.eventKey}`;
    if (!fixture.mails.has(key)) {
      fixture.mails.set(key, { ...clone(update.$setOnInsert), _id: `fixture-mail-${fixture.mails.size}` });
    }
    return fixture.mails.get(key);
  },
});
stub('src/services/DistClient', {
  async rechargeCallback() { throw new Error('Unexpected distribution network request'); },
});
stub('src/services/PlayerService', {
  async loadPlayer() { return clone(fixture.durable); },
  async savePlayer() { throw new Error('Unexpected gameplay persistence from reward grant'); },
  async savePlayerDeferred() { throw new Error('Unexpected background persistence from reward grant'); },
  wasRecentlySaved() { return false; },
});
stub('src/services/RechargeConfigService', {
  normalizeProductId(value) { return String(value || '').trim(); },
  normalizeRewardItems(rows) { return Array.isArray(rows) ? rows : []; },
  async getResolvedRow(productId) {
    const row = config.get('PayConfig')[productId];
    return row ? {
      productId: String(productId), amount: Number(row.priceR), source: 'catalog',
      enabled: true, attachments: clone(fixture.attachments),
    } : null;
  },
});

const config = require(path.join(APP, 'src/services/ConfigService'));
const { syncSessionPlayerFields } = require(path.join(APP, 'src/services/SessionPlayerSyncService'));
const recharge = require(path.join(APP, 'src/handlers/recharge'));

function begin(name, options = {}) {
  const durable = {
    userId: `session-contract-${name}`, playerId: `session-contract-role-${name}`, name: 'fixture',
    level: 99, exp: 0, items: { 19: 80 },
    currencies: { diamond: 0, silver: 0, gold: 0 },
    roleInfo: { kungfuId: 4, stage: 999, subJob: 0 },
    rechargeInfo: { area: 1, records: [], periodRecords: {}, monthCards: {} },
    shopInfo: { pack: [], chainPack: [], buyRecords: {} },
    activityInfo: { datas: [], disabledEntryIds: [] },
    other_attr_info: {}, artifactInfo: {}, swordInfo: {}, petInfo: {},
    fashionInfo: { fashions: {}, fashionData: [], emoji: {}, emojiGroups: [], dress: [] },
    equipInfo: { equipList: [], openList: [], setInfoMap: {}, curIndex: 0 },
    formationInfo: {}, spiritInfo: {}, valhallaInfo: {}, bloodlineInfo: {},
    taskInfo: { unrelatedProgress: 'durable-old' },
    raidInfo: { unrelatedProgress: 'durable-old' },
    systemUnlockInfo: { unlockedSystem: [1], guideStep: 1 },
  };
  fixture = {
    durable: clone(durable), online: clone(durable), before: clone(durable),
    transactions: new Map(), mails: new Map(), packets: [], syncCalls: [],
    events: [], mailHook: null, playerSaveHook: null,
    failures: { player: 0, transaction: 0, mail: 0, packet: 0 },
    playerSaves: 0, playerReads: 0, gameplaySaves: 0,
    attachments: options.attachments ? [{ id: 4, count: 2 }] : [],
  };
  fixture.online.taskInfo.unrelatedProgress = 'online-new';
  fixture.online.raidInfo.unrelatedProgress = 'online-new';
  fixture.online.systemUnlockInfo.guideStep = 17;
  fixture.onlineIdentity = fixture.online;
  fixture.ws = {
    syncSessionPlayer(userId, updatedPlayer, syncOptions) {
      assert.equal(userId, fixture.online.userId);
      fixture.syncCalls.push({ userId, options: clone(syncOptions) });
      fixture.events.push('session-sync');
      return syncSessionPlayerFields(fixture.online, updatedPlayer, syncOptions);
    },
    pushToUser(userId, tag, data) {
      assert.equal(userId, fixture.online.userId);
      fixture.events.push('packet-push');
      failOnce('packet', 'FIXTURE_PACKET_DELIVERY_FAIL');
      fixture.packets.push({ tag, data: clone(data) });
    },
  };
  return fixture;
}

function request(payId = 11000015, suffix = 'one') {
  const pay = config.get('PayConfig')[payId];
  assert(pay && Number(pay.priceR) > 0, `Missing pay contract ${payId}`);
  return {
    userId: fixture.durable.userId, orderId: `${fixture.durable.userId}-${suffix}`,
    productId: String(payId), amount: Number(pay.priceR),
    channel: 'fixture-only', idempotentSuccess: true,
  };
}

function receipt(player, req) {
  const key = crypto.createHash('sha256').update(String(req.orderId)).digest('hex');
  return player.rechargeInfo?.fulfillmentOrders?.[key];
}

function assertCurios(player, label) {
  const rows = player.other_attr_info?.curiosInfo?.curiosData || [];
  assert.equal(rows.filter((row) => Number(row.id) === 130601).length, 1, `${label}: native Curios 130601`);
  assert.equal(Number(player.items[130601]) || 0, 0, `${label}: no native body in bag`);
  assert.equal(Number(player.other_attr_info?.curiosInfo?.unconvertedRewardCopies?.[130601]) || 0,
    0, `${label}: no duplicate Curios copy`);
}

function assertEntitlement(player, label) {
  const row = player.activityInfo?.datas?.find((value) => Number(value.id) === 7001);
  assert(row, `${label}: Activity7001 exists`);
  assert(row.recordList?.includes(10301), `${label}: Activity7001 owns entitlement10301`);
}

function assertUnrelated() {
  assert.strictEqual(fixture.online, fixture.onlineIdentity, 'Session player identity remains stable');
  assert.equal(fixture.online.taskInfo.unrelatedProgress, 'online-new', 'Preserve live task progress');
  assert.equal(fixture.online.raidInfo.unrelatedProgress, 'online-new', 'Preserve live raid progress');
  assert.equal(fixture.online.systemUnlockInfo.guideStep, 17, 'Preserve live guide progress');
}

function assertProjection(expectedFields, label = 'projection') {
  const fields = fixture.syncCalls.flatMap((call) => call.options?.fields || []);
  expectedFields.forEach((field) => assert(fields.includes(field), `${label}: sync field ${field}`));
}

function assertEarlySync(events, expectCommit = true) {
  assert.equal(events.filter((event) => event === 'session-sync').length, 1, 'Exactly one sync per committed/recovery attempt');
  const syncIndex = events.indexOf('session-sync');
  if (expectCommit) {
    assert(events.indexOf('player-commit') >= 0);
    assert(events.indexOf('player-commit') < syncIndex, 'Session sync follows acknowledged player commit');
  }
  for (const operation of ['mail-finalize', 'transaction-finalize', 'packet-push']) {
    const index = events.indexOf(operation);
    if (index >= 0) assert(syncIndex < index, `Session sync precedes ${operation}`);
  }
}

function gameplaySave() {
  // Mirrors the whole-state write performed by PlayerService after a gameplay
  // action or close. No actual database or external state is accessed.
  fixture.durable = clone(fixture.online);
  fixture.gameplaySaves += 1;
}

async function assertRetryDoesNotRegrant(req) {
  const saves = fixture.playerSaves;
  const before = clone(fixture.durable);
  const recovered = await recharge.handleRecharge(req, fixture.ws);
  assert(recovered.success && recovered.duplicate, 'Receipt retry succeeds as duplicate');
  assert.equal(fixture.playerSaves, saves, 'Receipt retry must not save/grant player again');
  assert.deepEqual(fixture.durable, before, 'Receipt retry does not mutate durable rewards');
  const duplicate = await recharge.handleRecharge(req, fixture.ws);
  assert(duplicate.success && duplicate.duplicate, 'Final transaction retry stays idempotent');
  assert.equal(fixture.playerSaves, saves);
  assert.equal(fixture.transactions.size, 1);
}

const results = [];
async function check(name, work) {
  try {
    await work();
    results.push({ name, result: 'PASS' });
  } catch (error) {
    results.push({
      name, result: 'FAIL', message: String(error.message).split('\n')[0],
      ...(WRITER_GATES ? { actual: error.actual, expected: error.expected } : {}),
    });
  }
}

function writerState() {
  return {
    stage: fixture.online.roleInfo.stage,
    activityRows: fixture.online.activityInfo.datas.filter((row) => row.id >= 990001),
    equipmentIndex: fixture.online.equipInfo.curIndex,
    diamond: fixture.online.currencies.diamond,
  };
}

function printReport(mode) {
  const failed = results.filter((row) => row.result === 'FAIL').length;
  console.log(JSON.stringify({
    result: failed ? 'FAIL' : 'PASS', mode, cases: results.length, failed, results,
    ...(WRITER_GATES ? { releaseGate: failed ? 'HOLD' : 'WRITER_FIXTURE_PASS_ONLY' } : {}),
    sourceRoot: APP, configSha256: crypto.createHash('sha256').update(fs.readFileSync(CONFIG)).digest('hex'),
    database: 'in-memory-only', upstreamPayment: false, nativeUi: false,
    coversPreCapturedGameplaySnapshots: false, coversConcurrentChangesDuringPlayerSave: WRITER_GATES,
    coversMultiProcess: false,
  }, null, 2));
  if (failed) process.exitCode = 1;
}

async function runWriterGates() {
  await check('writer_gate_preserves_gameplay_changes_during_player_save', async () => {
    begin('writer-during-save');
    const req = request();
    let expected;
    fixture.playerSaveHook = async () => {
      // The callback's player document was read earlier. Model a separate
      // gameplay writer advancing live state while its DB save is in flight.
      await Promise.resolve();
      fixture.online.roleInfo.stage = 1017;
      fixture.online.activityInfo.datas.push({ id: 990011, score: 41, marker: 'during-player-save' });
      const { stage, activityRows } = writerState();
      expected = clone({ stage, activityRows });
    };
    const response = await recharge.handleRecharge(req, fixture.ws);
    assert(response.success, JSON.stringify(response));
    assert.equal(fixture.playerSaves, 1);
    assertCurios(fixture.online, 'writer-gate committed native reward');
    assert(receipt(fixture.online, req), 'Writer gate keeps the committed receipt');
    const { stage, activityRows } = writerState();
    assert.deepEqual({ stage, activityRows }, expected, 'Cash sync must not revert gameplay changes made while player.save is in flight');
  });

  await check('writer_gate_receipt_retry_preserves_unflushed_gameplay_changes', async () => {
    begin('writer-before-retry', { attachments: true });
    // Seed fixture-only spendable balance; do not derive it from the package.
    fixture.durable.currencies.diamond = 100;
    fixture.online.currencies.diamond = 100;
    const req = request();
    fixture.failures.mail = 1;
    await assert.rejects(() => recharge.handleRecharge(req, fixture.ws), /FIXTURE_MAIL_FINALIZE_FAIL/);
    assert.equal(fixture.playerSaves, 1);
    assertCurios(fixture.online, 'native reward before receipt retry');
    assert(receipt(fixture.online, req));
    fixture.online.roleInfo.stage = 1031;
    fixture.online.activityInfo.datas.push({ id: 990012, score: 53, marker: 'after-commit-before-retry' });
    fixture.online.equipInfo.curIndex = 3;
    assert(fixture.online.currencies.diamond >= 5, 'Fixture has spendable wallet balance');
    fixture.online.currencies.diamond -= 5;
    if (fixture.online.items[1] != null) fixture.online.items[1] -= 5;
    const expected = clone(writerState());
    const response = await recharge.handleRecharge(req, fixture.ws);
    assert(response.success && response.recovered, 'Existing receipt must finalize without regrant');
    assert.equal(fixture.playerSaves, 1, 'Receipt retry does not regrant player');
    assert.equal(fixture.transactions.size, 1);
    assert.equal(fixture.mails.size, 1);
    assertCurios(fixture.online, 'native reward after receipt retry');
    assert(receipt(fixture.online, req));
    assert.deepEqual(writerState(), expected, 'Receipt sync must not revert live progress or refund an unflushed gameplay spend');
  });
  printReport('writer-gates');
}

async function run() {
  if (WRITER_GATES) return runWriterGates();
  await check('cash_native_success_preserves_live_ownership', async () => {
    begin('native-success');
    const req = request();
    const response = await recharge.handleRecharge(req, fixture.ws);
    assert(response.success, JSON.stringify(response));
    assertEarlySync(fixture.events);
    assertCurios(fixture.durable, 'durable after success');
    assertCurios(fixture.online, 'live after success');
    assert(receipt(fixture.online, req), 'Live receipt exists');
    assertProjection(['items', 'currencies', 'rechargeInfo', 'activityInfo', 'other_attr_info'], 'native projection');
    assertUnrelated();
    gameplaySave();
    assertCurios(fixture.durable, 'durable after subsequent gameplay save');
    await assertRetryDoesNotRegrant(req);
  });

  await check('cash_activation_entitlement_preserves_live_state', async () => {
    begin('activation');
    const req = request(10301);
    const response = await recharge.handleRecharge(req, fixture.ws);
    assert(response.success, JSON.stringify(response));
    assertEarlySync(fixture.events);
    assertEntitlement(fixture.durable, 'durable');
    assertEntitlement(fixture.online, 'live');
    assertProjection(['rechargeInfo', 'activityInfo'], 'entitlement projection');
    assertUnrelated();
    gameplaySave();
    assertEntitlement(fixture.durable, 'after gameplay save');
    await assertRetryDoesNotRegrant(req);
  });

  for (const failure of ['mail', 'transaction']) {
    await check(`durable_native_survives_${failure}_finalize_failure`, async () => {
      begin(`finalize-${failure}`, { attachments: true });
      const req = request();
      fixture.failures[failure] = 1;
      await assert.rejects(() => recharge.handleRecharge(req, fixture.ws),
        failure === 'mail' ? /FIXTURE_MAIL_FINALIZE_FAIL/ : /FIXTURE_TRANSACTION_FINALIZE_FAIL/);
      assert.equal(fixture.playerSaves, 1);
      assertEarlySync(fixture.events);
      assertCurios(fixture.durable, 'durable committed before finalize failure');
      assertCurios(fixture.online, 'live after finalize failure');
      assert(receipt(fixture.online, req), 'Live receipt must survive finalize failure');
      assertProjection(['items', 'currencies', 'rechargeInfo', 'activityInfo', 'other_attr_info'], 'failure projection');
      assertUnrelated();
      gameplaySave();
      assertCurios(fixture.durable, 'native remains after gameplay save');
      assert(receipt(fixture.durable, req), 'Receipt remains after gameplay save');
      await assertRetryDoesNotRegrant(req);
      assertCurios(fixture.durable, 'after recovery and duplicate retry');
      assert.equal(fixture.mails.size, 1, 'Exactly one fulfillment mail');
    });
  }

  await check('receipt_recovery_sync_precedes_second_finalize_failure', async () => {
    begin('recovery-fails-twice', { attachments: true });
    const req = request();
    fixture.failures.mail = 2;
    await assert.rejects(() => recharge.handleRecharge(req, fixture.ws), /FIXTURE_MAIL_FINALIZE_FAIL/);
    // Reproduce a stale session after reconnect/recovery independently of the
    // first-attempt sync. Retry must project the already-durable receipt first.
    fixture.online.other_attr_info = {};
    fixture.online.rechargeInfo = clone(fixture.before.rechargeInfo);
    fixture.events = [];
    await assert.rejects(() => recharge.handleRecharge(req, fixture.ws), /FIXTURE_MAIL_FINALIZE_FAIL/);
    assertEarlySync(fixture.events, false);
    assertCurios(fixture.online, 'live refreshed before repeated finalize failure');
    assert(receipt(fixture.online, req), 'Recovered receipt reaches live session');
    assertProjection(['items', 'currencies', 'rechargeInfo', 'activityInfo', 'other_attr_info'], 'recovery projection');
    assert.equal(fixture.playerSaves, 1);
    assertUnrelated();
    gameplaySave();
    await assertRetryDoesNotRegrant(req);
  });

  await check('precommit_save_failure_does_not_sync_uncommitted_rewards', async () => {
    begin('player-save-failure');
    const beforeOnline = clone(fixture.online);
    const beforeDurable = clone(fixture.durable);
    fixture.failures.player = 1;
    await assert.rejects(() => recharge.handleRecharge(request(), fixture.ws), /FIXTURE_PLAYER_SAVE_FAIL/);
    assert.equal(fixture.playerSaves, 0);
    assert.equal(fixture.syncCalls.length, 0, 'No sync before acknowledged durable save');
    assert.deepEqual(fixture.online, beforeOnline);
    assert.deepEqual(fixture.durable, beforeDurable);
    assert.equal(fixture.transactions.size, 0);
    assert.equal(fixture.mails.size, 0);
  });

  await check('packet_failure_after_commit_cannot_skip_session_sync', async () => {
    begin('packet-failure');
    const req = request();
    fixture.failures.packet = 1;
    await assert.rejects(() => recharge.handleRecharge(req, fixture.ws), /FIXTURE_PACKET_DELIVERY_FAIL/);
    assert.equal(fixture.transactions.size, 1);
    assertEarlySync(fixture.events);
    assertCurios(fixture.online, 'live despite packet delivery exception');
    assert(receipt(fixture.online, req), 'Live receipt despite packet delivery exception');
    assertProjection(['items', 'currencies', 'rechargeInfo', 'activityInfo', 'other_attr_info'], 'packet projection');
    assertUnrelated();
    gameplaySave();
    await assertRetryDoesNotRegrant(req);
  });

  await check('no_late_resync_overwrites_postcommit_online_gameplay', async () => {
    begin('postcommit-live-change', { attachments: true });
    const req = request();
    fixture.mailHook = async () => {
      // The player's first durable save has completed. A gameplay update may
      // run while the callback is awaiting independent mail finalization.
      assertCurios(fixture.online, 'native is live before mail finalization');
      assert(receipt(fixture.online, req), 'Receipt is live before mail finalization');
      await Promise.resolve();
      fixture.online.roleInfo.stage = 1003;
      fixture.online.activityInfo.datas.push({ id: 990001, score: 27, marker: 'online-after-commit' });
      fixture.online.equipInfo.curIndex = 2;
      fixture.online.other_attr_info.fixtureGameplay = { score: 31 };
    };
    const result = await recharge.handleRecharge(req, fixture.ws);
    assert(result.success, JSON.stringify(result));
    assertEarlySync(fixture.events);
    assert.equal(fixture.online.roleInfo.stage, 1003, 'Keep postcommit role progress');
    assert(fixture.online.activityInfo.datas.some((row) => row.id === 990001 && row.score === 27), 'Keep postcommit unrelated activity row');
    assert.equal(fixture.online.equipInfo.curIndex, 2, 'Keep postcommit equipment state');
    assert.equal(fixture.online.other_attr_info.fixtureGameplay.score, 31, 'Keep postcommit native-root gameplay state');
    gameplaySave();
    assertCurios(fixture.durable, 'native retained with later gameplay save');
    assert.equal(fixture.durable.roleInfo.stage, 1003);
    assert(receipt(fixture.durable, req));
    await assertRetryDoesNotRegrant(req);
  });

  await check('disconnected_session_sync_noop_does_not_block_fulfillment', async () => {
    begin('disconnected');
    const req = request();
    const beforeOnline = clone(fixture.online);
    const ws = {
      syncSessionPlayer() { fixture.events.push('session-sync-noop'); return null; },
      pushToUser() {},
    };
    const result = await recharge.handleRecharge(req, ws);
    assert(result.success, JSON.stringify(result));
    assertCurios(fixture.durable, 'disconnected durable reward');
    assert(receipt(fixture.durable, req));
    assert.deepEqual(fixture.online, beforeOnline);
    assert.equal(fixture.playerSaves, 1);
    assert.equal(fixture.transactions.size, 1);
    assert.equal(fixture.events.filter((event) => event === 'session-sync-noop').length, 1);
  });

  await check('offline_fulfillment_and_receipt_recovery_still_work', async () => {
    begin('offline', { attachments: true });
    const req = request();
    fixture.failures.transaction = 1;
    await assert.rejects(() => recharge.handleRecharge(req), /FIXTURE_TRANSACTION_FINALIZE_FAIL/);
    assertCurios(fixture.durable, 'offline durable grant');
    assert(receipt(fixture.durable, req));
    const result = await recharge.handleRecharge(req);
    assert(result.success && result.recovered);
    assert.equal(fixture.playerSaves, 1);
    assert.equal(fixture.syncCalls.length, 0);
    assert.equal(fixture.transactions.size, 1);
    assert.equal(fixture.mails.size, 1);
    assertCurios(fixture.durable, 'offline recovered grant');
  });

  printReport('durability');
}

run().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
