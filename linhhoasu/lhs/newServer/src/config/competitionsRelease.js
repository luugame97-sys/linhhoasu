'use strict';
// New Arena payout activation for previously disabled S3/S4. No historical
// backpay. Release tooling refuses a rollout after this day's first cutoff.
const activationAt = 1789630175411;
const env = Object.freeze({ ARENA_SETTLEMENT_ENABLED: '1', ARENA_SETTLEMENT_APPROVED: '1',
  ARENA_SETTLEMENT_ACTIVATION_AT: String(activationAt) });
function apply(apps) {
  for (const app of apps || []) {
    const match = /^lhs-s(\d+)$/.exec(String(app.name || ''));
    const serverId = match ? Number(match[1]) : 0;
    if (serverId >= 1001 && serverId <= 1099) {
      app.env.CROSS_EVENT_ENABLED = '1';
    }
    if (['lhs-s1003','lhs-s1004'].includes(app.name)) Object.assign(app.env, env);
    // S5 and future page-1 server templates opt into Arena from their durable
    // opening point. Never use Date.now() here: PM2 reloads must not move the
    // activation forward and skip a historical cutoff.
    if (serverId >= 1005 && serverId <= 1099) {
      app.env.ARENA_SETTLEMENT_ENABLED = '1';
      app.env.ARENA_SETTLEMENT_APPROVED = '1';
      const openedAt = Number(app.env.SERVER_OPEN_TIME) || 0;
      const configuredAt = Number(app.env.ARENA_SETTLEMENT_ACTIVATION_AT) || 0;
      if (openedAt > 0) app.env.ARENA_SETTLEMENT_ACTIVATION_AT = String(openedAt);
      else if (configuredAt > 0) app.env.ARENA_SETTLEMENT_ACTIVATION_AT = String(configuredAt);
      else {
        app.env.ARENA_SETTLEMENT_ENABLED = '0';
        app.env.ARENA_SETTLEMENT_APPROVED = '0';
      }
    }
  }
}
module.exports = { activationAt, env, apply };
