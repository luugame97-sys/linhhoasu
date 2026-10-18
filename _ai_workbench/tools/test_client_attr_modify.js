'use strict';
const fs = require('fs');
const ConfigService = require('../../linhhoasu/lhs/newServer/src/services/ConfigService');

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

// Let's test what base attributes exist without any equipment or sub-systems:
// Stage 16
const stageAttr = copy(tables.RoleStageConfig[16]?.attr || {});
console.log('Stage 16 raw:', stageAttr);
const modStage = attrModify(copy(stageAttr));
console.log('Stage 16 modify:', modStage, 'power:', calPowerByAttr(modStage));

// What about other single systems?
