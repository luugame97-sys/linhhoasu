'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;
const schema = new Schema({
  _id: String, cycleKey: String, sourceCycleKey: String, event: String, period: String, cutoffAt: Number, cursorAt: Number,
  snapshotHash: String, recipients: { type: [Schema.Types.Mixed], immutable: true },
  delivered: { type: [String], default: [] }, expired: { type: [String], default: [] }, state: { type: String, enum: ['pending', 'done'], default: 'pending' },
  completedAt: Number, lastError: { type: String, default: '' },
}, { timestamps: true, strict: false });
schema.index({ cycleKey: 1, event: 1 }, { unique: true });
const identity = String(process.env.IDENTITY_MONGO_DB || '').trim();
const conn = identity && mongoose.connection && mongoose.connection.useDb ? mongoose.connection.useDb(identity, { useCache: true }) : mongoose.connection;
module.exports = (conn.models && conn.models.CrossEventSettlement) || conn.model('CrossEventSettlement', schema);
