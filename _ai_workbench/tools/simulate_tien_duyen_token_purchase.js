const path = require('path');

const root = path.resolve(__dirname, '../../linhhoasu/lhs/newServer/src');
const playerServicePath = require.resolve(path.join(root, 'services/PlayerService'));
const serverConfigPath = require.resolve(path.join(root, 'services/ServerConfigService'));

require.cache[playerServicePath] = {
  id: playerServicePath,
  filename: playerServicePath,
  loaded: true,
  exports: {
    savePlayer: async (_userId, player) => player,
    savePlayerDeferred: async (_userId, player) => player,
  },
};
require.cache[serverConfigPath] = {
  id: serverConfigPath,
  filename: serverConfigPath,
  loaded: true,
  exports: { getCurrentRechargeArea: async () => 1 },
};

const compat = require(path.join(root, 'handlers/compat'));

const player = {
  userId: 'fixture',
  level: 50,
  items: { 1001: 128 },
  currencies: { diamond: 0, gold: 0, silver: 0 },
  rechargeInfo: { area: 1, records: [] },
  activityInfo: {
    datas: [{
      id: 9001, score: 7, recordList: [], records: {},
      startTime: Date.now() - 1000, endTime: Date.now() + 86400000,
    }],
  },
};

(async () => {
  const result = await compat.handleTokenRecharge1230(
    { id: 10501, multi: 1 },
    { userId: 'fixture', player },
    88,
  );
  const packets = Array.isArray(result) ? result : [result];
  console.log(JSON.stringify({
    tokenLeft: player.items[1001] || 0,
    rechargeRecords: player.rechargeInfo.records,
    activity9001: player.activityInfo.datas[0],
    response: packets.map((packet) => ({
      tag: packet.tag,
      result: packet.data && packet.data.result,
      id: packet.data && packet.data.id,
      rewardInfo: packet.data && packet.data.rewardInfo,
    })),
  }));
})().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
