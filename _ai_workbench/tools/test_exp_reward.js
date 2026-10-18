const config = require('../../linhhoasu/lhs/newServer/src/services/ConfigService');
const { checkLevelUp } = require('../../linhhoasu/lhs/newServer/src/handlers/raid');

config.loadAllTables();
const stageCfg = config.get('RoleStageConfig') || {};
const firstStageId = Number(Object.keys(stageCfg)[0] || 1);
const firstStage = stageCfg[firstStageId] || stageCfg[String(firstStageId)] || {};
const player = {
  level: 1,
  exp: Number(process.argv[2] || 50000),
  items: {},
  currencies: { diamond: 0, silver: 0, gold: 0 },
  roleInfo: { stage: firstStageId, stageId: firstStageId },
  taskInfo: {},
  raidInfo: {},
};
checkLevelUp(player);
console.log(JSON.stringify({ input: Number(process.argv[2] || 50000), level: player.level, exp: player.exp, item3: player.items[3] || 0, stage: player.roleInfo.stage }));
