/**
 * ConfigService - 游戏配置表加载服务
 * 从客户端二进制配置文件中解码并缓存游戏数据表
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { BinJsonUtil, ByteArray } = require('../protocol/BinJsonUtil');
const logger = require('../logger');

// 配置文件路径（客户端 bin 文件），支持 CONFIG_BIN_PATH 环境变量覆盖
const CONFIG_PATH_CANDIDATES = [
  process.env.CONFIG_BIN_PATH,
  path.join(
    __dirname,
    '..',
    '..',
    '..',
    'update',
    'resource',
    'assets',
    'excel',
    'config_fashion_20260909.bin'
  ),
  path.join(
    __dirname,
    '..',
    '..',
    '..',
    'LHS-re',
    'update',
    'resource',
    'assets',
    'excel',
    'config_fashion_20260909.bin'
  ),
  path.join(
    __dirname,
    '..',
    '..',
    '..',
    'LHS-re',
    'update',
    'resource',
    'assets',
    'excel',
    'config_e5ac72c2.bin'
  ),
  path.join(
    __dirname,
    '..',
    '..',
    '..',
    'update',
    'resource',
    'assets',
    'excel',
    'config_e5ac72c2.bin'
  ),

  path.join(
    __dirname,
    '..',
    '..',
    '..',
    'LHS-re',
    'update',
    'resource',
    'assets',
    'excel',
    'config_d315747e.bin'
  ),
  path.join(
    __dirname,
    '..',
    '..',
    '..',
    'update',
    'resource',
    'assets',
    'excel',
    'config_d315747e.bin'
  ),
].filter(Boolean);

function resolveConfigPath(configPath) {
  if (configPath) return configPath;
  return CONFIG_PATH_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || CONFIG_PATH_CANDIDATES[0];
}

let _tables = null;

/**
 * 加载所有配置表
 * @param {string} [configPath] - 配置文件路径
 * @returns {Object} 配置表映射 { tableName: tableData }
 */
function loadAllTables(configPath) {
  if (_tables) return _tables;
  const binPath = resolveConfigPath(configPath);
  if (!fs.existsSync(binPath)) {
    throw new Error(`CONFIG_FILE_MISSING: ${binPath}`);
  }
  const tables = decodeTables(fs.readFileSync(binPath));
  // Fashion content is rolled out as a scoped overlay so the current
  // production config remains the baseline for every unrelated system.
  const overlayPaths = [
    process.env.FASHION_CONTENT_OVERLAY_PATH
      || path.join(__dirname, '..', '..', '..', 'update', 'resource', 'assets', 'fashion_overlay.json'),
    process.env.FASHION_CHOICE_OVERLAY_PATH
      || path.join(__dirname, '..', '..', '..', 'update', 'resource', 'assets', 'fashion_choice_overlay.json'),
    process.env.FASHION_CHOICE_STARS_OVERLAY_PATH
      || path.join(__dirname, '..', '..', '..', 'update', 'resource', 'assets', 'fashion_choice_stars_overlay.json'),
  ].filter(Boolean);
  overlayPaths.forEach((overlayPath) => {
    if (!fs.existsSync(overlayPath)) return;
    const overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf8'));
    Object.entries(overlay).forEach(([tableName, rows]) => {
      if (!tables[tableName] || !rows || typeof rows !== 'object') return;
      Object.entries(rows).forEach(([id, row]) => { tables[tableName][id] = row; });
    });
  });
  // Scoped 45→200 drop progression overlay; inert unless PM2 enables the drop flag.
  require('../config/dropLevel100').apply(tables);
  // Custom cultivation extension; inert unless the release flag is enabled.
  require('../config/roleLevel2000').apply(tables);
  // Extend the Yêu Vương encounter catalog only; keep the native fight,
  // sweep, rewards and cost handlers unchanged.
  require('../config/demonBossDrop200').apply(tables);
  require('../config/dropLevel46').apply(tables);
  ensureFishingRankConfig(tables);
  ensurePetChaosChoiceConfig(tables);
  require('../config/petGrid48').apply(tables);
  require('../config/petAutoAccess').apply(tables);
  require('../config/petPackageUnlimited').apply(tables);
  require('../config/featureDayAccess').apply(tables);
  require('../config/gemChoiceShop').apply(tables);
  validateGameplayTables(tables);
  _tables = tables;
  logger.info(`[Config] 已加载 ${Object.keys(_tables).length} 张配置表`);
  return _tables;
}

function ensurePetChaosChoiceConfig(tables) {
  if (!tables || !tables.AssetsConfig || !tables.AssetsUseConfig) return;
  if (!tables.AssetsConfig[90018]) {
    tables.AssetsConfig[90018] = {
      id: 90018,
      type: 1,
      subType: 0,
      quality: 10,
      name: 90018,
      desc: 10090018,
      icon: 'select_pet_09',
      itemWay: [],
      ifShow: 1,
      ifShowNum: 1,
      useType: 101,
    };
  }
  if (!tables.AssetsUseConfig[90018]) {
    tables.AssetsUseConfig[90018] = {
      id: 90018,
      type: 101,
      rewards: [
        { id: 810101, count: 1 },
        { id: 810201, count: 1 },
        { id: 810301, count: 1 },
        { id: 810401, count: 1 },
        { id: 810501, count: 1 },
      ],
      attrs: [],
      conditions: [],
    };
  }
}

