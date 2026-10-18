const config = require('../../linhhoasu/lhs/newServer/src/services/ConfigService');
const playerService = require('../../linhhoasu/lhs/newServer/src/services/PlayerService');

config.loadAllTables();
playerService.savePlayer = async (_userId, player) => player;
const upgrade = require('../../linhhoasu/lhs/newServer/src/handlers/upgrade');

async function main() {
  const player = {
    userId: 'contract_skill_point',
    level: 10,
    items: { 5: 2 },
    currencies: { silver: 123456, diamond: 0, gold: 0 },
    roleInfo: {
      kungfuId: 4,
      kungfuSkills: [],
      kungfuInfos: [{ id: 4, kungfuId: 4, sequence: [0, 1, 2, 3, 4], skillLevel: [1, 1, 1, 1, 1] }],
      stage: 1,
      stageId: 1,
    },
  };
  const packets = await upgrade.handleSkillUpgrade({ index: 0 }, { userId: player.userId, player }, 77);
  if (!Array.isArray(packets) || packets.length !== 2) throw new Error('expected sync + response packets');
  const sync = packets[0];
  const response = packets[1];
  if (sync.tag !== 1202 || sync.data.items[0].id !== 5 || sync.data.items[0].count !== -1) throw new Error('skill point sync mismatch');
  if (response.tag !== 3101 || response.data.result !== 0 || response.data.costItemId !== 5 || response.data.cost !== 1) throw new Error('upgrade response mismatch');
  if (player.items[5] !== 1) throw new Error('skill point not consumed');
  if (player.currencies.silver !== 123456) throw new Error('silver must not be consumed');
  console.log(JSON.stringify({ result: 'ok', item5: player.items[5], silver: player.currencies.silver, response: response.data }));
}

main().catch((error) => { console.error(error); process.exit(1); });
