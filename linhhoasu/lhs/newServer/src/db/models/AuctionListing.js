/**
 * Shared system-auction listing.  One document represents one catalog lot in
 * one server/day cycle.  The version field is used as a compare-and-swap
 * guard because production MongoDB is standalone and does not provide a
 * multi-document transaction for this feature.
 */

const { Schema, model, models } = require('mongoose');

const auctionListingSchema = new Schema(
  {
    _id: { type: String },
    serverId: { type: Number, required: true, index: true },
    cycleKey: { type: String, required: true, index: true },
    lotId: { type: String, required: true },
    id: { type: Number, required: true },
    version: { type: Number, required: true, default: 1 },
    bidCount: { type: Number, required: true, default: 0 },
    status: { type: Number, required: true, default: 1 },
    type: { type: Number, required: true, default: 1 },
    item: { type: Schema.Types.Mixed, required: true },
    detail: { type: Schema.Types.Mixed, default: null },
    price: { type: Number, required: true },
    fixedValue: { type: Number, required: true },
    payType: { type: Number, default: 0 },
    payId: { type: Number, required: true },
    playerId: { type: String, default: '' },
    playerName: { type: String, default: '' },
    bidderId: { type: String, default: '' },
    bidderUserId: { type: String, default: '' },
    bidderName: { type: String, default: '' },
    hideName: { type: Number, default: 0 },
    hasOffer: { type: Number, default: 0 },
    openAtMs: { type: Number, required: true },
    closeAtMs: { type: Number, required: true },
    time: { type: Number, required: true },
    settledAtMs: { type: Number, default: 0 },
    settlementKey: { type: String, default: '' },
    pendingBid: { type: Schema.Types.Mixed, default: null },
    bidHistory: { type: [Schema.Types.Mixed], default: [] },
    refunds: { type: [Schema.Types.Mixed], default: [] },
    needsReconcile: { type: Boolean, default: false },
    sourceSpecialArtifactId: { type: Number, default: 0 },
    sourceRobotId: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    strict: false,
    minimize: false,
  },
);

auctionListingSchema.index({ serverId: 1, cycleKey: 1, lotId: 1 }, { unique: true });
auctionListingSchema.index({ serverId: 1, status: 1, closeAtMs: 1 });
auctionListingSchema.index({ serverId: 1, needsReconcile: 1 });

module.exports = models.AuctionListing || model('AuctionListing', auctionListingSchema);
