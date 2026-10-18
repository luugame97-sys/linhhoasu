'use strict';
const { Schema, model } = require('mongoose');
// No TTL: immutable roster and receipts outlive deletable/expired mails.
const schema = new Schema({
  _id: String,
  serverId: { type: Number, required: true, immutable: true },
  event: { type: Schema.Types.Mixed, required: true, immutable: true },
  snapshotHash: { type: String, required: true, immutable: true },
  recipients: { type: [Schema.Types.Mixed], required: true, immutable: true },
  delivered: { type: [String], default: [] },
  expired: { type: [String], default: [] },
  state: { type: String, enum: ['pending', 'done'], default: 'pending' },
  completedAt: Number,
  lastError: { type: String, default: '' },
}, { timestamps: true });
schema.index({ serverId: 1, state: 1 });
module.exports = model('EventRewardSettlement', schema);
