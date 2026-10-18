const fs = require('fs');
const path = require('path');
const config = require(path.join(process.cwd(), 'src/services/ConfigService'));
const playerService = require(path.join(process.cwd(), 'src/services/PlayerService'));
const itemHandler = require(path.join(process.cwd(), 'src/handlers/item'));

config.loadAllTables();
playerService.savePlayer = async () => true;
const auditPath = process.env.REWARD_AUDIT_PATH
  || path.join(process.cwd(), '..', '..', '..', '_ai_workbench', 'temp', 'giftcode_donate_audit.json');
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const assets = config.get('AssetsConfig') || {};
const useCfg = config.get('AssetsUseConfig') || {};
const rewardIds = new Set();
for (const code of audit.giftcodes || []) {
  const raw = typeof code.reward_items === 'string' ? JSON.parse(code.reward_items) : code.reward_items;
  if (Array.isArray(raw)) raw.forEach((row) => rewardIds.add(Number(row && (row.item_id != null ? row.item_id : row.id))));
  else for (const id of Object.keys(raw || {})) rewardIds.add(Number(id));
}

function expected(row, use) {
  const icon = String(row && row.icon || '');
  if (icon.startsWith('random_gem_')) return 'gems';
  if (icon.startsWith('random_bloodline_')) return 'bloodline';
  if (icon.startsWith('random_valhalla_')) return 'valhalla';
  if (icon.startsWith('random_pet_') || icon.startsWith('select_pet_')) return 'pets';
  if (icon.startsWith('select_valhalla_')) return 'valhalla';
  if (icon.startsWith('select_artifact_') && Number(use && use.type) === 101) return 'artifacts';
  if (icon.startsWith('select_bloodline_')) return 'bloodline';
  if (icon.startsWith('select_sword_')) return 'swords';
  const selected = use && Array.isArray(use.rewards) ? use.rewards[0] : null;
  if (selected && (config.get('SpecialArtifactConfig') || {})[selected.id]) return 'artifacts';
  return 'any';
}

(async () => {
  const candidates = Array.from(rewardIds).filter((id) => {
    const row = assets[id] || assets[String(id)];
    const use = useCfg[id] || useCfg[String(id)];
    return row && (use || String(row.icon || '').startsWith('random_') || String(row.icon || '').startsWith('select_'));
  }).sort((a, b) => a - b);
  const rows = [];
  for (const id of candidates) {
    const row = assets[id] || assets[String(id)];
    const use = useCfg[id] || useCfg[String(id)] || {};
    const player = { level: 1, items: { [id]: 1 }, currencies: {} };
    const params = { index: id, count: 1 };
    if ([101, 106].includes(Number(use.type))) params.selects = { 0: 1 };
    const output = await itemHandler.handleUseItem(params, { userId: 'giftcode-contract', player }, 9500);
    const packets = Array.isArray(output) ? output : [output];
    const packet = packets.find((entry) => entry && entry.tag === 1300 && entry.msgUid === 9500);
    const info = packet && packet.data && packet.data.rewardInfo || {};
    rows.push({
      id,
      icon: row.icon,
      useType: Number(use.type || 0),
      result: packet && packet.data && packet.data.result,
      expected: expected(row, use),
      items: Array.isArray(info.items) ? info.items.length : 0,
      gems: Array.isArray(info.gems) ? info.gems.length : 0,
      pets: Array.isArray(info.pets) ? info.pets.length : 0,
      swords: Array.isArray(info.swords) ? info.swords.length : 0,
      artifacts: Array.isArray(info.artifacts) ? info.artifacts.length : 0,
      valhalla: Array.isArray(info.valhalla) ? info.valhalla.length : 0,
      bloodline: Array.isArray(info.bloodline) ? info.bloodline.length : 0,
      fashion: Array.isArray(info.fashion) ? info.fashion.length : 0,
      formations: Array.isArray(info.formations) ? info.formations.length : 0,
      spirits: Array.isArray(info.spirits) ? info.spirits.length : 0,
      remaining: Number(player.items[id] || 0),
      tags: packets.map((entry) => entry.tag),
    });
  }
  const failed = rows.filter((row) => {
    if (row.result !== 0 || row.remaining !== 0) return true;
    if (row.expected === 'gems') return row.gems < 1;
    if (row.expected === 'pets') return row.pets < 1;
    if (row.expected === 'swords') return row.swords < 1;
    if (row.expected === 'artifacts') return row.artifacts < 1;
    if (row.expected === 'valhalla') return row.valhalla < 1;
    if (row.expected === 'bloodline') return row.bloodline < 1;
    return row.items + row.gems + row.pets + row.swords + row.artifacts + row.valhalla
      + row.bloodline + row.fashion + row.formations + row.spirits < 1;
  });
  if (failed.length) {
    console.error(JSON.stringify({ result: 'fail', failed, rows }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ result: 'ok', candidateCount: candidates.length, rows }, null, 2));
})().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });
