'use strict';
// Static catalog and transitive reward-dependency audit. Never connects to a DB.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const WB = path.join(ROOT, '_ai_workbench');
const CONFIG = process.env.LHS_CONFIG_PATH || path.join(ROOT, 'linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin');
const LANG = process.env.LHS_LANG_PATH || path.join(ROOT, 'linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin');
process.env.CONFIG_BIN_PATH = CONFIG;
const config = require(path.join(process.env.LHS_APP_ROOT || path.join(ROOT, 'linhhoasu/lhs/newServer'), 'src/services/ConfigService'));
const tables = config.loadAllTables(CONFIG);
const assets = tables.AssetsConfig;
const uses = tables.AssetsUseConfig;
config.reload(LANG);
const language = config.get('LanguageConfig');
config.reload(CONFIG);
const fixture = JSON.parse(fs.readFileSync(path.join(WB, 'temp/items_recheck_fixture_20260905.json'), 'utf8'));
const blocked = new Set(fixture.rows.filter(r => r.status === 'LOI_DA_XAC_NHAN').map(r => r.id));
const rowMap = new Map(fixture.rows.map(r => [r.id, r]));
const name = id => language[assets[id]?.name]?.cn || '';
const useTypeCounts = {};
const missingUse = [], missingName = [], missingDescription = [], invalidRewardRefs = [], invalidCounts = [], syntheticOutputs = [], indirect = [], nativeMisroutes = [];
const nativeKinds = {ElfConfig: 'elves', CuriosConfig: 'curios', OrbConfig: 'orbs', ValhallaFormationConnectItemConfig: 'connects'};
for (const asset of Object.values(assets)) {
  const type = Number(asset.useType) || 0;
  useTypeCounts[type] = (useTypeCounts[type] || 0) + 1;
  if (type && !uses[asset.id]) missingUse.push(asset.id);
  if (!name(asset.id)) missingName.push(asset.id);
  if (asset.desc && !language[asset.desc]?.cn) missingDescription.push(asset.id);
}
function blockedPaths(id, seen = new Set()) {
  if (seen.has(id)) return [];
  const nextSeen = new Set([...seen, id]);
  const output = [];
  for (const reward of uses[id]?.rewards || []) {
    if (blocked.has(reward.id)) output.push([id, reward.id]);
    else if (uses[reward.id]) output.push(...blockedPaths(reward.id, nextSeen).map(p => [id, ...p]));
  }
  return output;
}
for (const use of Object.values(uses)) {
  for (const [index, reward] of (use.rewards || []).entries()) {
    if (!assets[reward.id]) invalidRewardRefs.push({id:use.id, name:name(use.id), index, reward});
    if (!Number.isSafeInteger(reward.id) || reward.id <= 0 || !Number.isSafeInteger(reward.count) || reward.count <= 0) invalidCounts.push({id:use.id,index,reward});
  }
  const result = rowMap.get(use.id);
  const paths = blockedPaths(use.id);
  if (!blocked.has(use.id) && paths.length) indirect.push({id:use.id,name:name(use.id),status:result?.status,paths});
  for (const test of result?.cases || []) {
    for (const reward of test.rewardInfo?.items || []) {
      for (const [table, field] of Object.entries(nativeKinds)) {
        if (test.result === 0 && tables[table]?.[reward.id] && test.after[field] === test.before[field]) {
          nativeMisroutes.push({id:use.id,name:name(use.id),params:test.params,reward,table,field,
            consumed:test.consumed,bagBefore:test.before.items[reward.id]||0,bagAfter:test.after.items[reward.id]||0,
            nativeBefore:test.before[field],nativeAfter:test.after[field],tags:test.tags});
        }
      }
    }
    const placeholders = (test.rewardInfo?.items || []).filter(r => assets[r.id]?.type === 99);
    if (test.result === 0 && placeholders.length) syntheticOutputs.push({id:use.id,name:name(use.id),params:test.params,outputs:placeholders.map(r=>({...r,name:name(r.id),icon:assets[r.id].icon,useType:assets[r.id].useType||0}))});
  }
}
const inventory = Object.values(assets).map(a => ({id:a.id,name:name(a.id),assetType:a.type,useType:a.useType||0,
  status:rowMap.get(a.id)?.status || 'STATIC_ONLY_NOT_TAG1300',issues:rowMap.get(a.id)?.issues || []}));
const payload={generatedAt:new Date().toISOString(),summary:{assets:inventory.length,useRows:Object.keys(uses).length,
  fixtureCases:fixture.rows.reduce((sum,r)=>sum+r.cases.length,0),useTypeCounts,
  missingUse:missingUse.length,missingName:missingName.length,missingDescription:missingDescription.length,
  invalidRewardRefs:invalidRewardRefs.length,invalidCounts:invalidCounts.length,
  syntheticOutputCases:syntheticOutputs.length,syntheticSourceIds:new Set(syntheticOutputs.map(r=>r.id)).size,
  indirectSourceIds:indirect.length,nativeMisrouteCases:nativeMisroutes.length,nativeMisrouteIds:new Set(nativeMisroutes.map(r=>r.id)).size,
  nativeByKind:Object.fromEntries(Object.keys(nativeKinds).map(table=>[table,{ids:[...new Set(nativeMisroutes.filter(r=>r.table===table).map(r=>r.id))],cases:nativeMisroutes.filter(r=>r.table===table).length}]))},missingUse,missingName,missingDescription,invalidRewardRefs,invalidCounts,syntheticOutputs,indirect,nativeMisroutes,inventory};
fs.writeFileSync(path.join(WB,'temp/item_catalog_recheck_20260905.json'),JSON.stringify(payload,null,2)+'\n');
console.log(JSON.stringify(payload.summary));
