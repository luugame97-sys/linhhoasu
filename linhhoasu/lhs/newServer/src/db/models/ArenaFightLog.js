'use strict';

const { Schema, model } = require('mongoose');

const arenaFightLogSchema = new Schema({
  fightId: { type: String, required: true, unique: true, index: true },
  serverId: { type: Number, required: true, index: true },
  attackerId: { type: String, required: true, index: true },
  targetId: { type: String, default: '', index: true },
  targetPlayerId: { type: String, default: '', index: true },
  logUid: { type: Number, default: 0, index: true },
  targetName: { type: String, default: '' },
  targetLevel: { type: Number, default: 1 },
  targetAvatar: { type: Number, default: 0 },
  targetAvatarFrame: { type: Number, default: -1 },
  targetKungfuId: { type: Number, default: 0 },
  revenge: { type: Number, default: 0 },
  msgUid: { type: Schema.Types.Mixed, default: 0 },
  snapshotHash: { type: String, default: '' },
  preScore: { type: Number, default: 0 },
  postScore: { type: Number, default: 0 },
  enemyScore: { type: Number, default: 0 },
  scoreChange: { type: Number, default: 0 },
  targetPreScore: { type: Number, default: 0 },
  targetPostScore: { type: Number, default: 0 },
  targetScoreChange: { type: Number, default: 0 },
  zeroSumVersion: { type: Number, default: 0 },
  attackerName: { type: String, default: '' },
  attackerLevel: { type: Number, default: 1 },
  cost: { type: Schema.Types.Mixed, default: () => [] },
  rewards: { type: Schema.Types.Mixed, default: () => [] },
  win: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: true },
}, { minimize: false });

arenaFightLogSchema.index({ serverId: 1, createdAt: -1 });
arenaFightLogSchema.index({ attackerId: 1, createdAt: -1 });

module.exports = model('ArenaFightLog', arenaFightLogSchema);
