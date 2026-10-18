'use strict';

const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
process.env.LHS_APP_ROOT = process.env.LHS_APP_ROOT || path.resolve(ROOT, 'linhhoasu/lhs/newServer');
process.env.LHS_CONFIG_PATH = process.env.LHS_CONFIG_PATH || path.resolve(ROOT, 'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin');

const config = require(path.resolve(process.env.LHS_APP_ROOT, 'src/services/ConfigService'));
const { use, rewardTotal } = require('./test_usable_item_fixes_20260905');

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function n(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

async function main() {
  const uses = asObject(config.get('AssetsUseConfig'));
  const ids = Object.values(uses)
    .filter((cfg) => n(cfg && cfg.type, 0) === 102)
    .map((cfg) => n(cfg && cfg.id, 0))
    .filter((id) => id > 0);
  const failures = [];
  for (let round = 1; round <= 10; round += 1) {
    for (const id of ids) {
      const tested = await use(id);
      const response = tested.response && tested.response.data;
      if (!response || response.result !== 0 || tested.player.items[id] !== 9 || rewardTotal(tested.info) <= 0) {
        failures.push({ round, id, result: response && response.result, consumed: 10 - (tested.player.items[id] || 0), rewardTotal: rewardTotal(tested.info) });
      }
    }
  }
  const output = {
    result: failures.length === 0 ? 'PASS' : 'FAIL',
    type102: ids.length,
    samples: ids.length * 10,
    failures,
  };
  console.log(JSON.stringify(output));
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ result: 'FAIL', error: error.message }));
  process.exitCode = 1;
});
