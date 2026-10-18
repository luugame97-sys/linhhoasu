const mongoose = require('mongoose');
const { Schema } = mongoose;

const roleSchema = new Schema(
  {
    roleId: { type: String, required: true },
    userId: { type: String, required: true },
    serverId: { type: Number, required: true, default: 1001 },
    serverName: { type: String, default: '' },
    name: { type: String, required: true },
    createTime: { type: Number, required: true },
    lastLoginTime: { type: Number, default: 0 },
    status: { type: Number, default: 1 },
  },
  { _id: false }
);

const accountSchema = new Schema(
  {
    accountId: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    inviteCode: { type: String, default: null, index: true },
    agentId: { type: String, default: null, index: true },
    roles: { type: [roleSchema], default: [] },
    activeRoleByServer: { type: Schema.Types.Mixed, default: () => ({}) },
    lastSelectedServerId: { type: Number, default: 0 },
    lastLoginTime: { type: Number, default: 0 },
    authVersion: { type: Number, default: 1 },
    passwordChangedAt: { type: Date, default: null },
    status: { type: Number, default: 1 },
    banUntil: { type: Date, default: null, index: true },
    banReason: { type: String, default: '' },
    banCode: { type: String, default: '' },
    bannedAt: { type: Date, default: null },
    bannedBy: { type: String, default: '' },
    banMeta: { type: Schema.Types.Mixed, default: () => ({}) },
    banHistory: { type: [Schema.Types.Mixed], default: [] },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

// Arena/server-role lookups use embedded role fields; keep them indexed.
accountSchema.index({ 'roles.serverId': 1 });
accountSchema.index({ 'roles.userId': 1 });

const identityDbName = String(process.env.IDENTITY_MONGO_DB || '').trim();
const defaultConnection = mongoose.connection;
const modelConnection = identityDbName && defaultConnection && typeof defaultConnection.useDb === 'function'
  ? defaultConnection.useDb(identityDbName, { useCache: true })
  : defaultConnection;
const existingModel = modelConnection && modelConnection.models
  ? modelConnection.models.Account
  : null;
const createModel = modelConnection && typeof modelConnection.model === 'function'
  ? modelConnection.model.bind(modelConnection)
  : mongoose.model;

module.exports = existingModel || createModel('Account', accountSchema);
