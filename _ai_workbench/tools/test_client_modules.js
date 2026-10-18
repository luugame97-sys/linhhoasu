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

  // Let's test all possible sub-modules in client
  // 1: Equip
  const eqMap = p.equipInfo?.equipSetMap?.['0'] || {};
  const m1 = {};
  for (const a in eqMap) {
    const at = eqMap[a].attrs;
    if (at) for (const k in at) m1[k] = (m1[k] || 0) + Number(at[k]);
  }

  // 2: Mount
  const m2 = p.swordInfo?.data?.[0]?.attrs || {};

  // 3: Formation
  // In client FormationModel:
  // let's see what FormationModel.getAttrs() returns:
  const m3 = {}; // formation

  // 5: Stage
  const m5 = tables.RoleStageConfig[p.roleInfo?.stage || 16]?.attr || {};

  // 6: Pet
  // In client PetModel.getAttrs():
  // let's check what PetModel.getAttrs() computes:
  // It computes pet attributes from deployed pets:
  const m6 = {};

  // 7: Fashion
  const m7 = {};

  // 8: Artifact
  const m8 = {};

  // 9: Spirit
  const m9 = {};

  // 10: Gem
  const m10 = {};

  // 11: Fate
  const m11 = {};

  // 12: Fishing
  const m12 = {};

  // 13: Valhalla
  const m13 = {};

  // 14: Bloodline
  const m14 = {};

  // 15: Curios
  const m15 = {};

  // 16: Elf
  const m16 = {};

  // 17: Homeland
  const m17 = {};

  // 18: ValhallaFormation
  const m18 = {};

  // 19: PetSoul
  const m19 = {};

  // 20: OldTrek
  const m20 = {};

  // 21: SpecSpirit
  const m21 = {};

  // Let us check what client PetModel.getAttrs does:
  // Let us inspect client code for PetModel.getAttrs!
  console.log('Equip HP:', m1[1], 'Stage HP:', m5[1], 'Mount HP:', m2[1]);

  await m.close();
  process.exit(0);
})();
