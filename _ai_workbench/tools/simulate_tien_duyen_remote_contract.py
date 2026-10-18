from __future__ import annotations
import base64
import getpass
import paramiko

HOST = "103.116.105.154"
JS = r"""
const path = require('path');
const base = '/linhhoasu/lhs/newServer/src';
const playerServicePath = require.resolve(path.join(base, 'services/PlayerService'));
const serverConfigPath = require.resolve(path.join(base, 'services/ServerConfigService'));
require.cache[playerServicePath] = {
  id: playerServicePath, filename: playerServicePath, loaded: true,
  exports: {
    savePlayer: async (_userId, player) => player,
    savePlayerDeferred: async (_userId, player) => player,
  },
};
require.cache[serverConfigPath] = {
  id: serverConfigPath, filename: serverConfigPath, loaded: true,
  exports: { getCurrentRechargeArea: async () => 1 },
};

const activity = require(path.join(base, 'handlers/activity'));
const compat = require(path.join(base, 'handlers/compat'));
const config = require(path.join(base, 'services/ConfigService'));
const activityConfig = config.get('ActivityConfig') || {};
const activity9Types = config.get('Activity9TypeConfig') || {};
const payConfig = config.get('PayConfig') || {};
const shopConfig = config.get('ShopConfig') || {};
const activity9Ids = Object.keys(activityConfig)
  .filter((id) => Number(activityConfig[id] && activityConfig[id].activityType) === 9)
  .map(Number)
  .sort((a, b) => a - b);
console.log(JSON.stringify({
  source: 'production-runtime-config-readonly',
  activity9Ids,
  activity9Types: Object.fromEntries(Object.keys(activity9Types).map((id) => [id, {
    rechargeId: activity9Types[id] && activity9Types[id].rechargeId,
    show: activity9Types[id] && activity9Types[id].show,
  }])),
  pay: Object.fromEntries(['10501', '10502'].map((id) => [id, payConfig[id] || null])),
  shop: Object.fromEntries(['10501', '10502'].map((id) => [id, shopConfig[id] || null])),
}));
const now = Date.now();
const activityRow = () => ({
  id: 9001, module: 0, index: 0, param: 0, record: 0, status: 0,
  startTime: now - 1000, endTime: now + 86400000, score: 7,
  recordList: [], records: {}, buyRecords: {}, extra: {},
});

(async () => {
  const claimPlayer = {
    level: 50, items: {},
    rechargeInfo: { records: [{ id: 10501, count: 1 }] },
    activityInfo: { datas: [activityRow()] },
  };
  const claimOut = await activity.handleActivityOperate(
    { id: 9001, module: 0, index: 0, param: 0 },
    { player: claimPlayer },
    77,
  );
  const claimPackets = Array.isArray(claimOut) ? claimOut : [claimOut];

  const buyPlayer = {
    level: 50, items: { 1001: 128 }, currencies: {},
    rechargeInfo: { area: 1, records: [] },
    activityInfo: { datas: [activityRow()] },
  };
  const buyOut = await compat.handleTokenRecharge1230(
    { id: 10501, multi: 1 },
    { player: buyPlayer },
    88,
  );
  const buyPackets = Array.isArray(buyOut) ? buyOut : [buyOut];

  console.log(JSON.stringify({
    source: 'production-runtime-fixture-readonly',
    claim: {
      row: claimPlayer.activityInfo.datas[0],
      items: claimPlayer.items,
      packets: claimPackets.map((p) => ({
        tag: p.tag,
        result: p.data && p.data.result,
        rewardInfo: p.data && p.data.rewardInfo,
      })),
    },
    tokenPurchase: {
      token1001: buyPlayer.items[1001] || 0,
      rechargeRecords: buyPlayer.rechargeInfo.records,
      activityRow: buyPlayer.activityInfo.datas[0],
      packets: buyPackets.map((p) => ({
        tag: p.tag,
        result: p.data && p.data.result,
        id: p.data && p.data.id,
        rewardInfo: p.data && p.data.rewardInfo,
      })),
    },
  }));
})().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
"""

def main() -> None:
    password = getpass.getpass("VPS password (not logged): ")
    encoded = base64.b64encode(JS.encode("utf-8")).decode("ascii")
    command = f"cd /linhhoasu/lhs/newServer && printf '%s' '{encoded}' | base64 -d | node"
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username="root", password=password, look_for_keys=False,
                allow_agent=False, timeout=20)
    try:
        _, stdout, stderr = ssh.exec_command(command, timeout=90)
        print(stdout.read().decode("utf-8", "replace"), end="")
        error = stderr.read().decode("utf-8", "replace")
        if error:
            print("STDERR=" + error, end="")
    finally:
        ssh.close()

if __name__ == "__main__":
    main()
