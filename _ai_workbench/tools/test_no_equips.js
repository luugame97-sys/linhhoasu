'use strict';
const fs = require('fs');
const ConfigService = require('../../linhhoasu/lhs/newServer/src/services/ConfigService');
const BattleService = require('../../linhhoasu/lhs/newServer/src/services/BattleService');

const tables = ConfigService.loadAllTables();
const AttrConfig = tables.AttrConfig;

function calcPower(attrs) {
  if (!attrs) return 0;
  let s = 0;
  for (const [k, v] of Object.entries(attrs)) {
    const cfg = AttrConfig[k];
    if (cfg && cfg.power) s += Number(v) * cfg.power;
  }
  return Math.ceil(s);
}

// Let's test with a simulated player matching Talo without equips:
// Talo: level 174, stage 16, boxLv...
// Let's see what attrs BattleService calculates if equips are empty:
console.log('Testing...');
