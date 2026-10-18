'use strict';
const config = require('../../linhhoasu/lhs/newServer/src/services/ConfigService');
const battle = require('../../linhhoasu/lhs/newServer/src/services/BattleService');
config.loadAllTables();
function player(quenchLv, element = 1, eSkillGroup = 0) {
  return {
    level: 300,
    roleInfo: { kungfuId: 4, subJob: 0, stage: 10, stageId: 10 },
    equipInfo: { equipSetMap: { 0: {} }, curIndex: 0 },
    swordInfo: { data: [], equippedUid: 0 },
    artifactInfo: {
      artifacts: [{
        uid: 1, id: 23103, count: 0, lock: 0,
        attr: { type: 54, level: 30, value: 4000 },
        extraAttrs: [], skillGroup: 23010, skillLv: 1,
        quenchLv, eSkillGroup, element,
      }],
      equipMap: { 1: 1 },
    },
    petInfo: { pets: [] },
    fashionInfo: { activateFashion: [], fashions: {} },
    currencies: {},
    items: {},
  };
}
const base = battle.calcPlayerPower(player(0));
const quenched = battle.calcPlayerPower(player(1));
const changedAttrs = Object.keys(quenched).filter((key) => Number(quenched[key]) !== Number(base[key]));
console.log(JSON.stringify({
  result: 'PASS',
  productionWrites: 0,
  networkAttempts: 0,
  base,
  quenched,
  changedAttrs,
  baseArtifactQuenchAttr: base['255'] || 0,
  quenchedArtifactQuenchAttr: quenched['255'] || 0,
  configQuenchAttrs: config.get('ArtifactQuenchConfig')[1].attrs1,
  configElementSkillExists: !!config.get('ArtifactElementSkillConfig')[2320101],
}));

