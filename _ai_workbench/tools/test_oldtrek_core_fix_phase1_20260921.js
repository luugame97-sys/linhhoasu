'use strict';

const assert = require('assert/strict');
const playerService = require('../../linhhoasu/lhs/newServer/src/services/PlayerService');
playerService.savePlayer = async (_userId, player) => player;

const oldTrek = require('../../linhhoasu/lhs/newServer/src/handlers/old-trek');

function freshSession() {
  const player = {
    userId: 'oldtrek_phase1_ram',
    playerId: 'oldtrek_phase1_player',
    name: 'OldTrek Phase1 QA',
    level: 100,
    currencies: { gold: 0, silver: 0, diamond: 0 },
    items: { 321: 1000, 339: 0 },
    other_attr_info: {},
  };
  oldTrek.ensureOldTrekInfo(player);
  return { userId: player.userId, player };
}

function info(session) {
  return session.player.other_attr_info.oldTrekInfo;
}

async function start(session, id = 1, diff = 1) {
  const result = await oldTrek.handleOldTrekInfo({ id, diff }, session, 1);
  return Array.isArray(result) ? result[0] : result;
}

async function action(session, tag, params = {}) {
  const response = await oldTrek.handleOldTrekAction(tag, params, session, 2);
  return Array.isArray(response) ? response[0] : response;
}

async function main() {
  const results = [];

  {
    const session = freshSession();
    const response = await start(session, 2, 1);
    assert.equal(response.data.result, 1);
    assert.equal(response.data.code, 'OLD_TREK_DESTINATION_LOCKED');
    assert.equal(info(session).sailing, false);
    results.push('7000 rejects locked destination');
  }

  {
    const session = freshSession();
    const response = await start(session);
    assert.equal(response.data.result, 0);
    assert.equal(info(session).sailing, true);
    const second = await start(session);
    assert.equal(second.data.result, 1);
    assert.equal(second.data.code, 'OLD_TREK_ALREADY_SAILING');
    results.push('7000 rejects a second active trek');
  }

  {
    const session = freshSession();
    await start(session);
    info(session).sailInfo.trekData.lastUpdateTime = Date.now() - 3 * 60 * 60 * 1000;
    const response = await action(session, 7001, { multi: 1 });
    assert.equal(response.data.result, 0);
    assert(Math.abs(response.data.updateData.dist - 800) < 0.01);
    results.push('7001 checkpoints elapsed distance before accelerate');
  }

  {
    const session = freshSession();
    await start(session);
    const response = await action(session, 7005, { uid: info(session).sailInfo.trekData.uid });
    assert.equal(response.data.result, 1);
    assert.equal(response.data.code, 'OLD_TREK_NOT_ARRIVED');
    assert.equal(info(session).sailing, true);
    assert.equal(session.player.items[339] || 0, 0);
    results.push('7005 rejects early settlement');
  }

  {
    const session = freshSession();
    await start(session);
    info(session).sailInfo.trekData.lastUpdateTime = Date.now() - 13 * 60 * 60 * 1000;
    const response = await action(session, 7005, { uid: info(session).sailInfo.trekData.uid });
    assert.equal(response.data.result, 0);
    assert.equal(info(session).sailing, false);
    assert.equal(session.player.items[339], 50000);
    results.push('7005 settles only after authoritative arrival');
  }

  {
    const session = freshSession();
    const response = await action(session, 7009, { id: 2, diff: 1 });
    assert.equal(response.data.result, 1);
    assert.equal(response.data.code, 'OLD_TREK_DESTINATION_LOCKED');
    assert.equal(session.player.items[321], 1000);
    results.push('7009 rejects sweep of locked destination');
  }

  {
    const session = freshSession();
    const oldInfo = info(session);
    oldInfo.dest.push({ id: 2, taskClaimed: [], rewardClaimed: [] });
    session.player.currencies.diamond = 50;
    const response = await start(session, 2, 1);
    assert.equal(response.data.result, 0);
    assert.equal(session.player.currencies.diamond, 50);
    results.push('7000 preserves zero-cost destination-2 start after unlock record');
  }

  {
    const session = freshSession();
    const oldInfo = info(session);
    oldInfo.dest.push({ id: 1, taskClaimed: [], rewardClaimed: [] });
    oldInfo.taskRecord['10105'] = 999999;
    const response = await start(session, 1, 2);
    assert.equal(response.data.result, 1);
    assert.equal(response.data.code, 'OLD_TREK_DESTINATION_LOCKED');
    results.push('7000 uses native Score task type for difficulty gate');
  }

  {
    const session = freshSession();
    info(session).taskRecord['10104'] = 50000;
    session.player.currencies.diamond = 50;
    const response = await start(session, 1, 2);
    assert.equal(response.data.result, 0);
    assert.equal(session.player.currencies.diamond, 0);
    results.push('native Score=4 positive fixture unlocks difficulty and charges cost');
  }

  console.log(JSON.stringify({ status: 'PASS', checks: results.length, results }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
