'use strict';

// Test-only isolation. Never load this file in the application runtime.
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const net = require('node:net');

const app = path.resolve(process.env.LHS_APP_ROOT);
const handler = path.join(app, 'src/handlers/recharge.js');
const originalJs = Module._extensions['.js'];
const sourceOverride = process.env.CASH_BASELINE_SOURCE || process.env.CASH_CANDIDATE_SOURCE;
if (sourceOverride) {
  const selectedSource = fs.readFileSync(path.resolve(sourceOverride), 'utf8');
  Module._extensions['.js'] = function loadCheckpointSource(module, filename) {
    if (path.resolve(filename) === handler) return module._compile(selectedSource, filename);
    return originalJs(module, filename);
  };
}

net.Socket.prototype.connect = function blockFixtureNetwork() {
  throw new Error('OFFLINE_CHECKPOINT_NETWORK_FORBIDDEN');
};

const logger = { info() {}, warn() {}, debug() {}, error() {}, verbose() {}, log() {} };
const loggerPath = require.resolve(path.join(app, 'src/logger'));
require.cache[loggerPath] = { id: loggerPath, filename: loggerPath, loaded: true, exports: logger };

// Existing local contract tests use memory fixtures; keep accidental saves
// isolated as in preload_reward_test_20260905.js. New durability tests replace
// Player/Transaction/Mail themselves and exercise their explicit fake writes.
const playerService = require(path.join(app, 'src/services/PlayerService'));
playerService.savePlayer = async (_id, player) => player;
playerService.savePlayerDeferred = async (_id, player) => player;
