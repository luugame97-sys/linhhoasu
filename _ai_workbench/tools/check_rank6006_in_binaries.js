const fs = require('fs');
const path = require('path');
const { BinJsonUtil } = require('../../../linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');

const files = [
  'linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin',
  'linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin',
  'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin',
  'linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin'
];

files.forEach(f => {
  const p = path.resolve(__dirname, '../../../', f);
  if (!fs.existsSync(p)) {
    console.log(`[FILE MISSING]: ${f}`);
    return;
  }
  const buf = fs.readFileSync(p);
  const tables = BinJsonUtil.decodeTables(buf);
  const rankCfg = tables['Activity6RankConfig'];
  const c6006 = rankCfg?.['6006'] || rankCfg?.[6006];
  console.log(`\n=== File: ${f} ===`);
  console.log(`Activity6RankConfig exists: ${!!rankCfg}`);
  console.log(`6006 exists: ${!!c6006}`);
  if (c6006) {
    const b1 = c6006['1'] || c6006[1];
    console.log(`Bracket 1 rewards: ${JSON.stringify(b1?.rewards || b1)}`);
    const has99002 = JSON.stringify(c6006).includes('99002');
    console.log(`Has 99002 anywhere in 6006: ${has99002}`);
  }
});