function ensureFishingRankConfig(tables) {
  const table = tables && tables['Activity6RankConfig'];
  if (!table || typeof table !== 'object') return;
  const c6006 = table['6006'] || table[6006];
  if (!c6006 || typeof c6006 !== 'object') return;
  const expectedBoxes = {
    '1': 10,
    '2': 7,
    '3': 5,
    '4': 3,
    '11': 2,
    '51': 2,
    '101': 2,
    '501': 2
  };
  Object.entries(expectedBoxes).forEach(([bracketKey, boxCount]) => {
    const bracket = c6006[bracketKey] || c6006[Number(bracketKey)];
    if (bracket && Array.isArray(bracket.rewards)) {
      if (!bracket.rewards.some((r) => Number(r && r.id) === 99002)) {
        bracket.rewards.unshift({ id: 99002, count: boxCount });
      }
    }
  });
}

function decodeTables(buffer) {
  const tables = Object.create(null);
  const ba = new ByteArray(buffer);
  while (ba.position < ba.length) {
    const nameLen = ba.readUnsignedByte();
    if (nameLen <= 0 || ba.position + nameLen + 4 > ba.length) throw new Error('CONFIG_BAD_HEADER');
    const name = ba.readUTFBytes(nameLen);
    const dataLen = ba.readUnsignedInt();
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || Object.hasOwn(tables, name)) throw new Error('CONFIG_BAD_TABLE_NAME: ' + name);
    if (dataLen <= 0 || ba.position + dataLen > ba.length) throw new Error('CONFIG_BAD_TABLE_LENGTH: ' + name);
    const raw = buffer.slice(ba.position, ba.position + dataLen);
    ba.position += dataLen;
    try {
      const dec = zlib.inflateSync(raw);
      // zlib may return a slice of a pooled ArrayBuffer. Passing dec.buffer
      // loses the offset/length and decodes unrelated bytes from another table.
      tables[name] = BinJsonUtil.readFullJson(new ByteArray(dec));
    } catch (error) {
      throw new Error('CONFIG_DECODE_FAILED: ' + name, { cause: error });
    }
  }
  if (!Object.keys(tables).length) throw new Error('CONFIG_EMPTY');
  return tables;
}

function validateGameplayTables(tables) {
  const object = x => x && typeof x === 'object' && !Array.isArray(x);
  for (const name of ['AssetsConfig', 'PlantConfig', 'PlantMagicConfig', 'PlantBuildConfig', 'AlchemyBaseConfig', 'AlchemyFormulaConfig', 'AlchemyRoleConfig']) {
    if (!object(tables[name]) || !Object.keys(tables[name]).length) throw new Error('CONFIG_REQUIRED_TABLE: ' + name);
  }
  for (const id of [38, 39, 40]) {
    const row = tables.PlantConfig[id];
    if (row?.id !== id || !(row.growTime > 0) || !row.rewards?.some(r => r.id === 34)) throw new Error('CONFIG_INVALID_PLANT: ' + id);
  }
  if (!Number.isSafeInteger(tables.AlchemyBaseConfig.alchemyDailyCount) || tables.AlchemyBaseConfig.alchemyDailyCount <= 0) throw new Error('CONFIG_INVALID_ALCHEMY_BASE');
  for (const row of Object.values(tables.AlchemyFormulaConfig)) {
    if (tables.AssetsConfig[row.id]?.type !== 9 || !Array.isArray(row.consumes) || !row.consumes.length
      || row.consumes.some(r => !tables.AssetsConfig[r.id] || !Number.isSafeInteger(r.count) || r.count <= 0)
      || !object(row.qualityWeights) || !Object.keys(row.qualityWeights).length
      || Object.values(row.qualityWeights).some(r => tables.AssetsConfig[r.id]?.type !== 8 || !Number.isSafeInteger(r.weight) || r.weight <= 0)) throw new Error('CONFIG_INVALID_FORMULA: ' + row.id);
  }
  if (tables.AlchemyRoleConfig[1]?.id !== 1 || tables.PlantMagicConfig[1]?.reward?.id == null
    || tables.PlantBuildConfig[1]?.[1]?.level !== 1) throw new Error('CONFIG_INVALID_PROGRESSION');
}

/**
 * 获取指定配置表
 * @param {string} tableName - 配置表名称
 * @returns {*} 配置表数据，不存在返回 null
 */
function get(tableName) {
  const t = loadAllTables();
  return t[tableName] || null;
}

/**
 * 重新加载配置表（热更新用）
 */
function reload(configPath) {
  const previous = _tables;
  _tables = null;
  try { return loadAllTables(configPath); }
  catch (error) { _tables = previous; throw error; }
}

module.exports = { loadAllTables, get, reload, decodeTables, validateGameplayTables };
