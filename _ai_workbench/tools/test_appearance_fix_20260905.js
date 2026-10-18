'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const APP = path.resolve(process.env.LHS_APP_ROOT || path.join(ROOT, 'linhhoasu/lhs/newServer'));
const CONFIG = path.resolve(process.env.CONFIG_BIN_PATH
  || path.join(ROOT, 'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'));
process.env.CONFIG_BIN_PATH = CONFIG;

const config = require(path.join(APP, 'src/services/ConfigService'));
const playerService = require(path.join(APP, 'src/services/PlayerService'));
const item = require(path.join(APP, 'src/handlers/item'));
const mail = require(path.join(APP, 'src/handlers/mail'));
const fashion = require(path.join(APP, 'src/handlers/fashion'));
const activity = require(path.join(APP, 'src/handlers/activity'));
const official = require(path.join(APP, 'src/handlers/official-compat'));
const rewardGrant = require(path.join(APP, 'src/services/RewardGrantService'));
const appearance = require(path.join(APP, 'src/services/RoleAppearanceService'));

playerService.savePlayer = async (_userId, player) => player;

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function row(table, id) {
  return object(table)[id] || object(table)[String(id)] || null;
}

function basePlayer() {
  return {
    userId: 'appearance-fixture',
    playerId: 'appearance-fixture',
    name: 'appearance-fixture',
    level: 999,
    roleInfo: { kungfuId: 4, subJob: 0 },
    items: {},
    currencies: { diamond: 1000000000, silver: 1000000000, gold: 1000000000 },
    fashionInfo: {
      curFashion: {}, fashion: {}, fashionMap: {}, fashions: {}, activateFashion: [],
      fashionData: [], suits: {}, suitColors: {}, starUp: {}, dress: [], sets: [], setId: 0,
      emoji: {}, emojiGroups: [],
    },
    formationInfo: {},
    swordInfo: {},
    spiritInfo: {},
    artifactInfo: {},
    petInfo: {},
    petSoulInfo: {},
    equipInfo: { equipList: [], openList: [], setInfoMap: {}, curIndex: 0 },
    shopInfo: { buyRecords: {} },
    activityInfo: { datas: [], giftCodeRecords: {} },
  };
}

function findPacket(result, tag) {
  return (Array.isArray(result) ? result : [result]).find((packet) => packet && packet.tag === tag) || null;
}

function fashionOwned(player, id) {
  return number(object(player.fashionInfo).fashions && object(player.fashionInfo).fashions[String(id)]) > 0
    || array(object(player.fashionInfo).activateFashion).map(number).includes(id);
}

function expectedFamily(id, tables) {
  if (row(tables.FormationConfig, id)) return 'formation';
  if (row(tables.SwordConfig, id) || row(tables.SpecialSwordConfig, id)) return 'sword';
  if (row(tables.ArtifactConfig, id)) return 'artifact';
  if (row(tables.SpecialArtifactConfig, id)) return 'specialArtifact';
  if (row(tables.SpiritConfig, id)) return 'spirit';
  if (row(tables.PetConfig, id)) return 'pet';
  if (row(tables.PetSoulConfig, id)) return 'petSoul';
  if (row(tables.FashionConfig, id)) return 'fashion';
  if (row(tables.FashionDressConfig, id)) return 'dressItem';
  return 'item';
}

function validateGrant(player, id, expected, tables) {
  if (row(tables.FashionConfig, id)) {
    assert.equal(fashionOwned(player, id), true, `fashion ownership ${id}`);
    const duration = number(object(row(tables.FashionConfig, id).condition)['10']);
    if (duration > 0) {
      const data = array(player.fashionInfo.fashionData).find((entry) => number(entry && entry.id) === id);
      assert.ok(data, `timed data ${id}`);
      assert.ok(number(object(data.limitValues)['10']) > Math.floor(Date.now() / 1000), `timed expiry ${id}`);
    }
  }
  if (expected === 'formation') assert.ok(array(player.formationInfo.owns).includes(id), `formation ${id}`);
  if (expected === 'sword') assert.ok(array(player.swordInfo.data).length > 0, `sword ${id}`);
  if (expected === 'artifact' || expected === 'specialArtifact') {
    assert.ok(array(player.artifactInfo.artifacts).length > 0, `artifact ${id}`);
  }
  if (expected === 'spirit') {
    assert.ok(array(player.spiritInfo.owns).includes(id), `spirit ${id}`);
    assert.ok(number(player.items[id]) > 0, `spirit item state ${id}`);
  }
  if (expected === 'pet') assert.ok(array(player.petInfo.pets).length > 0, `pet ${id}`);
  if (expected === 'petSoul') {
    const info = object(object(player.other_attr_info).petSoulInfo);
    assert.ok(array(info.petSouls).length > 0 || Object.keys(object(info.petSoulMap)).length > 0, `petSoul ${id}`);
  }
  if (expected === 'dressItem') assert.ok(number(player.items[id]) > 0, `dress item ${id}`);
}

