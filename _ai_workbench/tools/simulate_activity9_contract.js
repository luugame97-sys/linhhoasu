const config = require('../../linhhoasu/lhs/newServer/src/services/ConfigService');
const activity = require('../../linhhoasu/lhs/newServer/src/handlers/activity');

const now = Date.now();
const row = (id) => ({
  id, module: 0, index: 0, param: 0, record: 0, status: 0,
  startTime: now - 1000, endTime: now + 86400000, score: 7,
  recordList: [], records: {}, buyRecords: {}, extra: {},
});

const cfg = config.get('ActivityConfig') || {};
const typeCfg = config.get('Activity9TypeConfig') || {};
const rewardCfg = config.get('Activity9Config') || {};
const player = {
  level: 50,
  items: {},
  rechargeInfo: { records: [{ id: 10501, count: 1 }] },
  activityInfo: { datas: [row(9001)] },
};

(async () => {
  const result = await activity.handleActivityOperate(
    { id: 9001, module: 0, index: 0, param: 0 },
    { player },
    77,
  );
  const packets = Array.isArray(result) ? result : [result];
  console.log(JSON.stringify({
    activity9001: cfg[9001] || cfg['9001'] || null,
    type9001: typeCfg[9001] || typeCfg['9001'] || null,
    rewardDayCount: Object.keys(rewardCfg[9001] || rewardCfg['9001'] || {}).length,
    playerRow: player.activityInfo.datas.find((x) => x.id === 9001),
    items: player.items,
    packets: packets.map((x) => ({
      tag: x.tag,
      result: x.data && x.data.result,
      rewardInfo: x.data && x.data.rewardInfo,
      nestedRecord: x.data && x.data.data && x.data.data.record,
    })),
  }));
})().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exitCode = 1;
});

