const mongoose = require('mongoose');
const { Schema } = mongoose;

const DEFAULT_SERVER_ROWS = Object.freeze([
  { pageId: 1, pageName: '风起长安', serverId: 1001, serverName: 'S1', isNew: false, isRecommend: true },

  { pageId: 1, pageName: '风起长安', serverId: 1002, serverName: 'S2', isNew: false, isRecommend: false },
  { pageId: 1, pageName: '风起长安', serverId: 1003, serverName: 'S3', isNew: true, isRecommend: true },
  { pageId: 2, pageName: '剑指苍穹', serverId: 2001, serverName: '苍穹一区', isNew: false, isRecommend: true },
  { pageId: 2, pageName: '剑指苍穹', serverId: 2002, serverName: '苍穹二区', isNew: true, isRecommend: false },
  { pageId: 3, pageName: '画境仙踪', serverId: 3001, serverName: '仙踪一区', isNew: false, isRecommend: true },
  { pageId: 3, pageName: '画境仙踪', serverId: 3002, serverName: '仙踪二区', isNew: true, isRecommend: true },
  { pageId: 4, pageName: '九州烽火', serverId: 4001, serverName: '烽火一区', isNew: false, isRecommend: true },
  { pageId: 4, pageName: '九州烽火', serverId: 4002, serverName: '烽火二区', isNew: false, isRecommend: false },
  { pageId: 4, pageName: '九州烽火', serverId: 4003, serverName: '烽火三区', isNew: true, isRecommend: false },
  { pageId: 5, pageName: '云梦泽界', serverId: 5001, serverName: '云梦一区', isNew: true, isRecommend: true },
  { pageId: 5, pageName: '云梦泽界', serverId: 5002, serverName: '云梦二区', isNew: true, isRecommend: false },
]);

function getDefaultRechargeArea() {
  const area = Number(process.env.DEFAULT_RECHARGE_AREA || process.env.RECHARGE_AREA || 1);
  return [1, 2, 3].includes(area) ? area : 1;
}

function buildDefaultServerRows(now = Date.now()) {
  return DEFAULT_SERVER_ROWS.map((row) => {
    const isNew = !!row.isNew;
    return {
      ...row,
      status: 1,
      running: true,
      openTime: now - 86400000 * (isNew ? 3 : 30),
      rechargeArea: getDefaultRechargeArea(),
    };
  });
}

const gameServerSchema = new Schema(
  {
    serverId: { type: Number, required: true, unique: true, index: true },
    pageId: { type: Number, required: true, index: true },
    pageName: { type: String, required: true },
    serverName: { type: String, required: true },
    isNew: { type: Boolean, default: false },
    isRecommend: { type: Boolean, default: false },
    status: { type: Number, default: 1 },
    running: { type: Boolean, default: true },
    openTime: { type: Number, default: 0 },
    rechargeArea: { type: Number, default: 1 },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

gameServerSchema.index({ pageId: 1, serverId: 1 });

gameServerSchema.statics.getDefaultRows = function getDefaultRows() {
  return buildDefaultServerRows();
};

gameServerSchema.statics.initializeDefaults = async function initializeDefaults() {
  const count = await this.countDocuments({});
  if (count > 0) return { inserted: 0, skipped: true };

  const rows = buildDefaultServerRows();
  await this.insertMany(rows, { ordered: false });
  return { inserted: rows.length, skipped: false };
};

const identityDbName = String(process.env.IDENTITY_MONGO_DB || '').trim();
const defaultConnection = mongoose.connection;
const modelConnection = identityDbName && defaultConnection && typeof defaultConnection.useDb === 'function'
  ? defaultConnection.useDb(identityDbName, { useCache: true })
  : defaultConnection;
const existingModel = modelConnection && modelConnection.models
  ? modelConnection.models.GameServer
  : null;
const createModel = modelConnection && typeof modelConnection.model === 'function'
  ? modelConnection.model.bind(modelConnection)
  : mongoose.model;

module.exports = existingModel || createModel('GameServer', gameServerSchema);
