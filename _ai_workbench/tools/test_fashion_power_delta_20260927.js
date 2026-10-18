'use strict';

// Read-only/RAM-only diagnostic: changing an already activated suit must not
// change combat power; activating a new suit must. No network or player writes.
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const config = require(path.join(root, 'src/services/ConfigService'));
const tables = config.loadAllTables();
const battle = require(path.join(root, 'src/services/BattleService'));
const appearance = require(path.join(root, 'src/services/RoleAppearanceService'));
const fashion = require(path.join(root, 'src/handlers/fashion'));
const playerService = require(path.join(root, 'src/services/PlayerService'));

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function basePlayer() {
  return {
    userId: 'fashion-power-diagnostic', playerId: 'fashion-power-diagnostic', name: 'DIAGNOSTIC', level: 120,
    roleInfo: { kungfuId: 8, subJob: 1 }, items: {}, currencies: { diamond: 0, silver: 0, gold: 0 },
    fashionInfo: { curFashion: {}, fashion: {}, fashionMap: {}, equipped: {}, fashions: {}, activateFashion: [], fashionData: [], sets: [], setId: 0, suits: {} },
  };
}
function suitParts(dressId, color = 0) {
  const dress = tables.FashionDressConfig[dressId];
  assert(dress, `missing dress ${dressId}`);
  const tableName = ['FashionColorConfig', 'FashionDressLevelConfig', 'FashionChangeColorConfig', 'FashionBathConfig', 'FashionEndDressConfig'][dress.isSuit];
  const table = tables[tableName] && tables[tableName][dressId];
  const row = dress.isSuit === 4 ? table : table && table[color];
  assert(row && Array.isArray(row.fashionIds) && row.fashionIds.length, `missing parts ${dressId}/${color}`);
  return row.fashionIds.map(Number);
}
function activate(player, ids) { ids.forEach((id) => appearance.grantFashionOwnership(player, id)); }
function power(player) { return { attrs: battle.calcPlayerPower(player), display: require(path.join(root, 'src/services/ArenaReadModelService')).displayPower(battle.calcPlayerPower(player)) }; }

async function main() {
  const oldSave = playerService.savePlayer;
  playerService.savePlayer = async (_userId, player) => player;
  try {
    const player = basePlayer();
    const suitA = suitParts(28340, 0);
    const suitB = suitParts(28410, 0);
    activate(player, [...suitA, ...suitB]);
    // The real login path normalizes role defaults before any outfit RPC.
    appearance.ensureRoleAppearance(player);
    const session = { userId: player.userId, player };
    const before = power(player);
    const wearA = await fashion.handleChangeSuit({ id: 28340, color: 0, set: 0 }, session, 9001);
    const afterA = power(session.player);
    const wearB = await fashion.handleChangeSuit({ id: 28410, color: 0, set: 0 }, session, 9002);
    const afterB = power(session.player);
    assert.equal((Array.isArray(wearA) ? wearA : [wearA]).find((x) => x.tag === 1802).data.result, 0);
    assert.equal((Array.isArray(wearB) ? wearB : [wearB]).find((x) => x.tag === 1802).data.result, 0);
    assert.deepEqual(afterA, before, 'wearing activated suit A must not alter power');
    assert.deepEqual(afterB, before, 'wearing activated suit B must not alter power');

    const unactivated = basePlayer();
    const noFashion = power(unactivated);
    activate(unactivated, suitB);
    const activated = power(unactivated);
    assert.notEqual(activated.display, noFashion.display, 'activation must alter power');
    console.log(JSON.stringify({
      result: 'PASS', readOnly: true, productionWrites: 0, networkAttempts: 0,
      suitA: { id: 28340, parts: suitA }, suitB: { id: 28410, parts: suitB },
      activatedPower: activated.display, noFashionPower: noFashion.display,
      wearPower: { before: before.display, afterA: afterA.display, afterB: afterB.display },
      activatedAttrsDelta: Object.fromEntries(Object.keys(activated.attrs).filter((k) => activated.attrs[k] !== noFashion.attrs[k]).map((k) => [k, activated.attrs[k] - noFashion.attrs[k]])),
    }));
  } finally { playerService.savePlayer = oldSave; }
}
main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
