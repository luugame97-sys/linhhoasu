'use strict';

async function resolve(input, deps) {
  const token = typeof input.userToken === 'string' ? input.userToken : '';
  const serverId = Number(input.serverId);
  if (!/^ats_[a-z0-9]+_[a-f0-9]{32}$/.test(token) || !Number.isSafeInteger(serverId) || serverId <= 0) return null;
  const session = await deps.getSession(token);
  if (!session || !session.accountId || !session.userId || Number(session.serverId) !== serverId) return null;
  const account = await deps.getAccount(session.accountId);
  if (!account || Number(account.status) <= 0 || deps.inspectBan(account).banned
    || Number(session.authVersion) !== Math.max(1, Number(account.authVersion) || 1)) return null;
  const role = (account.roles || []).find(row => Number(row.serverId) === serverId
    && String(row.userId) === String(session.userId) && String(row.roleId) === String(session.roleId));
  if (!role) return null;
  return { account: String(account.accountId), serverId, userId: String(session.userId) };
}

module.exports = { resolve };
