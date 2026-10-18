'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '../temp/drop46_release_20260914');
const sourcePath = path.join(root, 'linhhoasu/webgame/game/js/main.min_a6195824.js');
const outputPath = path.join(root, 'main.min_drop46_s1.js');
const input = fs.readFileSync(sourcePath, 'utf8');
const marker = 'm.onPlayerInfo=function(t){this.playerInfo=t,';
if ((input.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length !== 1) {
  throw new Error('CLIENT_PLAYER_INFO_MARKER_NOT_UNIQUE');
}
function applyDrop46Config(serverId) {
  var cfg = Y.Config, table = cfg.BoxConfig;
  if (!table || !table[45]) return;
  if (this._drop46Table !== table) {
    this._drop46Table = table;
    this._drop46Base45 = JSON.parse(JSON.stringify(table[45]));
    this._drop46Base46 = table[46] ? JSON.parse(JSON.stringify(table[46])) : null;
  }
  table[45] = JSON.parse(JSON.stringify(this._drop46Base45));
  if (Number(serverId) !== 1001) {
    if (this._drop46Base46) table[46] = JSON.parse(JSON.stringify(this._drop46Base46));
    else delete table[46];
    return;
  }
  var row = JSON.parse(JSON.stringify(this._drop46Base45)), weights = Array(45).fill(0);
  [5339, 3010, 922, 461, 200, 59, 8, 1].forEach(function (n, index) { weights[37 + index] = n; });
  table[45].levelUpCost = Array(5).fill(68000000);
  table[45].timeCost = 26136000;
  row.id = 46; row.mapId = 10046; row.levelUpCost = []; row.timeCost = 0;
  row.equipQualityWeight = weights; row.mapBossDropQuality = 45;
  row.mapBossShow = cfg.SceneConfig[cfg.MapConfig[10046].sceneId].mapBossShow;
  table[46] = row;
}
const helper = 'm.applyDrop46Config=' + applyDrop46Config.toString() + ',';
const patched = input.replace(marker, helper + marker.replace('{this.playerInfo=t,', '{this.applyDrop46Config(t&&t.serverId||sht.ServerID),this.playerInfo=t,'));
fs.writeFileSync(outputPath, patched);
const indexPath = path.join(root, 'linhhoasu/webgame/game/index.html');
let index = fs.readFileSync(indexPath, 'utf8');
const old = 'js/main.min_a6195824.js?v=20260914_auto_sell_fix_v2';
if (!index.includes(old)) throw new Error('CLIENT_INDEX_MARKER_MISSING');
index = index.replace(old, 'js/main.min_drop46_s1.js?v=20260914_drop46_s1_v2');
fs.writeFileSync(path.join(root, 'index_drop46_s1.html'), index);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
fs.writeFileSync(path.join(root, 'client_drop46_function.js'), 'module.exports=' + applyDrop46Config.toString());
console.log(JSON.stringify({ result: 'BUILT', marker: '20260914_drop46_s1_v2', bytes: Buffer.byteLength(patched), sha256: sha(patched), indexSha256: sha(index) }, null, 2));
