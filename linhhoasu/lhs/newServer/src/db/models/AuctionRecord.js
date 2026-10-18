/**
 * Durable auction receipts.  Type 1 rows are already delivered (automatic
 * token refunds or winner delivery) and are retained for audit.  A pending
 * row is replayed idempotently after a process restart.
 */

const { Schema, model, models } = require('mongoose');

const auctionRecordSchema = new Schema(
  {
    _id: { type: String },
    serverId: { type: Number, required: true, index: true },
    cycleKey: { type: String, required: true, index: true },
    listingId: { type: String, required: true, index: true },
    uid: { type: Number, required: true },
    userId: { type: String, required: true, index: true },
    playerId: { type: String, default: '' },
    type: { type: Number, required: true, default: 1 },
    receive: { type: Number, required: true, default: 0 },
    deliveryState: { type: String, required: true, default: 'pending' },
    operation: { type: String, required: true, default: 'winner' },
    price: { type: Number, default: 0 },
    payId: { type: Number, default: 0 },
    item: { type: Schema.Types.Mixed, default: null },
    detail: { type: Schema.Types.Mixed, default: null },
    rewardInfo: { type: Schema.Types.Mixed, default: null },
    eventKey: { type: String, default: '' },
    error: { type: String, default: '' },
  },
  {
    timestamps: true,
    strict: false,
    minimize: false,
  },
);

auctionRecordSchema.index({ userId: 1, uid: 1 }, { unique: true });
auctionRecordSchema.index({ serverId: 1, listingId: 1, eventKey: 1 }, { unique: true });
auctionRecordSchema.index({ serverId: 1, cycleKey: 1, deliveryState: 1 });

module.exports = models.AuctionRecord || model('AuctionRecord', auctionRecordSchema);
