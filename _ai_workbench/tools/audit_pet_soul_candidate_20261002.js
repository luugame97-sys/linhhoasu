/* Read-only, isolated audit of the downloaded production pet-soul handler.
 * No database/network imports, no player writes. Generated evidence is local.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const crypto = require('crypto');

const root = path.resolve(__dirname, '../..');
const source = path.join(root, '_ai_workbench/temp/petsoul_oldtrek_live_20261002/pet-soul.js');
const serverRoot = path.join(root, 'linhhoasu/lhs/newServer');
const configPath = path.join(root, 'linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin');
const clientPath = path.join(root, 'linhhoasu/webgame/game/js/main.min_drop100.js');
const outputPath = path.join(root, '_ai_workbench/temp/petsoul_release_20261002/soul_audit.json');
const { BinJsonUtil, ByteArray } = require(path.join(serverRoot, 'src/protocol/BinJsonUtil'));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const copy = (x) => JSON.parse(JSON.stringify(x));

function readTables() {
  const buffer = fs.readFileSync(configPath);
  const ba = new ByteArray(buffer);
  const tables = {};
  while (ba.position < ba.length) {
    const name = ba.readUTFBytes(ba.readUnsignedByte());
    const length = ba.readUnsignedInt();
    const raw = buffer.subarray(ba.position, ba.position + length);
    ba.position += length;
    if (!name.startsWith('PetSoul') && name !== 'AssetsConfig') continue;
    tables[name] = BinJsonUtil.readFullJson(new ByteArray(zlib.inflateSync(raw)));
  }
  return tables;
}
const tables = readTables();
const math = Object.create(Math);
math.random = () => 0.5;
const raidSource = fs.readFileSync(path.join(serverRoot, 'src/handlers/raid.js'), 'utf8');
const rewardFunction = raidSource.slice(raidSource.indexOf('function addRewardToPlayer('), raidSource.indexOf('function resolveStageIdForLevel('));
const raidSandbox = {
  toSafeInt(value, fallback = 0) { return Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback; },
  isEquipTemplateItem() { return false; },
  createEquipFromTemplateId() { throw Error('Equip grants not within this audit fixture'); },
  addOpenEquip() { throw Error('Equip grants not within this audit fixture'); },
  addExpToPlayer(player, count) { player.exp = (player.exp || 0) + count; },
  refreshRealmStageTasks() {},
  refreshMainTaskProgress() {},
};
vm.runInNewContext(rewardFunction, raidSandbox);
let saves = 0;
const sandbox = {
  module: { exports: {} },
  Math: math,
  require(name) {
    if (name === '../services/ConfigService') return { get: (key) => tables[key] || null };
    if (name === '../services/PlayerService') return { savePlayer: async () => { saves++; } };
    if (name === './raid') return { addRewardToPlayer: raidSandbox.addRewardToPlayer };
    throw Error(`Unexpected dependency: ${name}`);
  },
};
vm.runInNewContext(fs.readFileSync(source, 'utf8'), sandbox, { filename: source });
const handler = sandbox.module.exports;
const allSouls = Object.values(tables.PetSoulConfig);
const lowId = allSouls.find(x => x.quality === 3).id;
const highId = allSouls.find(x => x.quality === 7).id;
const info = (s) => s.player.other_attr_info.petSoulInfo;
const soul = (s, id) => info(s).petSouls.find(x => x.id === id);
const packet = (packets, tag) => (Array.isArray(packets) ? packets : [packets]).find(x => x.tag === tag);
function session() {
  const s = { userId: 'ISOLATED_AUDIT_ONLY', player: { items: {}, currencies: { diamond: 0, silver: 0, gold: 0 }, petInfo: { pets: [] }, other_attr_info: {} } };
  handler.ensurePetSoulInfo(s.player);
  return s;
}
const calls = {
  bind: ['handlePetSoulSet', 6900],
  star: ['handlePetSoulStarUp', 6901],
  wash: ['handlePetSoulWash', 6902],
  confirm: ['handlePetSoulWashConfirm', 6903],
  drug: ['handlePetSoulUseDrug', 6904],
  reset: ['handlePetSoulResetDrug', 6905],
  atlas: ['handlePetSoulAtlasReward', 6906],
  dispatch: ['handlePetSoulDispatch', 6907],
  daily: ['handlePetSoulDailyReward', 6908],
  dispatchReward: ['handlePetSoulClaimDispatchReward', 6909],
  summon: ['handlePetSoulSummon', 6920],
  catch: ['handlePetSoulCatch', 6921],
  wish: ['handlePetSoulSetWish', 6922],
};
async function call(name, s, params = {}) {
  const [method, tag] = calls[name];
  const packets = await handler[method](params, s, 77);
  return { data: packet(packets, tag).data, packets };
}
const records = [];
async function test(id, invariant, run) {
  math.random = () => 0.5;
  try {
    const r = await run();
    records.push({ id, status: r.pass ? 'PASS' : 'FAIL', invariant, observed: r.observed });
  } catch (error) {
    records.push({ id, status: 'ERROR', invariant, error: error.stack });
  }
}

async function main() {
  await test('soul_confirm_unowned', 'Confirm without owned soul and wash cache must not create a free soul.', async () => {
    const s = session();
    const ownedBefore = Boolean(soul(s, highId));
    const r = await call('confirm', s, { id: highId });
    return { pass: r.data.result < 0 && !soul(s, highId), observed: { highId, ownedBefore, result: r.data.result, ownedAfter: Boolean(soul(s, highId)) } };
  });
  await test('soul_rejected_wash_unowned', 'Rejected wash must not add an unowned soul to in-memory player.', async () => {
    const s = session();
    const r = await call('wash', s, { id: highId, item: -1 });
    return { pass: r.data.result < 0 && !soul(s, highId), observed: { result: r.data.result, ownedAfter: Boolean(soul(s, highId)), items: s.player.items } };
  });
  await test('soul_wash_star_rollback', 'Saving a wash cache must preserve star upgrades performed after preview.', async () => {
    const s = session();
    s.player.items = { 261: 100, 263: 100 };
    const washed = await call('wash', s, { id: lowId, item: -1 });
    const upgraded = await call('star', s, { id: lowId, items: { 263: 100 } });
    const starBeforeConfirm = soul(s, lowId).star;
    await call('confirm', s, { id: lowId });
    return { pass: washed.data.result === 0 && upgraded.data.result === 0 && soul(s, lowId).star === starBeforeConfirm, observed: { washed: washed.data.result, upgraded: upgraded.data.result, starBeforeConfirm, starAfterConfirm: soul(s, lowId).star, material263After: s.player.items[263] } };
  });
  await test('soul_wash_drug_rollback', 'Saving a wash cache must preserve drugs consumed after preview.', async () => {
    const s = session();
    handler.grantPetSoulToPlayer(s.player, highId);
    s.player.items = { 261: 100, 5: 5 };
    await call('wash', s, { id: highId, item: -1 });
    const used = await call('drug', s, { id: highId, itemId: 5, count: 2 });
    const usageBeforeConfirm = copy(soul(s, highId).attrDrugUse);
    await call('confirm', s, { id: highId });
    return { pass: used.data.result === 0 && soul(s, highId).attrDrugUse[5] === 2, observed: { used: used.data.result, usageBeforeConfirm, usageAfterConfirm: soul(s, highId).attrDrugUse, item5After: s.player.items[5] } };
  });
  await test('soul_wash_restore_refunded_drugs', 'Saving a wash cache after drug reset must not restore already-refunded drug use.', async () => {
    const s = session();
    handler.grantPetSoulToPlayer(s.player, highId);
    soul(s, highId).attrDrugUse = { 5: 2 };
    s.player.items = { 261: 100, 1: 2000, 5: 0 }; // Synthetic legacy items[1] bypasses separate currency defect.
    await call('wash', s, { id: highId, item: -1 });
    const reset1 = await call('reset', s, { id: highId });
    await call('confirm', s, { id: highId });
    const restoredUsage = copy(soul(s, highId).attrDrugUse);
    const reset2 = await call('reset', s, { id: highId });
    return { pass: !restoredUsage[5] && reset2.data.result < 0, observed: { legacyCurrencyFixture: true, reset1: reset1.data.result, restoredUsage, reset2: reset2.data.result, refundedItem5: s.player.items[5] } };
  });
  await test('soul_wash_binding_rollback', 'Saving wash preview must preserve a newer pet binding.', async () => {
    const s = session();
    s.player.items = { 261: 100 };
    await call('wash', s, { id: lowId, item: -1 });
    await call('bind', s, { id: lowId, uid: 123 });
    await call('confirm', s, { id: lowId });
    return { pass: soul(s, lowId).petUid === 123, observed: { petUidAfterConfirm: soul(s, lowId).petUid } };
  });
  await test('soul_reset_real_currency', 'Drug reset with sufficient currencies.diamond must charge 1000 and return drugs.', async () => {
    const s = session();
    handler.grantPetSoulToPlayer(s.player, highId);
    soul(s, highId).attrDrugUse = { 5: 2 };
    s.player.currencies.diamond = 2000;
    const r = await call('reset', s, { id: highId });
    return { pass: r.data.result === 0 && s.player.currencies.diamond === 1000 && s.player.items[5] === 2, observed: { cost: tables.PetSoulBaseConfig.resetConsume, result: r.data.result, currencies: s.player.currencies, items: s.player.items, usage: soul(s, highId).attrDrugUse } };
  });
  await test('soul_summon_real_currency', 'Summoning with trans=1 and sufficient currencies.diamond must succeed.', async () => {
    const s = session();
    s.player.currencies.diamond = 2000;
    const r = await call('summon', s, { id: 258, trans: 1 });
    return { pass: r.data.result === 0 && s.player.currencies.diamond === 1900, observed: { cost: tables.PetSoulCallRateConfig[258].consume, result: r.data.result, currencies: s.player.currencies } };
  });
  await test('soul_wash_discount_item286', 'Wash privilege item286 must halve base cost, as active client getWashCost does.', async () => {
    const s = session();
    s.player.items = { 261: 100, 286: 1 };
    const baseCost = tables.PetSoulQualityConfig[tables.PetSoulConfig[lowId].quality].refiningCost.count;
    const r = await call('wash', s, { id: lowId, item: 286 });
    return { pass: r.data.result === 0 && 100 - s.player.items[261] === Math.ceil(baseCost / 2), observed: { result: r.data.result, clientExpectedCost: Math.ceil(baseCost / 2), charged: 100 - s.player.items[261], item286After: s.player.items[286] } };
  });
  await test('soul_wash_arbitrary_optional_item', 'Optional wash item must be a configured refining privilege, not any arbitrary inventory item.', async () => {
    const s = session();
    s.player.items = { 261: 100, 999: 1 };
    const r = await call('wash', s, { id: lowId, item: 999 });
    return { pass: r.data.result < 0 || s.player.items[999] === 1, observed: { result: r.data.result, item999After: s.player.items[999], baseItem261After: s.player.items[261], optionalItemConfigured: Boolean(tables.PetSoulSkillRefiningPrivilegeConfig && tables.PetSoulSkillRefiningPrivilegeConfig[999]) } };
  });
  await test('soul_wash_minimum_attr', 'Washed attributes must respect quality/special minPercent displayed by client.', async () => {
    const s = session();
    s.player.items = { 261: 100 };
    math.random = () => 0;
    const r = await call('wash', s, { id: lowId, item: -1 });
    const minPercent = tables.PetSoulRefiningConfig[3][0].minPercent;
    const actualMin = Math.min(...Object.values(r.data.cache.attrRatio));
    return { pass: actualMin >= minPercent, observed: { minPercent, actualMin, result: r.data.result } };
  });
  await test('soul_bind_missing_pet', 'Soul binding must reject petUid that is not owned.', async () => {
    const s = session();
    const r = await call('bind', s, { id: lowId, uid: 999999999 });
    return { pass: r.data.result < 0 && soul(s, lowId).petUid === -1, observed: { ownedPets: s.player.petInfo.pets.length, result: r.data.result, boundUid: soul(s, lowId).petUid } };
  });
  await test('soul_dispatch_atomic_rejection', 'A rejected multi-dispatch must not partially mutate the first entry.', async () => {
    const s = session();
    const r = await call('dispatch', s, { type: [1, 2], id: [lowId, 999999999] });
    return { pass: r.data.result < 0 && Object.keys(info(s).dispatch).length === 0, observed: { result: r.data.result, dispatchAfter: info(s).dispatch } };
  });
  await test('soul_catch_non_escape_failure', 'Failed first catch must not force escape when configured escape rate is zero.', async () => {
    const s = session();
    s.player.items = { 253: 2 };
    info(s).summon = [{ id: lowId, pos: 1, state: 0, round: 0 }];
    info(s).summonEndTime = Date.now() + 100000;
    math.random = () => 0.9999;
    const r = await call('catch', s, { id: 253, pos: 1 });
    const retry = await call('catch', s, { id: 253, pos: 1 });
    return { pass: r.data.catchData.state === 0 && retry.data.result >= 0, observed: { escapeCfg: tables.PetSoulEscapeRateConfig[3][1], stateAfterFirst: r.data.catchData.state, resultFirst: r.data.result, retryResult: retry.data.result, catchItemAfter: s.player.items[253] } };
  });
  await test('soul_catch_new_soul_client_sync', 'Catch success push6901 data must be an array so active client can append newly acquired soul.', async () => {
    const s = session();
    s.player.items = { 257: 1 };
    info(s).summon = [{ id: highId, pos: 1, state: 0, round: 0 }];
    info(s).summonEndTime = Date.now() + 100000;
    math.random = () => 0;
    const r = await call('catch', s, { id: 257, pos: 1 });
    const push = packet(r.packets, 6901);
    const clientList = [];
    clientList.push.apply(clientList, push.data.data); // Actual active sc_pet_soul_data_update semantics.
    return { pass: Array.isArray(push.data.data) && clientList.length === 1, observed: { catchState: r.data.catchData.state, serverHasSoul: Boolean(soul(s, highId)), payloadIsArray: Array.isArray(push.data.data), clientAddedCount: clientList.length } };
  });
  await test('soul_catch_loyalty_scalar', 'Catch RPC loyalty must be numeric for client updateLoyalty(id,response.loyalty).', async () => {
    const s = session();
    s.player.items = { 253: 1 };
    info(s).summon = [{ id: lowId, pos: 1, state: 0, round: 0 }];
    info(s).summonEndTime = Date.now() + 100000;
    math.random = () => 0;
    const r = await call('catch', s, { id: 253, pos: 1 });
    return { pass: typeof r.data.loyalty === 'number', observed: { loyalty: r.data.loyalty, clientBarNumber: Number.isFinite(Number(r.data.loyalty)) ? Number(r.data.loyalty) : 'NaN' } };
  });
  await test('soul_catch_expired', 'Expired summon must be rejected before consuming capture item.', async () => {
    const s = session();
    s.player.items = { 253: 1 };
    info(s).summon = [{ id: lowId, pos: 1, state: 0, round: 0 }];
    info(s).summonEndTime = Date.now() - 1000;
    math.random = () => 0;
    const r = await call('catch', s, { id: 253, pos: 1 });
    return { pass: r.data.result < 0 && s.player.items[253] === 1, observed: { result: r.data.result, catchState: r.data.catchData.state, catchItemAfter: s.player.items[253] } };
  });
  await test('soul_daily_reward_configured', 'Daily reward endpoint should have a configured reward row when the client can claim it.', async () => {
    const s = session();
    const r = await call('daily', s, {});
    return { pass: r.data.result === 0 && r.data.rewards && r.data.rewards.items.length > 0, observed: { result: r.data.result, configuredRows: tables.PetSoulBaseConfig.dailyReward || tables.PetSoulBaseConfig.dailyRewards || [], rewardInfo: r.data.rewards } };
  });
  await test('soul_dispatch_reward_progress', 'Dispatch must produce claimable cached reward progress.', async () => {
    const s = session();
    info(s).cachedRewardCount = 3;
    const r = await call('dispatchReward', s, {});
    return { pass: r.data.result === 0 && r.data.rewards.items.length > 0 && r.data.cacheRewardCount === 0, observed: { result: r.data.result, cachedBefore: 3, configuredRows: tables.PetSoulBaseConfig.dispatchReward || tables.PetSoulBaseConfig.dispatchRewards || [], cachedAfter: info(s).cachedRewardCount, rewards: r.data.rewards } };
  });
  await test('soul_star_insufficient_atomic', 'Insufficient upgrade materials must not debit or raise star.', async () => {
    const s = session();
    s.player.items = { 263: 10 };
    const r = await call('star', s, { id: lowId, items: { 263: 100 } });
    return { pass: r.data.result < 0 && soul(s, lowId).star === 0 && s.player.items[263] === 10, observed: { result: r.data.result, star: soul(s, lowId).star, item263: s.player.items[263] } };
  });
  await test('soul_wash_insufficient_atomic', 'Insufficient wash cost for an owned soul must not debit or create cache.', async () => {
    const s = session();
    s.player.items = { 261: 9 };
    const r = await call('wash', s, { id: lowId, item: -1 });
    return { pass: r.data.result < 0 && s.player.items[261] === 9 && info(s).cache.length === 0, observed: { result: r.data.result, item261: s.player.items[261], cacheCount: info(s).cache.length } };
  });
  await test('soul_summon_ticket_path', 'Ticket-funded summon should debit exactly one ticket and create 3 positions.', async () => {
    const s = session();
    s.player.items = { 258: 1 };
    const r = await call('summon', s, { id: 258, trans: 0 });
    return { pass: r.data.result === 0 && s.player.items[258] === 0 && info(s).summon.length === 3, observed: { result: r.data.result, ticketAfter: s.player.items[258], positions: info(s).summon.length } };
  });
  await test('soul_atlas_no_repeat', 'Atlas rewards can only be claimed once per owned soul.', async () => {
    const s = session();
    const first = await call('atlas', s, { id: lowId });
    const afterFirst = copy({ items: s.player.items, currencies: s.player.currencies });
    const second = await call('atlas', s, { id: lowId });
    return { pass: first.data.result === 0 && second.data.result < 0 && JSON.stringify(afterFirst) === JSON.stringify({ items: s.player.items, currencies: s.player.currencies }), observed: { resultFirst: first.data.result, resultSecond: second.data.result, rewardInfo: first.data.rewardInfo } };
  });
  const client = fs.readFileSync(clientPath, 'utf8');
  const snippets = ['getWashCost=function', 'getDataByCache=function', 'sc_pet_soul_data_update=function', '.Rpc(6921', '.Rpc(6905', 'havePetSoulNotCatchPetSoul=function'].map(pattern => {
    const offset = client.indexOf(pattern);
    return { pattern, offset, text: client.slice(offset, offset + 800) };
  });
  const result = {
    readOnly: true,
    directPlayerWrites: 0,
    verification: 'Actual production-source snapshot and matching active config/client, executed locally with isolated player sessions and stubbed savePlayer. Not production-player replay or browser end-to-end.',
    source: { path: source, sha256: sha(source) },
    dependencies: [configPath, clientPath, path.join(serverRoot, 'src/handlers/raid.js'), path.join(serverRoot, 'src/protocol/BinJsonUtil.js'), path.join(serverRoot, 'src/protocol/ByteArray.js')].map(p => ({ path: p, sha256: sha(p) })),
    fixture: { lowId, highId, stubbedSaveCalls: saves },
    summary: { total: records.length, pass: records.filter(r => r.status === 'PASS').length, fail: records.filter(r => r.status === 'FAIL').length, error: records.filter(r => r.status === 'ERROR').length },
    records,
    activeClientEvidence: snippets,
    notes: [
      'Only PetSoul* and AssetsConfig tables are decoded; no ConfigService initialization or DB dependency loaded.',
      'Drug double-refund reproduction uses synthetic legacy player.items[1] to bypass independently reproduced real-currency rejection; normal players without legacy item1 hit rejection first.',
      'PetSoulPillConfig local/live IDs 1..5 conflict with ordinary resource IDs, and only quality7 usageLimit is enabled. No migration or design intent inferred.',
      'Daily/dispatch reward config has no reward rows. Existing handlers fail closed; intended reward design not recoverable from this table.',
      'Star-up always succeeds above 60% minimum; call firstTimes/times pity and wish data are not used in RNG. Requires native probability/design confirmation before changes.',
    ],
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ output: outputPath, summary: result.summary, records: records.map(r => ({ id: r.id, status: r.status })) }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });

