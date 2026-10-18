'use strict';
const fs = require('fs'), path = require('path');
const base = path.resolve(__dirname, '../temp/item_boxes_20261002');
const catalog = JSON.parse(fs.readFileSync(path.join(base, 'definitions.json'), 'utf8'));
const definitions = [...catalog.boxes, ...(catalog.legacyBoxes || [])];
const guards = definitions.map(row => ({id:row.id,type:row.type,icon:row.icon,quality:row.quality,...(row.param != null ? {param:row.param} : {})}));
if (!guards.length || new Set(guards.map(row=>row.id)).size !== guards.length) throw new Error('invalid whitelist');
const source = `/* Verified item-box use routes. Reward pools remain authoritative on server. */
(function (root) {
  'use strict';
  var VERSION = '20261002_verified_boxes_v1';
  if (root.LhsItemBoxesV1 && root.LhsItemBoxesV1.version === VERSION) return;
  var rows = ${JSON.stringify(guards)};
  var api = root.LhsItemBoxesV1 = { version: VERSION, installed: false, attempts: 0, patchedIds: [], skippedIds: [] };
  function install() {
    api.attempts += 1;
    var m = root.GlobalManager || root.GameGlobalYDXZ || root.W;
    var config = m && m.Config;
    if (!config || !config.AssetsConfig || !config.AssetsUseConfig) {
      if (api.attempts < 600) root.setTimeout(install, 250);
      return false;
    }
    rows.forEach(function (row) {
      var asset = config.AssetsConfig[row.id];
      // Preserve all native select routes, conditions, priorities and limits.
      if (config.AssetsUseConfig[row.id]) return;
      if (!asset || Number(asset.id) !== row.id || Number(asset.type) !== row.type
        || asset.icon !== row.icon || Number(asset.quality) !== row.quality
        || (row.param != null && Number(asset.param) !== row.param)
        || (asset.useType != null && Number(asset.useType) !== 0 && Number(asset.useType) !== 102)) {
        if (api.skippedIds.indexOf(row.id) < 0) api.skippedIds.push(row.id);
        return;
      }
      config.AssetsUseConfig[row.id] = { id: row.id, type: 102, attrs: [], conditions: [] };
      asset.useType = 102;
      // These exact verified wrappers can already be held in inventory. Show
      // formerly hidden wrappers, preserving any explicit system unlock gate.
      if (!asset.ifShow) asset.ifShow = 1;
      asset.ifShowNum = 1;
      api.patchedIds.push(row.id);
    });
    api.installed = true;
    return true;
  }
  api.install = install;
  install();
}(window));
`;
const out = path.join(base, 'candidate/client/lhs-item-boxes-v1.js');
fs.mkdirSync(path.dirname(out), {recursive:true}); fs.writeFileSync(out, source);
console.log('Built client whitelist ' + guards.length + ': ' + out);
