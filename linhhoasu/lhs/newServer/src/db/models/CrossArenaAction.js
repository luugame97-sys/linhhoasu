'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;
// Durable, shared receipts also serve the two participants' battle logs.
// No TTL: deleting an expired receipt must never enable a second payout.
const schema = new Schema({
  _id: String, event: { type: String, default: 'crossArena', immutable: true }, cycleKey: { type: String, required: true, immutable: true },
  serverId: { type: Number, required: true, immutable: true },
  playerId: { type: String, required: true, immutable: true },
  userId: { type: String, required: true, immutable: true },
  fingerprint: { type: String, required: true, immutable: true },
  kind: { type: String, enum: ['fight', 'refresh'], required: true, immutable: true },
  committedAt: { type: Number, required: true, immutable: true },
  response: { type: Schema.Types.Mixed, required: true, immutable: true },
  log: { type: Schema.Types.Mixed, immutable: true },
  targetPlayerId: { type: String, default: '', immutable: true },
  targetUserId: { type: String, default: '', immutable: true },
  targetServerId: { type: Number, default: 0, immutable: true },
  targetEntryId: { type: String, default: '', immutable: true },
  revengeReceipt: { type: String, default: '' },
}, { minimize: false });
schema.index({ cycleKey: 1, playerId: 1, committedAt: -1 });
schema.index({ cycleKey: 1, targetPlayerId: 1, committedAt: -1 });
schema.index({ cycleKey: 1, 'log.uid': 1 });
const identity = String(process.env.IDENTITY_MONGO_DB || '').trim();
const conn = identity ? mongoose.connection.useDb(identity, { useCache: true }) : mongoose.connection;
module.exports = conn.models.CrossArenaAction || conn.model('CrossArenaAction', schema);
