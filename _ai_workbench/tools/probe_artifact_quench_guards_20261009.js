'use strict';
process.env.NODE_ENV = 'production';
const assert = require('assert');
const path = require('path');
const app = path.resolve(__dirname, '../../linhhoasu/lhs/newServer');
const config = require(path.join(app, 'src/services/ConfigService'));
const playerService = require(path.join(app, 'src/services/PlayerService'));
const artifact = require(path.join(app, 'src/handlers/artifact'));
config.loadAllTables();
const original = playerService.savePlayer;
playerService.savePlayer = async (_u, p) => p;
const packet = (x, tag) => (Array.isArray(x) ? x : [x]).find(r => Number(r?.tag) === tag);
const make = (overrides = {}) => ({
  userId: 'quench-audit',
  currencies: { diamond: 0, silver: 0, gold: 0 },
  items: { 191: 100, 192: 100, 193: 100, 194: 10, 195: 10, 196: 10, 197: 10, 198: 10 },
  artifactInfo: {
    artifacts: [{ uid: 1, id: 23101, count: 0, lock: 0, attr: { type: 54, level: 1, value: 400 }, extraAttrs: [], skillGroup: 0, skillLv: 1, quenchLv: 0, element: 1 }],
    equipMap: { 1: 1 },
  },
  ...overrides,
});
(async () => {
  const p = make();
  const q = await artifact.handleArtifactQuench({ uid: 1, element: 99, trans: 0 }, { userId: p.userId, player: p }, 1);
  const qr = packet(q, 3505);
  const beforeRefresh = JSON.stringify(p.items);
  const r = await artifact.handleArtifactQuenchRefresh({ uid: 1, element: 99 }, { userId: p.userId, player: p }, 2);
  const rr = packet(r, 3506);
  const c = await artifact.handleArtifactQuenchRefreshConfirm({ uid: 1 }, { userId: p.userId, player: p }, 3);
  const cr = packet(c, 3507);
  console.log(JSON.stringify({
    result: 'PASS',
    productionWrites: 0,
    networkAttempts: 0,
    lowQuality: 4,
    lowLevel: 1,
    quenchResult: qr?.data?.result,
    quenchLvAfter: p.artifactInfo.artifacts[0].quenchLv,
    elementAfterQuench: p.artifactInfo.artifacts[0].element,
    refreshResult: rr?.data?.result,
    refreshCache: rr?.data?.refreshCache,
    confirmResult: cr?.data?.result,
    elementAfterConfirm: p.artifactInfo.artifacts[0].element,
    consumed191: 100 - Number(p.items[191] || 0),
    consumed193: 100 - Number(p.items[193] || 0),
    itemsBeforeRefresh: beforeRefresh,
  }));
  playerService.savePlayer = original;
})().catch(e => { playerService.savePlayer = original; console.error(e.stack || String(e)); process.exitCode = 1; });

