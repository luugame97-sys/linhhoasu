'use strict';
const { Schema, model } = require('mongoose');
// No TTL: immutable payout roster/outbox receipts outlive expiring Mail.
const schema = new Schema({
  _id: String,
  serverId: { type: Number, required: true, immutable: true },
  period: { type: String, enum: ['day', 'week'], required: true, immutable: true },
  periodKey: { type: String, required: true, immutable: true },
  cutoffAt: { type: Number, required: true, immutable: true },
  activationAt: { type: Number, required: true, immutable: true },
  snapshotHash: { type: String, required: true, immutable: true },
  recipients: { type: [Schema.Types.Mixed], required: true, immutable: true },
  delivered: { type: [String], default: [] },
  expired: { type: [String], default: [] },
  state: { type: String, enum: ['pending', 'sending', 'done'], default: 'pending' },
  leaseOwner: { type: String, default: '' }, leaseUntil: { type: Number, default: 0 },
  attempts: { type: Number, default: 0 }, completedAt: Number, cursorAt: Number, lastError: { type: String, default: '' },
}, { timestamps: true });
schema.index({ serverId: 1, state: 1, cutoffAt: 1 });
module.exports = model('ArenaSettlement', schema);
