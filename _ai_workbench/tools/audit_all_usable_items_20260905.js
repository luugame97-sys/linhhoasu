'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const APP = path.resolve(process.env.LHS_APP_ROOT || path.join(ROOT, 'linhhoasu/lhs/newServer'));
const CONFIG = path.resolve(process.env.LHS_CONFIG_PATH
  || path.join(ROOT, 'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin'));
const LANG = path.resolve(process.env.LHS_LANG_PATH
  || path.join(ROOT, 'linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin'));
const OUTPUT = path.resolve(process.env.LHS_USABLE_ITEM_OUTPUT
  || path.join(ROOT, '_ai_workbench/temp/usable_item_audit_raw_20260905.json'));

process.env.CONFIG_BIN_PATH = CONFIG;
const config = require(path.join(APP, 'src/services/ConfigService'));
const playerService = require(path.join(APP, 'src/services/PlayerService'));
const item = require(path.join(APP, 'src/handlers/item'));

playerService.savePlayer = async (_userId, player) => player;
playerService.savePlayerDeferred = async (_userId, player) => player;
const timerCallbacks = new Map();
let nextTimerId = 1;
global.setTimeout = (callback) => {
  const id = nextTimerId;
  nextTimerId += 1;
  timerCallbacks.set(id, callback);
  return id;
};
global.clearTimeout = (id) => { timerCallbacks.delete(id); };

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function row(table, id) {
  return object(table)[id] || object(table)[String(id)] || null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function basePlayer(sourceItemId) {
  return {
    userId: 'usable-item-fixture',
    playerId: 'usable-item-fixture',
    name: 'usable-item-fixture',
    level: 999,
    exp: 0,
    roleInfo: { kungfuId: 4, subJob: 0, stage: 999999 },
    items: { [sourceItemId]: 10 },
    currencies: { diamond: 1000000000, silver: 1000000000, gold: 1000000000 },
    fashionInfo: {
      curFashion: {}, fashion: {}, fashionMap: {}, equipped: {}, fashions: {}, activateFashion: [],
      fashionData: [], suits: {}, suitColors: {}, starUp: {}, dress: [], sets: [], setId: 0,
      emoji: {}, emojiGroups: [],
    },
    formationInfo: {}, swordInfo: {}, spiritInfo: {}, artifactInfo: {}, petInfo: {}, petSoulInfo: {},
    equipInfo: { equipList: [], openList: [], setInfoMap: {}, curIndex: 0 },
    other_attr_info: {},
    itemUseRecords: {},
    shopInfo: { buyRecords: {}, pack: [] },
    rechargeInfo: { records: [], periodRecords: {}, totalRecharge: 0, totalrecharge: 0 },
    activityInfo: { datas: [], giftCodeRecords: {} },
    taskInfo: { tasks: {}, tasksMap: {} },
    raidInfo: {},
  };
}

function findPacket(result, tag, msgUid = null) {
  return (Array.isArray(result) ? result : [result]).find((packet) => (
    packet && packet.tag === tag && (msgUid == null || packet.msgUid === msgUid)
  )) || null;
}

function rewardCounts(info = {}) {
  const keys = [
    'items', 'equips', 'swords', 'pets', 'petSouls', 'artifacts', 'gems',
    'valhalla', 'bloodline', 'fashion', 'formations', 'spirits', 'elves', 'curios',
    'orbs', 'connects', 'emoji', 'sailor',
  ];
  return Object.fromEntries(keys.map((key) => [key, array(info[key]).length]));
}

function rewardTotal(counts) {
  return Object.values(counts).reduce((sum, value) => sum + number(value), 0);
}

function stateSummary(player, sourceItemId) {
  const items = { ...object(player.items) };
  delete items[String(sourceItemId)];
  return {
    items,
    currencies: clone(object(player.currencies)),
    fashion: array(object(player.fashionInfo).activateFashion).length,
    formations: array(object(player.formationInfo).owns).length,
    swords: array(object(player.swordInfo).data).length,
    pets: array(object(player.petInfo).pets).length,
    petSouls: array(object(object(player.other_attr_info).petSoulInfo).petSouls).length,
    artifacts: array(object(player.artifactInfo).artifacts).length,
    gems: array(object(object(player.other_attr_info).gemInfo).gems).length,
    valhalla: array(object(player.valhallaInfo).heros).length,
    bloodline: array(object(player.bloodlineInfo).data).length,
    elves: array(object(object(player.other_attr_info).elfInfo).elfData).length,
    curios: array(object(object(player.other_attr_info).curiosInfo).curiosData).length,
    orbs: array(object(object(player.artifactInfo).orbInfo).orbData).length,
    connects: array(object(object(player.other_attr_info).valhallaFormationInfo).connect)
      .reduce((sum, row) => sum + number(row && row.count), 0),
    emoji: array(object(player.fashionInfo).emojiGroups).length
      + Object.values(object(object(player.fashionInfo).emoji))
        .reduce((sum, rows) => sum + array(rows).length, 0),
    itemUseRecord: number(object(player.itemUseRecords)[String(sourceItemId)]),
    otherAttrRecord: number(object(object(player.other_attr_info).record)[String(sourceItemId)]),
  };
}

function meaningfulStateChanged(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function collectRewardReferences(tables, targetIds) {
  const references = new Map([...targetIds].map((id) => [id, []]));
  function walk(value, pathText, depth) {
    if (depth > 9 || value == null) return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${pathText}[${index}]`, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    const id = number(value.id);
    const count = number(value.count);
    if (id > 0 && count > 0 && references.has(id)
      && !pathText.startsWith('AssetsUseConfig.') && !pathText.startsWith('AssetsConfig.')) {
      const rows = references.get(id);
      if (rows.length < 40) rows.push(pathText);
    }
    Object.entries(value).forEach(([key, child]) => walk(child, `${pathText}.${key}`, depth + 1));
  }
  Object.entries(tables).forEach(([name, table]) => walk(table, name, 0));
  return references;
}

function staticIssues(asset, use) {
  const issues = [];
  const type = number(use && use.type);
  const rewards = array(use && use.rewards);
  const attrs = object(use && use.attrs);
  if (!asset) issues.push('MISSING_ASSETS_CONFIG');
  if (asset && number(asset.useType) !== type) issues.push('ASSET_USE_TYPE_MISMATCH');
  if ((type === 101 || type === 110 || type === 104 || type === 106) && rewards.length <= 0) {
    issues.push('SELECT_CONTAINER_HAS_NO_OPTIONS');
  }
  if (type === 102 && rewards.length > 0) issues.push('RANDOM_CONTAINER_HAS_INLINE_REWARDS_UNEXPECTED');
  if (type === 103 && rewards.length <= 0 && Object.keys(attrs).length <= 0) {
    issues.push('TYPE103_HAS_NO_REWARD_OR_ATTR');
  }
  if (type === 108) issues.push('SPECIAL_CLIENT_FLOW_NOT_TAG1300');
  return issues;
}

async function runUseCase(itemId, use, params = {}) {
  const player = basePlayer(itemId);
  const before = stateSummary(player, itemId);
  const msgUid = 700000 + itemId % 100000;
  let result;
  let error = '';
  try {
    result = await item.handleUseItem(
      { id: itemId, index: itemId, count: 1, ...params },
      { userId: player.userId, player },
      msgUid,
    );
  } catch (caught) {
    error = caught && caught.stack ? caught.stack : String(caught);
  }
  const response = result ? findPacket(result, 1300, msgUid) : null;
  const info = object(response && response.data && response.data.rewardInfo);
  const counts = rewardCounts(info);
  const after = stateSummary(player, itemId);
  const tags = (Array.isArray(result) ? result : [result]).filter(Boolean).map((packet) => number(packet.tag));
  return {
    params,
    error,
    result: number(response && response.data && response.data.result, -999),
    itemLeft: number(player.items && player.items[itemId]),
    consumed: Math.max(0, 10 - number(player.items && player.items[itemId])),
    rewardCounts: counts,
    rewardTotal: rewardTotal(counts),
    stateChanged: meaningfulStateChanged(before, after),
    before,
    after,
    tags,
    rewardInfo: info,
  };
}

async function main() {
  const tables = config.loadAllTables(CONFIG);
  const assets = object(tables.AssetsConfig);
  const uses = object(tables.AssetsUseConfig);
  config.reload(LANG);
  const language = object(config.get('LanguageConfig'));
  const names = Object.fromEntries(Object.entries(language).map(([key, value]) => [key, String(value && value.cn || '')]));
  config.reload(CONFIG);

  const targetIds = new Set(Object.values(uses).map((use) => number(use && use.id)).filter((id) => id > 0));
  const references = collectRewardReferences(tables, targetIds);
  const originalRandom = Math.random;
  let randomState = 1;
  Math.random = () => {
    randomState = (randomState * 48271) % 2147483647;
    return randomState / 2147483647;
  };
  const rows = [];
  try {
    const sortedUses = Object.values(uses).sort((left, right) => number(left && left.id) - number(right && right.id));
    for (let rowIndex = 0; rowIndex < sortedUses.length; rowIndex += 1) {
      const use = sortedUses[rowIndex];
      const id = number(use && use.id);
      if (id <= 0) continue;
      const asset = row(assets, id);
      const type = number(use.type);
      const rewards = array(use.rewards);
      const issues = staticIssues(asset, use);
      const cases = [];
      console.log(`USABLE_ITEM_START=${rowIndex + 1}/${sortedUses.length}:id=${id}:type=${type}:options=${rewards.length}`);

      if (type === 101 || type === 110 || type === 104 || type === 106) {
        if (rewards.length > 0) {
          for (let index = 0; index < rewards.length; index += 1) {
            cases.push(await runUseCase(id, use, { selects: { [index]: 1 } }));
          }
        } else {
          cases.push(await runUseCase(id, use, { selects: { 0: 1 } }));
        }
      } else if (type !== 108) {
        cases.push(await runUseCase(id, use));
      }

      if (cases.some((entry) => entry.error)) issues.push('HANDLER_EXCEPTION');
      if (type !== 108 && cases.some((entry) => entry.result !== 0)) issues.push('USE_RETURNS_FAILURE');
      if (type !== 108 && cases.some((entry) => entry.result === 0 && entry.consumed <= 0)) issues.push('USE_SUCCESS_WITHOUT_CONSUMING_SOURCE');
      if (type === 102 && cases.some((entry) => (
        entry.result === 0 && entry.consumed > 0 && entry.rewardTotal <= 0 && !entry.stateChanged
      ))) issues.push('RANDOM_CONTAINER_CONSUMED_WITHOUT_REWARD');
      if (type === 103 && rewards.length > 0 && Object.keys(object(use.attrs)).length <= 0
        && cases.some((entry) => entry.result === 0 && entry.rewardTotal <= 0)) {
        issues.push('TYPE103_CONFIGURED_REWARDS_NOT_GRANTED');
      }
      if ((type === 104 || type === 106) && rewards.length > 1) {
        const allGranted = cases.some((entry) => entry.result === 0 && entry.rewardTotal > 1);
        if (allGranted) issues.push('SELECT_CONTAINER_IGNORES_SELECTION_AND_GRANTS_ALL');
      }
      if ((type === 101 || type === 110) && rewards.length > 0
        && cases.some((entry) => entry.result !== 0 || entry.rewardTotal <= 0)) {
        issues.push('SELECT_OPTION_FAILED_OR_EMPTY');
      }
      if ((type === 105 || type === 107) && cases.some((entry) => entry.result === 0 && entry.rewardTotal <= 0)) {
        issues.push('CONFIGURED_CONTAINER_RETURNED_EMPTY');
      }

      const uniqueIssues = [...new Set(issues)];
      rows.push({
        id,
        name: names[String(asset && asset.name)] || '',
        description: names[String(asset && asset.desc)] || '',
        icon: String(asset && asset.icon || ''),
        assetType: number(asset && asset.type),
        assetSubType: number(asset && asset.subType),
        assetUseType: number(asset && asset.useType),
        useType: type,
        quality: number(asset && asset.quality),
        rewardRows: rewards,
        rewardCount: rewards.length,
        attrs: object(use.attrs),
        conditions: array(use.conditions),
        limitType: number(use.limitType),
        limit: number(use.limit),
        inboundReferences: references.get(id) || [],
        inboundReferenceCount: (references.get(id) || []).length,
        issues: uniqueIssues,
        cases,
      });
      if ((rowIndex + 1) % 25 === 0 || rowIndex + 1 === sortedUses.length) {
        console.log(`USABLE_ITEM_PROGRESS=${rowIndex + 1}/${sortedUses.length}:id=${id}`);
      }
    }
  } finally {
    Math.random = originalRandom;
  }

  const issueCounts = {};
  const typeCounts = {};
  rows.forEach((entry) => {
    typeCounts[String(entry.useType)] = (typeCounts[String(entry.useType)] || 0) + 1;
    entry.issues.forEach((issue) => { issueCounts[issue] = (issueCounts[issue] || 0) + 1; });
  });
  const confirmedPrefixes = [
    'HANDLER_EXCEPTION', 'USE_RETURNS_FAILURE', 'USE_SUCCESS_WITHOUT_CONSUMING_SOURCE',
    'RANDOM_CONTAINER_CONSUMED_WITHOUT_REWARD', 'TYPE103_CONFIGURED_REWARDS_NOT_GRANTED',
    'SELECT_CONTAINER_IGNORES_SELECTION_AND_GRANTS_ALL', 'SELECT_OPTION_FAILED_OR_EMPTY',
    'CONFIGURED_CONTAINER_RETURNED_EMPTY', 'SELECT_CONTAINER_HAS_NO_OPTIONS',
  ];
  rows.forEach((entry) => {
    entry.status = entry.issues.some((issue) => confirmedPrefixes.includes(issue))
      ? 'LOI_DA_XAC_NHAN'
      : (entry.issues.length > 0 ? 'CAN_TEST_NATIVE' : 'TINH_OK');
  });
  const statusCounts = {};
  rows.forEach((entry) => { statusCounts[entry.status] = (statusCounts[entry.status] || 0) + 1; });

  const payload = {
    result: 'PASS',
    generatedAt: new Date().toISOString(),
    appRoot: APP,
    configPath: CONFIG,
    languagePath: LANG,
    tableCount: Object.keys(tables).length,
    summary: { rows: rows.length, typeCounts, statusCounts, issueCounts },
    rows,
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ result: 'PASS', output: OUTPUT, summary: payload.summary }));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
