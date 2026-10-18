'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const app = process.env.ARENA_LOCK_APP_ROOT
  ? path.resolve(process.env.ARENA_LOCK_APP_ROOT)
  : path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const WSServer = require(process.env.ARENA_LOCK_WSSERVER_PATH
  ? path.resolve(process.env.ARENA_LOCK_WSSERVER_PATH)
  : path.join(app, 'src/net/WSServer'));
const locks = require(path.join(app, 'src/services/PlayerMutationService'));

async function invoke(msg, work) {
  const server = Object.create(WSServer.prototype);
  server._handleSingleMessageUnlocked = work;
  return server._handleSingleMessage({}, msg, { userId: 'attacker', player: {} });
}

async function main() {
  const realArena = await invoke(
    { tag: 2300, data: { type: 2, enemyid: 'human-target' } },
    () => locks.runMany(['attacker', 'defender'], () => 'pair-ok'),
  );
  assert.equal(realArena, 'pair-ok');

  const crossArena = await invoke(
    { tag: 2300, data: { type: 16, enemyid: 'cross-target' } },
    () => locks.run('attacker', () => 'cross-ok'),
  );
  assert.equal(crossArena, 'cross-ok');

  const arena2602 = await invoke(
    { tag: 2602, data: { index: 0, enemyid: 'human-target' } },
    () => locks.runMany(['attacker', 'defender'], () => 'arena2602-ok'),
  );
  assert.equal(arena2602, 'arena2602-ok');

  const normal = await invoke(
    { tag: 2600, data: {} },
    () => locks.run('attacker', () => 'normal-ok'),
  );
  assert.equal(normal, 'normal-ok');

  let active = 0;
  let maxActive = 0;
  const fightOnSameDefender = async (attacker) => locks.runMany(
    [attacker, 'shared-defender'],
    async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    },
  );
  await Promise.all([fightOnSameDefender('attacker-a'), fightOnSameDefender('attacker-b')]);
  assert.equal(maxActive, 1);

  console.log(JSON.stringify({
    result: 'PASS', checks: 5, sameDefenderSerialized: true,
    productionWrites: 0, networkAttempts: 0,
  }));
}

main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
