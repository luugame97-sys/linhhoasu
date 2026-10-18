/* Restore legacy bag-use routes; the server remains authoritative for rewards. */
(function (root) {
  'use strict';
  var VERSION = '20261014_legacy_boxes_v2';
  if (root.LhsSelectLegacyBoxesV1 && root.LhsSelectLegacyBoxesV1.version === VERSION) return;
  var rows = [
    { id: 90021, icon: 'select_elfPiece_02', quality: 2 },
    { id: 90022, icon: 'select_elfPiece_03', quality: 3 }
  ];
  var randomRows = [
    [474,99,'random_bid_07',7,474], [475,99,'random_bid_06',6,475],
    [476,99,'random_bid_04',4,476], [477,99,'random_bid_03',3,477],
    [478,99,'random_bid_02',2,478], [479,99,'random_bid_01',1,479],
    [100050,99,'random_artifact_01',5,1050], [100070,99,'random_artifactSoul_01',5,1060],
    [100100,1,'random_valhallaPiece_01',3],
    [100161,1,'random_curiosPiece_03',3], [100162,1,'random_curiosPiece_04',4],
    [100163,1,'random_curiosPiece_06',6], [100164,1,'random_curiosPiece_07',7],
    [100180,99,'random_curios_shop1_01',5,1100],
    [100186,1,'random_curiosPiece_shop1_03',3], [100187,1,'random_curiosPiece_shop1_04',4],
    [100188,1,'random_curiosPiece_shop1_06',6], [100191,1,'random_curiosPiece_shop2_03',3],
    [100192,1,'random_curiosPiece_shop2_04',4], [100193,1,'random_curiosPiece_shop2_06',6],
    [100210,99,'random_curios_shop2_01',5,1120], [100240,99,'random_curios_01',5,1140],
    [100260,99,'random_curios_01',5,1170], [100651,99,'random_homeland_02',4,1651],
    [100652,99,'random_homeland_03',6,1652], [100653,99,'random_homeland_04',7,1653]
  ];
  var api = root.LhsSelectLegacyBoxesV1 = { version: VERSION, installed: false, attempts: 0, patchedIds: [], randomIds: [], skippedIds: [] };
  function manager() { return root.GlobalManager || root.GameGlobalYDXZ || root.W; }
  function pieceIds(config) {
    var assets = config.AssetsConfig || {};
    var ids = Object.keys(config.ElfConfig || {}).map(function (key) { return config.ElfConfig[key]; })
      .filter(function (row) { return row && Number(row.quality) === 4 && row.piece && Number.isSafeInteger(Number(row.piece.id)); })
      .map(function (row) { return Number(row.piece.id); })
      .filter(function (id, index, list) {
        var asset = assets[id] || assets[String(id)];
        return asset && Number(asset.id) === id && Number(asset.type) === 1 && list.indexOf(id) === index;
      });
    return ids.sort(function (a, b) { return a - b; });
  }
  function sameRewards(actual, expected) {
    if (!Array.isArray(actual)) return false;
    if (actual.length !== expected.length) return false;
    return actual.every(function (row, index) {
      return row && Number(row.id) === expected[index].id && Number(row.count) === 1;
    });
  }
  function install() {
    api.attempts += 1;
    var managerRef = manager(), config = managerRef && managerRef.Config;
    if (!config || !config.AssetsConfig || !config.AssetsUseConfig || !config.ElfConfig) {
      if (api.attempts < 600) root.setTimeout(install, 250);
      return false;
    }
    var ids = pieceIds(config);
    if (!ids.length) {
      if (api.attempts < 600) root.setTimeout(install, 250);
      return false;
    }
    var expected = ids.map(function (id) { return { id: id, count: 1 }; });
    rows.forEach(function (row) {
      var assets = config.AssetsConfig || {};
      var asset = assets[row.id] || assets[String(row.id)];
      var use = config.AssetsUseConfig[row.id] || config.AssetsUseConfig[String(row.id)];
      if (!asset || Number(asset.id) !== row.id || Number(asset.type) !== 1 || asset.icon !== row.icon
        || Number(asset.quality) !== row.quality) {
        if (api.skippedIds.indexOf(row.id) < 0) api.skippedIds.push(row.id);
        return;
      }
      if (use && Number(use.type) !== 101) {
        if (api.skippedIds.indexOf(row.id) < 0) api.skippedIds.push(row.id);
        return;
      }
      if (use && Array.isArray(use.rewards) && use.rewards.length && !sameRewards(use.rewards, expected)) {
        if (api.skippedIds.indexOf(row.id) < 0) api.skippedIds.push(row.id);
        return;
      }
      use = use || { id: row.id, type: 101, attrs: [], conditions: [] };
      use.type = 101;
      use.rewards = expected.map(function (reward) { return { id: reward.id, count: 1 }; });
      config.AssetsUseConfig[row.id] = use;
      asset.useType = 101;
      if (api.patchedIds.indexOf(row.id) < 0) api.patchedIds.push(row.id);
    });
    randomRows.forEach(function (row) {
      var id = row[0], asset = config.AssetsConfig[id], use = config.AssetsUseConfig[id];
      if (!asset || Number(asset.id) !== id || Number(asset.type) !== row[1]
        || asset.icon !== row[2] || Number(asset.quality) !== row[3]
        || (row[4] != null && Number(asset.param) !== row[4])
        || (use && Number(use.type) !== 102)
        || (asset.useType != null && Number(asset.useType) !== 0 && Number(asset.useType) !== 102)) {
        if (api.skippedIds.indexOf(id) < 0) api.skippedIds.push(id);
        return;
      }
      if (!use) config.AssetsUseConfig[id] = { id: id, type: 102, attrs: [], conditions: [] };
      asset.useType = 102;
      if (api.randomIds.indexOf(id) < 0) api.randomIds.push(id);
    });
    api.installed = true;
    return true;
  }
  api.install = install;
  install();
}(window));
