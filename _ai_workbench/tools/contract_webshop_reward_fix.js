const path = require('path');
const fromServer = (relative) => require(path.join(process.cwd(), relative));
const config = fromServer('src/services/ConfigService');
const playerService = fromServer('src/services/PlayerService');
const rewardGrant = fromServer('src/services/RewardGrantService');
const itemHandler = fromServer('src/handlers/item');

config.loadAllTables();
playerService.savePlayer = async () => true;

function makePlayer(itemId = 0, count = 0) {
  return { level: 1, items: itemId > 0 ? { [itemId]: count } : {}, currencies: {} };
}

async function use(player, params) {
  const result = await itemHandler.handleUseItem(params, { userId: 'reward-contract', player }, 9100);
  const packets = Array.isArray(result) ? result : [result];
  return packets.find((packet) => packet && packet.tag === 1300 && packet.msgUid === 9100);
}

(async () => {
  const rows = [];
  const directGem = makePlayer();
  const gemResult = rewardGrant.grantRewardRow(directGem, { id: 25052, count: 1 });
  rows.push({
    case: 'direct-gem',
    kind: gemResult.kind,
    gems: gemResult.rewardGems.length,
    bagCount: directGem.items[25052] || 0,
    nativeCount: directGem.other_attr_info.gemInfo.gems.length,
  });

  const directArtifact = makePlayer();
  const artifactResult = rewardGrant.grantRewardRow(directArtifact, { id: 23103, count: 1 });
  rows.push({
    case: 'direct-artifact',
    kind: artifactResult.kind,
    artifacts: artifactResult.rewardArtifacts.length,
    nativeCount: directArtifact.artifactInfo.artifacts.length,
    bagCount: directArtifact.items[23103] || 0,
  });

  for (const id of [90014, 90015, 90016, 90034, 90036, 90042, 90043, 90064, 90065]) {
    const player = makePlayer(id, 1);
    const packet = await use(player, { index: id, count: 1, selects: { 0: 1 } });
    rows.push({
      case: `choice-${id}`,
      result: packet && packet.data && packet.data.result,
      items: packet && packet.data && packet.data.rewardInfo && packet.data.rewardInfo.items.length,
      pets: packet && packet.data && packet.data.rewardInfo && packet.data.rewardInfo.pets.length,
      valhalla: packet && packet.data && packet.data.rewardInfo && packet.data.rewardInfo.valhalla.length,
      artifacts: packet && packet.data && packet.data.rewardInfo && packet.data.rewardInfo.artifacts.length,
      bloodline: packet && packet.data && packet.data.rewardInfo && packet.data.rewardInfo.bloodline.length,
      remainingBox: player.items[id] || 0,
    });
  }

  for (const id of [100005, 100006, 100043]) {
    const player = makePlayer(id, 1);
    const packet = await use(player, { index: id, count: 1 });
    rows.push({
      case: `random-${id}`,
      result: packet && packet.data && packet.data.result,
      pets: packet && packet.data && packet.data.rewardInfo && packet.data.rewardInfo.pets.length,
      artifacts: packet && packet.data && packet.data.rewardInfo && packet.data.rewardInfo.artifacts.length,
      remainingBox: player.items[id] || 0,
    });
  }

  const missingSelect = makePlayer(90015, 1);
  const missingPacket = await use(missingSelect, { index: 90015, count: 1 });
  rows.push({
    case: 'choice-without-selection',
    result: missingPacket && missingPacket.data && missingPacket.data.result,
    remainingBox: missingSelect.items[90015] || 0,
  });

  const failed = rows.filter((row) => {
    if (row.case === 'direct-gem') return row.kind !== 'gem' || row.gems !== 1 || row.bagCount !== 0;
    if (row.case === 'direct-artifact') return row.kind !== 'artifact' || row.artifacts !== 1 || row.bagCount !== 0;
    if (row.case === 'choice-without-selection') return row.result !== -1 || row.remainingBox !== 1;
    if (row.case.startsWith('choice-')) return row.result !== 0 || row.items !== 0 || row.remainingBox !== 0;
    if (row.case === 'random-100005' || row.case === 'random-100006') return row.result !== 0 || row.pets !== 1 || row.remainingBox !== 0;
    if (row.case === 'random-100043') return row.result !== 0 || row.artifacts !== 1 || row.remainingBox !== 0;
    return true;
  });
  if (failed.length > 0) {
    console.error(JSON.stringify({ result: 'fail', failed, rows }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ result: 'ok', tables: Object.keys(config.getAllTables ? config.getAllTables() : {}).length, rows }, null, 2));
})().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exitCode = 1;
});
