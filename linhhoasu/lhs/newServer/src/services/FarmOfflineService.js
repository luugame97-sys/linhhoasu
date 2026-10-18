'use strict';

// Offline manager is intentionally disabled. Keep the service boundary so old
// sessions and persisted fields remain readable without running settlement.
function settings() {
  return { enabled: false, harvest: false, cook: false, seed: 29, maxHours: 0 };
}
function configure() {
  return { result: 1, code: 'FARM_OFFLINE_DISABLED' };
}
function settle() { return false; }
function heartbeat() { return Promise.resolve(); }
function close() { return false; }
module.exports = { settings, configure, settle, heartbeat, close };
