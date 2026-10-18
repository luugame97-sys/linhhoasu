'use strict';

// Contract-only test for tag3210.  The save service is stubbed; no player or
// database write is allowed.  It covers the failure path used by read-only
// mount previews and the unchanged owned equip path.
const assert = require('node:assert/strict');
const mount = require('../../linhhoasu/lhs/newServer/src/handlers/mount');
const playerService = require('../../linhhoasu/lhs/newServer/src/services/PlayerService');

const originalSave = playerService.savePlayer;
let saveCalls = 0;
playerService.savePlayer = async () => { saveCalls += 1; };

async function main() {
  const rejectedPlayer = {
    swordInfo: {
      skinId: 22101,
      unlockedSwords: [],
      // Deliberately omit the rest of the legacy arrays. A rejected request
      // must not invoke ensureMountInfo and repair this object in-session.
    },
  };
  const before = JSON.stringify(rejectedPlayer);
  const rejected = await mount.handleMountEquipSkin(
    { id: 22102 },
    { userId: 'preview-fixture', player: rejectedPlayer },
    701,
  );
  assert.equal(rejected.tag, 3210);
  assert.equal(rejected.msgUid, 701);
  assert.equal(rejected.data.result, -1);
  assert.equal(rejected.data.reason, 'MOUNT_SKIN_NOT_OWNED');
  assert.equal(rejected.data.skinId, 22101);
  assert.equal(JSON.stringify(rejectedPlayer), before, 'rejected preview mutated session mount state');
  assert.equal(saveCalls, 0, 'rejected preview called savePlayer');

  const ownedPlayer = {
    swordInfo: {
      skinId: 22101,
      unlockedSwords: [22102],
      data: [],
    },
  };
  const accepted = await mount.handleMountEquipSkin(
    { id: 22102 },
    { userId: 'preview-fixture', player: ownedPlayer },
    702,
  );
  assert.equal(accepted.tag, 3210);
  assert.equal(accepted.msgUid, 702);
  assert.equal(accepted.data.result, 0);
  assert.equal(accepted.data.skinId, 22102);
  assert.equal(saveCalls, 1, 'owned equip did not use the normal save path');

  console.log(JSON.stringify({ result: 'PASS', rejectedNoWrite: true, ownedSaveCalls: saveCalls, productionWrites: 0 }));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(() => {
  playerService.savePlayer = originalSave;
});
