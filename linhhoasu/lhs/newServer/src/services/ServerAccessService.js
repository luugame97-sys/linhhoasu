const serverConfigService = require('./ServerConfigService');

const SERVER_CLOSED_STATE = 4;

function normalizeStatus(value, fallback = 1) {
  const status = Number(value);
  if (Number.isFinite(status) && status >= 0) return Math.floor(status);
  return fallback;
}

function resolveServerEntryState(serverConfig = {}, now = Date.now()) {
  if (!serverConfig || serverConfig.running === false) return SERVER_CLOSED_STATE;
  if (normalizeStatus(serverConfig.status, 1) <= 0) return SERVER_CLOSED_STATE;
  const openTime = Math.max(0, Number(serverConfig.openTime) || 0);
  if (openTime > 0 && Number(now) < openTime) return SERVER_CLOSED_STATE;
  return serverConfig.isNew ? 1 : 2;
}

async function resolveServerAccess(serverIdInput, now = Date.now()) {
  const serverId = Number(serverIdInput) || 0;
  const config = serverId > 0
    ? await serverConfigService.findServerConfig(serverId)
    : null;
  const openTime = Math.max(0, Number(config && config.openTime) || 0);
  const status = normalizeStatus(config && config.status, 0);
  const ok = !!config
    && config.running !== false
    && status > 0
    && (openTime <= 0 || Number(now) >= openTime);

  return {
    ok,
    code: ok ? '' : 'SERVER_NOT_OPEN',
    serverId,
    openTime,
    status,
    config,
  };
}

module.exports = {
  SERVER_CLOSED_STATE,
  resolveServerEntryState,
  resolveServerAccess,
};
