'use strict';
const { MongoClient } = require('mongodb');
const ConfigService = require('./src/services/ConfigService');

const tables = ConfigService.loadAllTables();
const AttrConfig = tables.AttrConfig;

function copy(o) { return JSON.parse(JSON.stringify(o)); }

function attrAddition(t, e) {
  const n = copy(t);
  if (!e) return n;
  for (const a in e) n[a] = (n[a] || 0) + Number(e[a]);
  return n;
}

function attrModify(t) {
  const n = copy(t);
  for (const e in t) {
    const a = Number(e);
    const s = t[a];
    const o = AttrConfig[a];
    if (o && o.linkId) {
      for (let r = 0; r < o.linkId.length; r++) {
        const h = o.linkId[r];
        const d = AttrConfig[a];
        const c = n[h] || 0;
        const u = t[h] || 0;
        if (d.dataType === 1) {
          t[h] = u + s;
        } else if (d.dataType === 2) {
          t[h] = Math.floor(c * (s / 10000)) + u;
        }
      }
    }
  }
  return t;
}

function calPowerByAttr(t) {
  let i = 0;
  for (const e in t) {
    const n = AttrConfig[parseInt(e)];
    i += n && n.power !== -1 ? t[e] * n.power : 0;
  }
  return Math.ceil(i);
}

(async () => {
  const m = new MongoClient('mongodb://127.0.0.1:27017');
  await m.connect();
  const col = m.db('lhs_s1001').collection('players');
  const p = await col.findOne({ name: 'Talo' });

  // Let's compute exact HP and Power of each module as calculated by client:
  console.log('--- COMPONENT ANALYSIS FOR TALO ---');
  
  // 1. Equip
  const eqMap = p.equipInfo?.equipSetMap?.['0'] || {};
  const m1 = {};
  for (const a in eqMap) {
    const at = eqMap[a].attrs;
    if (at) for (const k in at) m1[k] = (m1[k] || 0) + Number(at[k]);
  }
  console.log('1. Equip: HP =', m1[1], 'Power =', calPowerByAttr(m1));

  // 2. Mount
  const m2 = p.swordInfo?.data?.[0]?.attrs || {};
  console.log('2. Mount: HP =', m2[1], 'Power =', calPowerByAttr(m2));

  // 3. Formation
  const formBase = tables.FormationBaseConfig || {};
  const m3 = copy(formBase.formationBasicAttribute || { 1: 2000, 2: 240, 3: 40 });
  console.log('3. Formation: HP =', m3[1], 'Power =', calPowerByAttr(m3));

  // 5. Stage 16
  const m5 = tables.RoleStageConfig[16]?.attr || {};
  console.log('5. Stage 16: HP =', m5[1], 'Power =', calPowerByAttr(m5));

  // Let's check: What if Equip HP is NOT 804,745, but what if ONLY SOME equips are counted?
  // What if ONLY Slot 6 and Slot 11 are counted? (the ones with normal IDs < 200,000,000!)
  const m1_normalOnly = {};
  for (const [slot, eq] of Object.entries(eqMap)) {
    if (eq.id < 200000000) {
      const at = eq.attrs;
      if (at) for (const k in at) m1_normalOnly[k] = (m1_normalOnly[k] || 0) + Number(at[k]);
    }
  }
  console.log('Equips with ID < 200,000,000: HP =', m1_normalOnly[1], 'Power =', calPowerByAttr(m1_normalOnly));

  // What about Stage + Mount + Formation + NormalEquips?
  let baseSum = {};
  baseSum = attrAddition(baseSum, m5); // stage 16: 34120
  baseSum = attrAddition(baseSum, m2); // mount: 3464
  baseSum = attrAddition(baseSum, m3); // formation: 2000
  baseSum = attrAddition(baseSum, m1_normalOnly); // 128059
  console.log('Sum so far HP =', baseSum[1]);

  await m.close();
  process.exit(0);
})();
