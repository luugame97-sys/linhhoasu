'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const arena = require(path.join(appRoot, 'src/handlers/arena'));
const playerService = require(path.join(appRoot, 'src/services/PlayerService'));

async function testLedgerSanitizer() {
  const dummyPlayer = {
    userId: 'u_test_sanitizer',
    arenaReceiptLedger: [],
  };

  // Simulate an entry with a bloated targetScore.document
  const giantDoc = {
    _id: 'some_id',
    name: 'GiantDefender',
    items: { '1': 1000, '2': 5000 },
    hugeBlob: 'X'.repeat(500000), // 500 KB blob
  };

  const bloatedEntry = {
    id: 'receipt_test_1',
    createdAt: Date.now(),
    action: 'fight',
    score: 1200,
    scorechange: 15,
    targetScore: {
      fightId: 'fight_1',
      targetPlayerId: 'p_defender_1',
      targetServerId: 1006,
      scoreBefore: 1100,
      scoreAfter: 1085,
      scoreChange: -15,
      status: 'done',
      document: giantDoc, // this should be stripped!
    },
  };

  arena.rememberArenaLedger(dummyPlayer, bloatedEntry);

  assert.equal(dummyPlayer.arenaReceiptLedger.length, 1);
  const stored = dummyPlayer.arenaReceiptLedger[0];
  assert.equal(stored.id, 'receipt_test_1');
  assert.ok(stored.targetScore, 'targetScore should exist');
  assert.equal(stored.targetScore.scoreBefore, 1100);
  assert.equal(stored.targetScore.scoreAfter, 1085);
  assert.equal(stored.targetScore.scoreChange, -15);
  assert.equal(stored.targetScore.targetPlayerId, 'p_defender_1');
  assert.equal(stored.targetScore.status, 'done');
  assert.equal(stored.targetScore.document, undefined, 'targetScore.document MUST BE STRIPPED!');

  const jsonLen = JSON.stringify(stored).length;
  assert.ok(jsonLen < 1000, `Stored entry size should be small (<1KB), got ${jsonLen} bytes`);

  console.log(JSON.stringify({
    result: 'PASS',
    test: 'testLedgerSanitizer',
    documentStripped: true,
    storedEntryBytes: jsonLen,
  }));
}

async function testLegacyAndSaveBoundarySanitizer() {
  const legacy = {
    id: 'legacy_receipt',
    fightId: 'legacy_fight',
    scorechange: 12,
    targetScore: {
      targetPlayerId: 'legacy_target',
      scoreBefore: 1000,
      scoreAfter: 988,
      document: { arenaReceiptLedger: [{ document: { huge: 'X'.repeat(200000) } }] },
    },
  };
  const player = { arenaReceiptLedger: [legacy] };
  assert.equal(arena.sanitizeArenaLedgerList(player.arenaReceiptLedger), player.arenaReceiptLedger);
  assert.equal(player.arenaReceiptLedger[0].targetScore.document, undefined);
  assert.equal(player.arenaReceiptLedger[0].targetScore.scoreAfter, 988);

  const saveBoundary = {
    arenaReceiptLedger: [{
      id: 'save_boundary',
      targetScore: { targetPlayerId: 'p', document: { huge: 'X'.repeat(200000) }, scoreChange: -3 },
    }],
  };
  assert.equal(playerService.sanitizeArenaReceiptLedger(saveBoundary), true);
  assert.equal(saveBoundary.arenaReceiptLedger[0].targetScore.document, undefined);
  assert.equal(saveBoundary.arenaReceiptLedger[0].targetScore.scoreChange, -3);
  console.log(JSON.stringify({ result: 'PASS', test: 'testLegacyAndSaveBoundarySanitizer', documentStripped: true }));
}

Promise.resolve().then(testLedgerSanitizer).then(testLegacyAndSaveBoundarySanitizer).catch((err) => {
  console.error(err);
  process.exit(1);
});
