'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema({
  _id: String,
  cycleKey: { type: String, required: true, immutable: true },
  event: { type: String, enum: ['crossRival', 'crossArena', 'topArena'], required: true, immutable: true },
  serverId: { type: Number, required: true, immutable: true },
  playerId: { type: String, required: true, immutable: true },
  userId: { type: String, required: true, immutable: true },
  name: { type: String, default: '' },
  level: { type: Number, default: 1 },
  score: { type: Number, default: 0 },
  // Defender-side zero-sum receipt markers.  Kept on the shared roster row
  // so any server can retry a committed outcome without double subtraction.
  scoreReceipts: { type: [Schema.Types.Mixed], default: [] },
  revision: { type: Number, default: 0 },
  payload: { type: Schema.Types.Mixed, default: () => ({}) },
  updatedAt: { type: Number, default: 0 },
}, { timestamps: true, strict: false });
schema.index({ cycleKey: 1, event: 1, score: -1 });
schema.index({ cycleKey: 1, event: 1, playerId: 1 }, { unique: true });
const identity = String(process.env.IDENTITY_MONGO_DB || '').trim();
const conn = identity && mongoose.connection && mongoose.connection.useDb
  ? mongoose.connection.useDb(identity, { useCache: true }) : mongoose.connection;
module.exports = (conn.models && conn.models.CrossEventEntry) || conn.model('CrossEventEntry', schema);
