'use strict';

const assert = require('assert/strict');
process.env.ARENA_ALLOW_MEMORY_RECEIPTS = '1';
(async () => {
const arena = require('../../linhhoasu/lhs/newServer/src/handlers/arena');
const Account = require('../../linhhoasu/lhs/newServer/src/db/models/Account');
const Player = require('../../linhhoasu/lhs/newServer/src/db/models/Player');
const ArenaFightLog = require('../../linhhoasu/lhs/newServer/src/db/models/ArenaFightLog');
const playerService = require('../../linhhoasu/lhs/newServer/src/services/PlayerService');
const rank = require('../../linhhoasu/lhs/newServer/src/services/RankService');

const query = (value) => ({
  select() { return this; },
  limit() { return this; },
  maxTimeMS() { return this; },
  lean: async () => value,
  exec: async () => value,
});

const target = {
  _id: '6a0000000000000000000002',
  userId: 'u_target', playerId: 'p_target', name: 'Target', level: 120,
  arenaScore: 1400, roleInfo: { kungfuId: 1, subJob: 0, stageId: 1 },
  equipInfo: {}, formationInfo: {}, fashionInfo: {}, petInfo: {},
  other_attr_info: {}, items: {}, currencies: { silver: 0, diamond: 0, gold: 0 },
};
const player = {
  _id: '6a0000000000000000000001',
  userId: 'u_self', playerId: 'p_self', name: 'Self', level: 120,
  arenaScore: 1000, arenaDailyCount: 0, arenaDayKey: '2026-09-12',
  items: { 10: 2 }, currencies: { silver: 500, diamond: 0, gold: 0 },
  roleInfo: { kungfuId: 1, subJob: 0, stageId: 1 },
  equipInfo: {}, formationInfo: {}, fashionInfo: {}, petInfo: {}, other_attr_info: {},
};

const original = {
  accountFind: Account.find,
  playerFind: Player.find,
  playerFindOne: Player.findOne,
  playerUpdateOne: Player.updateOne,
  save: playerService.savePlayer,
  top: rank.getTopN,
  getRank: rank.getRank,
  update: rank.updateScore,
  logCreate: ArenaFightLog.create,
};
try {
  Account.find = () => query([{ roles: [{ userId: target.userId, serverId: 1001, lastLoginTime: Date.now(), createTime: Date.now() }] }]);
  Player.find = (filter) => query(filter && filter.playerId ? [target, player] : [target]);
  Player.findOne = () => query({ userId: target.userId });
  Player.updateOne = () => query({ acknowledged: true, matchedCount: 1 });
  playerService.savePlayer = async (_userId, value) => value;
  rank.getTopN = async () => [{ playerId: 'p_self', score: 1000, rank: 1 }, { playerId: 'p_target', score: 1400, rank: 2 }];
  rank.getRank = async (_type, id) => id === 'p_self' ? 1 : 2;
  rank.updateScore = async () => undefined;
  ArenaFightLog.create = async () => ({ acknowledged: true });

  const session = { userId: 'u_self', serverId: 1001, player };
  const info = await arena.handleArenaInfo({}, session, 1);
  assert.equal(info.data.rank, 1);
  assert.equal(info.data.challengelist.length, 5);
  const enemyId = info.data.challengelist[0].playerId;
  const response = await arena.handleArenaFight2300({ type: 2, enemyid: enemyId, challengeVersion: info.data.challengelist[0].challengeVersion }, session, 2);
  const packets = Array.isArray(response) ? response : [response];
  const fight = packets.find((packet) => packet.tag === 2300);
  assert.ok(fight && fight.data && fight.data.result === 0);
  assert.equal(player.items[10], 1);
  assert.equal(player.arenaDailyCount, 1);
  assert.ok(fight.data.rankList && fight.data.rankList.length >= 1);
  const revengeUid = String(player.arenaLoglist[0].uid);
  const revengeResult = await arena.handleArenaFight2300({ type: 3, enemyid: revengeUid, requestId: 'qa_revenge' }, session, 3);
  const revengePackets = Array.isArray(revengeResult) ? revengeResult : [revengeResult];
  const revengeFight = revengePackets.find((packet) => packet.tag === 2300);
  assert.ok(revengeFight && revengeFight.data && revengeFight.data.result === 0);
  assert.equal(String(revengeFight.data.enemyid), revengeUid);
  const revengeAgain = await arena.handleArenaFight2300({ type: 3, enemyid: revengeUid, requestId: 'qa_revenge_again' }, session, 4);
  const revengeAgainPacket = Array.isArray(revengeAgain) ? revengeAgain[revengeAgain.length - 1] : revengeAgain;
  assert.equal(revengeAgainPacket.data.code, 'ARENA_REVENGE_ALREADY_USED');
  console.log(JSON.stringify({ result: 'ok', rank: info.data.rank, ticketAfter: player.items[10], dailyCount: player.arenaDailyCount }));
} finally {
  Account.find = original.accountFind;
  Player.find = original.playerFind;
  Player.findOne = original.playerFindOne;
  Player.updateOne = original.playerUpdateOne;
  playerService.savePlayer = original.save;
  rank.getTopN = original.top;
  rank.getRank = original.getRank;
  rank.updateScore = original.update;
  ArenaFightLog.create = original.logCreate;
}
})().catch((err) => { console.error(err); process.exitCode = 1; });