async function main() {
  const tables = config.loadAllTables(CONFIG);
  const sourceTables = [
    'FashionConfig', 'FashionDressConfig', 'FormationConfig', 'SwordConfig',
    'ArtifactConfig', 'SpecialArtifactConfig', 'SpiritConfig', 'PetConfig',
    'PetSoulConfig', 'SpecialSwordConfig',
  ];
  const ids = new Set();
  sourceTables.forEach((name) => Object.values(object(tables[name])).forEach((cfg) => {
    const id = number(cfg && cfg.id);
    if (id > 0) ids.add(id);
  }));

  const failures = [];
  const familyCounts = {};
  for (const id of [...ids].sort((left, right) => left - right)) {
    const expected = expectedFamily(id, tables);
    familyCounts[expected] = (familyCounts[expected] || 0) + 1;
    try {
      const player = basePlayer();
      item.addRewardRowsToPlayer(player, [{ id, count: 1 }], 1);
      validateGrant(player, id, expected, tables);
    } catch (error) {
      failures.push({ id, expected, error: error.message });
    }
  }
  assert.deepEqual(failures, []);

  let suitItemChecks = 0;
  let suitEquipChecks = 0;
  let suitVariantChecks = 0;
  let suitStarChecks = 0;
  for (const dress of Object.values(object(tables.FashionDressConfig))) {
    const dressId = number(dress && dress.id);
    const use = row(tables.AssetsUseConfig, dressId);
    if (use) {
      const player = basePlayer();
      player.items[dressId] = 1;
      const used = await item.handleUseItem(
        { id: dressId, count: 1 }, { userId: 'fixture', player }, 10000 + dressId,
      );
      assert.equal(findPacket(used, 1300).data.result, 0, `use suit ${dressId}`);
      const baseIds = array(use.rewards).map((entry) => number(entry && entry.id)).filter((id) => id > 0);
      assert.equal(baseIds.every((id) => fashionOwned(player, id)), true, `suit pieces ${dressId}`);
      suitItemChecks += 1;
      const equipped = await fashion.handleChangeSuit(
        { id: dressId, color: 0, set: 0 }, { userId: 'fixture', player }, 20000 + dressId,
      );
      assert.equal(findPacket(equipped, 1802).data.result, 0, `equip suit ${dressId}`);
      assert.equal(baseIds.every((id) => Object.values(player.fashionInfo.fashion).map(number).includes(id)), true, `equip pieces ${dressId}`);
      suitEquipChecks += 1;
    }

    const isSuit = number(dress && dress.isSuit);
    let variants = {};
    if (isSuit === 0) variants = object(row(tables.FashionColorConfig, dressId));
    if (isSuit === 1) variants = object(row(tables.FashionDressLevelConfig, dressId));
    if (isSuit === 2) variants = object(row(tables.FashionChangeColorConfig, dressId));
    if (isSuit === 3) variants = object(row(tables.FashionBathConfig, dressId));
    if (use && (isSuit === 0 || isSuit === 2 || isSuit === 3)) {
      for (const [colorKey, variant] of Object.entries(variants)) {
        const color = number(colorKey);
        if ((isSuit === 0 || isSuit === 3) && color === 0) continue;
        const targetIds = array(variant && variant.fashionIds).map(number).filter((id) => id > 0);
        if (targetIds.length <= 0) continue;
        const player = basePlayer();
        if (isSuit === 0 || isSuit === 3) {
          const baseVariant = variants['0'] || variants[0];
          array(baseVariant && baseVariant.fashionIds).forEach((id) => rewardGrant.grantFashionToPlayer(player, number(id)));
        }
        const cost = variant.cost || variant.costReplace || null;
        if (cost && number(cost.id) > 0) {
          if ([1, 2, 6].includes(number(cost.id))) {
            const key = number(cost.id) === 1 ? 'diamond' : (number(cost.id) === 2 ? 'silver' : 'gold');
            player.currencies[key] = number(cost.count);
          } else {
            player.items[number(cost.id)] = number(cost.count);
          }
        }
        const unlocked = await fashion.handleSuitColorUnlock(
          { id: dressId, color, replace: 0 }, { userId: 'fixture', player }, 30000 + dressId + color,
        );
        assert.equal(findPacket(unlocked, 1803).data.result, 0, `unlock suit color ${dressId}:${color}`);
        assert.ok(findPacket(unlocked, 1800), `fashion sync suit color ${dressId}:${color}`);
        assert.equal(targetIds.every((id) => fashionOwned(player, id)), true, `own suit color ${dressId}:${color}`);
        suitVariantChecks += 1;
      }
    }
    if (isSuit === 1 && use) {
      const levels = Object.keys(variants).map(number).filter((level) => level > 0).sort((a, b) => a - b);
      if (levels.length > 0) {
        const player = basePlayer();
        player.items[dressId] = 1;
        await item.handleUseItem({ id: dressId, count: 1 }, { userId: 'fixture', player }, 40000 + dressId);
        Object.values(variants).forEach((variant) => {
          array(variant && variant.consumes).forEach((cost) => {
            player.items[number(cost && cost.id)] = 1000000;
          });
        });
        player.items[800] = 1000000;
        for (const star of levels) {
          const upgraded = await fashion.handleDressStarUp(
            { id: dressId, star }, { userId: 'fixture', player }, 50000 + dressId + star,
          );
          assert.equal(findPacket(upgraded, 1804).data.result, 0, `star suit ${dressId}:${star}`);
          assert.equal(array(player.fashionInfo.dress).some((entry) => number(entry.id) === dressId && number(entry.star) === star), true);
          assert.equal(array(variants[String(star)].fashionIds).every((id) => fashionOwned(player, number(id))), true);
          suitStarChecks += 1;
        }
      }
    }
  }

  const routeIds = [11201, 21001, 21101, 22101, 23101, 24001, 24101, 28001];
  for (const id of routeIds) {
    const expected = expectedFamily(id, tables);
    const activityPlayer = basePlayer();
    const activityReward = activity.grantRewardRows(activityPlayer, [{ id, count: 1 }]);
    validateGrant(activityPlayer, id, expected, tables);
    assert.ok(
      array(activityReward.fashion).length > 0 || array(activityReward.formations).length > 0
        || array(activityReward.swords).length > 0 || array(activityReward.artifacts).length > 0
        || array(activityReward.spirits).length > 0,
      `activity route ${id}`,
    );

    const mailPlayer = basePlayer();
    const directFashion = mail.grantMailFashion(mailPlayer, { id, count: 1 });
    if (!directFashion) rewardGrant.grantRewardRow(mailPlayer, { id, count: 1 }, 1);
    validateGrant(mailPlayer, id, expected, tables);
  }

  const timed = basePlayer();
  rewardGrant.grantFashionToPlayer(timed, 11201);
  const timedData = array(timed.fashionInfo.fashionData).find((entry) => number(entry && entry.id) === 11201);
  assert.ok(number(object(timedData.limitValues)['10']) > Math.floor(Date.now() / 1000));
  const permanent = basePlayer();
  rewardGrant.grantFashionToPlayer(permanent, 1101);
  const permanentExpire = await official.handleFashionExpired({ ids: [1101] }, { userId: 'fixture', player: permanent }, 1);
  assert.deepEqual(permanentExpire.data.ids, []);
  assert.equal(fashionOwned(permanent, 1101), true);
  timedData.limitValues['10'] = Math.floor(Date.now() / 1000) - 1;
  const actualExpire = await official.handleFashionExpired({ ids: [] }, { userId: 'fixture', player: timed }, 2);
  assert.deepEqual(actualExpire.data.ids, [11201]);
  assert.equal(fashionOwned(timed, 11201), false);
  const legacyTimed = basePlayer();
  legacyTimed.fashionInfo.fashions['11201'] = 1;
  legacyTimed.fashionInfo.activateFashion.push(11201);
  appearance.ensureRoleAppearance(legacyTimed);
  assert.ok(array(legacyTimed.fashionInfo.fashionData).some((entry) => number(entry && entry.id) === 11201));

  const unauthorized = basePlayer();
  const deniedFashion = await fashion.handleChangeFashion(
    { id: 11290, type: 101, set: 0 }, { userId: 'fixture', player: unauthorized }, 3,
  );
  assert.equal(deniedFashion.data.result, -1);
  assert.equal(fashionOwned(unauthorized, 11290), false);

  const suitPlayer = basePlayer();
  suitPlayer.items[28010] = 1;
  const usedSuit = await item.handleUseItem({ id: 28010, count: 1 }, { userId: 'fixture', player: suitPlayer }, 4);
  assert.equal(findPacket(usedSuit, 1300).data.result, 0);
  const suitPieces = array(row(tables.AssetsUseConfig, 28010).rewards).map((entry) => number(entry.id));
  assert.equal(suitPieces.every((id) => fashionOwned(suitPlayer, id)), true);
  const equippedSuit = await fashion.handleChangeSuit(
    { id: 28010, color: 0, set: 0 }, { userId: 'fixture', player: suitPlayer }, 5,
  );
  assert.equal(findPacket(equippedSuit, 1802).data.result, 0);
  assert.equal(suitPieces.every((id) => Object.values(suitPlayer.fashionInfo.fashion).map(number).includes(id)), true);

  const colorPlayer = basePlayer();
  colorPlayer.items[29800] = 1;
  await item.handleUseItem({ id: 29800, count: 1 }, { userId: 'fixture', player: colorPlayer }, 6);
  const deniedColor = await fashion.handleSuitColorUnlock(
    { id: 29800, color: 1, replace: 0 }, { userId: 'fixture', player: colorPlayer }, 7,
  );
  assert.equal(findPacket(deniedColor, 1803).data.result, -1);
  colorPlayer.items[50] = 30;
  const unlockedColor = await fashion.handleSuitColorUnlock(
    { id: 29800, color: 1, replace: 0 }, { userId: 'fixture', player: colorPlayer }, 8,
  );
  assert.equal(findPacket(unlockedColor, 1803).data.result, 0);
  assert.ok(findPacket(unlockedColor, 1800));
  assert.equal(number(colorPlayer.items[50]), 0);
  assert.equal(array(row(tables.FashionBathConfig, 29800)['1'].fashionIds).every((id) => fashionOwned(colorPlayer, number(id))), true);

  const starPlayer = basePlayer();
  starPlayer.items[28060] = 1;
  await item.handleUseItem({ id: 28060, count: 1 }, { userId: 'fixture', player: starPlayer }, 9);
  const invalidStar = await fashion.handleDressStarUp(
    { id: 28060, star: 999 }, { userId: 'fixture', player: starPlayer }, 10,
  );
  assert.equal(findPacket(invalidStar, 1804).data.result, -1);
  starPlayer.items[806] = 100;
  const starUp = await fashion.handleDressStarUp(
    { id: 28060, star: 1 }, { userId: 'fixture', player: starPlayer }, 11,
  );
  assert.equal(findPacket(starUp, 1804).data.result, 0);
  assert.equal(number(starPlayer.items[806]), 0);
  assert.equal(array(starPlayer.fashionInfo.dress).some((entry) => number(entry.id) === 28060 && number(entry.star) === 1), true);
  assert.equal(array(row(tables.FashionDressLevelConfig, 28060)['1'].fashionIds).every((id) => fashionOwned(starPlayer, number(id))), true);

  const invalidEmoji = await fashion.handlePurchaseEmojiGroup(
    { group: 999 }, { userId: 'fixture', player: basePlayer() }, 12,
  );
  assert.equal(findPacket(invalidEmoji, 1810).data.result, -1);

  const normalized = basePlayer();
  normalized.fashionInfo.dress = { 28060: { id: 28060, star: 1 } };
  normalized.fashionInfo.emoji = [];
  const normalizedInfo = fashion.ensureFashionInfo(normalized);
  assert.equal(Array.isArray(normalizedInfo.dress), true);
  assert.equal(Array.isArray(normalizedInfo.emoji), false);

  const sync = rewardGrant.buildAppearanceSyncPackets(suitPlayer, {
    fashion: [{ id: 28012 }], formations: [{ id: 21001 }],
  });
  assert.ok(sync.some((packet) => packet.tag === 1800));
  assert.ok(sync.some((packet) => packet.tag === 3000 && packet.data.info));

  console.log(JSON.stringify({
    result: 'PASS',
    catalogIds: ids.size,
    failures: failures.length,
    familyCounts,
    routeIds: routeIds.length,
    suitItemChecks,
    suitEquipChecks,
    suitVariantChecks,
    suitStarChecks,
    checks: 31 + suitItemChecks + suitEquipChecks + suitVariantChecks + suitStarChecks,
  }));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
