'use strict';
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const ConfigService = require('./src/services/ConfigService');

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

function attrAddition(base, add) {
  const res = { ...base };
  if (!add) return res;
  for (const [k, v] of Object.entries(add)) {
    res[k] = (res[k] || 0) + Number(v);
  }
  return res;
}

(async () => {
  const m = new MongoClient('mongodb://127.0.0.1:27017');
  await m.connect();
  const col = m.db('lhs_s1001').collection('players');
  const p = await col.findOne({ name: 'Talo' });
  if (!p) { console.log('NOT FOUND'); await m.close(); return; }

  console.log('Player:', p.name, 'level:', p.level, 'stage:', p.roleInfo?.stage);

  // Let's check what equips are in equipSetMap
  const equipSet = p.equipInfo?.equipSetMap?.[String(p.equipInfo?.curIndex || 0)] || {};
  console.log('Equips count:', Object.keys(equipSet).length);

  // Print each equip
  for (const [slot, eq] of Object.entries(equipSet)) {
    console.log(`Slot ${slot}: id=${eq.id}, quality=${eq.quality}, level=${eq.level}, attrs=${JSON.stringify(eq.attrs)}`);
  }

  await m.close();
})();
