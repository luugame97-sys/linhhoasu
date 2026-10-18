'use strict';
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '../..');
process.env.CONFIG_BIN_PATH = path.join(root, '_ai_workbench/temp/petsoul_release_20261002/baseline/config.bin');
const config = require(path.join(root,'linhhoasu/lhs/newServer/src/services/ConfigService'));
const work = path.join(root, '_ai_workbench/temp/item_boxes_20261002');
const base = path.join(work,'baseline/server'), dest=path.join(work,'candidate/server');
const assets = config.get('AssetsConfig');
const defs = [];
function add(ids, kind, extra={}) {
  for(const id of ids) {
    const a=assets[id]; if(!a) throw new Error('missingasset:'+id);
    defs.push({id,kind,type:a.type,icon:a.icon,quality:a.quality,...(a.param===undefined?{}:{param:a.param}),...extra});
  }
}
add([100501,100502,100503,100511,100512,100513], 'orb');
for(let level=1;level<=9;level++) add([100700+level,100720+level],'connect',{level});
add([100033,100034,100035],'elf');
add([100023,100024,100025],'elfPiece');
add([100061,100062,100063,100071,100072,100073],'artifactSoul');
for(const [first,materialType] of [[100171,1],[100201,2]]) add([first,first+1,first+2,first+10,first+11,first+12],'curios',{materialType});
for(const first of [100231,100251]) add([first,first+1,first+2,first+10,first+11,first+12],'curios');
add([100174,100184],'curios');
for(const [id,rewards] of [[406,[[401,4],[402,4],[403,3]]],[408,[[401,8],[402,8],[403,6],[404,2]]],
 [432,[[427,4],[428,4],[429,3]]],[434,[[427,8],[428,8],[429,6],[430,2]]],
 [444,[[439,4],[440,4],[441,3]]],[446,[[439,8],[440,8],[441,6],[442,2]]]]) {
 add([id],'fixed',{rewards:rewards.map(([id,count])=>({id,count})),targetAssets:rewards.map(([id])=>{const a=assets[id];return{id,type:a.type,quality:a.quality,icon:a.icon,param:a.param};})});
}
for (const def of defs) {
  const tables={orb:'OrbConfig',connect:'ValhallaFormationConnectItemConfig',elf:'ElfConfig',elfPiece:'ElfConfig',curios:'CuriosConfig'};
  const rows=def.kind==='fixed'?def.rewards:def.kind==='artifactSoul' ? Object.values(config.get('ArtifactConfig')).filter(x=>x.type===2&&x.quality===def.quality&&assets[x.id]?.type===16)
    : Object.values(config.get(tables[def.kind])).filter(x=>assets[x.id]?.quality===def.quality
      && (def.kind!=='connect'||x.level===def.level) && (def.kind!=='curios'||def.materialType===undefined||x.materialType===def.materialType));
  def.poolIds=rows.map(x=>def.kind==='elfPiece'?x.piece.id:x.id).sort((a,b)=>a-b);
  if(!def.poolIds.length) throw new Error('empty verified pool:'+def.id);
}
fs.mkdirSync(path.join(dest,'services'),{recursive:true});
fs.mkdirSync(path.join(dest,'handlers'),{recursive:true});
let random=fs.readFileSync(path.join(base,'services/RandomUsableItemRewardService.js'),'utf8');
random=random.replace('// Random pools without an authoritative drop table are intentionally absent.', '// Unknown mixed-quality pools remain absent; explicit same-grade compatibility pools are defined below.');
const extra = `
// Compatibility convention: equal selection within the advertised, verified
// quality/level pool. This is not a recovered official CN drop distribution.
const VERIFIED_BOX_DEFINITIONS = Object.freeze(${JSON.stringify(defs,null,2)}.map(Object.freeze));
const VERIFIED_BOXES = new Map(VERIFIED_BOX_DEFINITIONS.map(row => [row.id, row]));
function isVerifiedBox(itemId) { return VERIFIED_BOXES.has(Number(itemId)); }
function getVerifiedBoxPool(itemId) {
  const def = VERIFIED_BOXES.get(Number(itemId));
  if (!def) return null;
  const assets = config.get('AssetsConfig') || {};
  const source = assets[def.id];
  if (!source || source.id !== def.id || source.type !== def.type || source.quality !== def.quality
    || source.icon !== def.icon || source.param !== def.param) return null;
  const sourceUse = (config.get('AssetsUseConfig') || {})[def.id];
  if (def.type === 1 && (!sourceUse || sourceUse.type !== 102)) return null;
  if(def.kind === 'fixed') {
    if(def.targetAssets.some(expected=>{const actual=assets[expected.id];return !actual||Object.keys(expected).some(key=>actual[key]!==expected[key]);})) return null;
    return def.poolIds.slice();
  }
  const tables = { orb:'OrbConfig', connect:'ValhallaFormationConnectItemConfig', elf:'ElfConfig', elfPiece:'ElfConfig', curios:'CuriosConfig' };
  let rows;
  if (def.kind === 'artifactSoul') {
    rows = Object.values(config.get('ArtifactConfig') || {}).filter(row => row.type === 2 && row.quality === def.quality
      && assets[row.id]?.type === 16 && assets[row.id]?.quality === def.quality);
  } else {
    rows = Object.values(config.get(tables[def.kind]) || {}).filter(row => {
      const asset = assets[row.id];
      if (!asset || asset.quality !== def.quality) return false;
      if (def.kind === 'connect') return row.level === def.level && asset.type === 38;
      if (def.kind === 'orb') return asset.type === 32;
      if (def.kind === 'curios') return row.quality === def.quality && (def.materialType === undefined || row.materialType === def.materialType) && asset.type === 24;
      return row.quality === def.quality && asset.type === 29;
    });
  }
  const ids = rows.map(row => def.kind === 'elfPiece' ? row.piece && row.piece.id : row.id);
  if (!ids.length || ids.some(id => !Number.isSafeInteger(id) || !assets[id]
    || assets[id].quality !== def.quality || (def.kind === 'elfPiece' && assets[id].type !== 1))) return null;
  const sorted = [...new Set(ids)].sort((a,b)=>a-b);
  if (sorted.length !== def.poolIds.length || sorted.some((id,index)=>id!==def.poolIds[index])) return null;
  return sorted;
}
function resolveVerifiedBox(itemId,count) {
  if (!Number.isSafeInteger(count) || count <= 0 || count > 10000) return null;
  const pool=getVerifiedBoxPool(itemId);
  if (!pool) return null;
  const def=VERIFIED_BOXES.get(Number(itemId));
  if(def.kind === 'fixed') return {rows:def.rewards.map(row=>({id:row.id,count:row.count*count}))};
  const merged=new Map();
  for(let i=0;i<count;i++) {
    const id=pool[Math.floor(Math.random()*pool.length)];
    merged.set(id,(merged.get(id)||0)+1);
  }
  return { rows:[...merged].map(([id,count])=>({id,count})) };
}
`;
random=random.replace('function resolveRandomRewardRows(_player, itemId, count = 1) {',extra+'\nfunction resolveRandomRewardRows(_player, itemId, count = 1) {\n  if (isVerifiedBox(itemId)) return resolveVerifiedBox(itemId, count);');
random=random.replace('module.exports = { resolveRandomRewardRows, getGemPackLevel, getGemRewardIdsByLevel };','module.exports = { resolveRandomRewardRows, getGemPackLevel, getGemRewardIdsByLevel, isVerifiedBox, getVerifiedBoxPool, VERIFIED_BOX_DEFINITIONS };');
fs.writeFileSync(path.join(dest,'services/RandomUsableItemRewardService.js'),random);
let item=fs.readFileSync(path.join(base,'handlers/item.js'),'utf8');
item=item.replace('(useType === 102 || itemId === 100802)','(useType === 102 || itemId === 100802 || randomItemRewards.isVerifiedBox(itemId))');
item=item.replace('if (itemId === 100802 && !randomPlan)', 'if ((itemId === 100802 || randomItemRewards.isVerifiedBox(itemId)) && !randomPlan)');
const marker='  consumeBagItem(player, itemId, count);\n\n  let taskChanged = false;';
if(item.split(marker).length!==2) throw new Error('consume marker not unique');
item=item.replace(marker,`  // Missing use rows must never debit a box without a supported reward path.
  // The same pool preflight also protects synthetic legacy wrappers.
  if (!useCfg && !randomPlan && !pillPlan && !emojiPlan) {
    const poolExists = (table, quality) => quality > 0 && Object.values(config.get(table) || {})
      .some(row => toSafeInt(row && row.quality, 0) === quality);
    const supported = getValhallaFragmentComposeItemId(itemId) > 0
      || poolExists('ValhallaConfig', getRandomValhallaPackQuality(itemId))
      || poolExists('PetConfig', getRandomPetPackQuality(itemId))
      || poolExists('BloodlineConfig', getRandomBloodlinePackQuality(itemId))
      || poolExists('ArtifactConfig', getRandomArtifactPackQuality(itemId))
      || randomItemRewards.getGemRewardIdsByLevel(getGemPackLevel(itemId)).length > 0
      || (asset && itemId >= 40001 && itemId < 50000 && Number.isSafeInteger(count * 100));
    if (!supported) return { tag: 1300, msgUid, data: { result: -1, code: 'ITEM_REWARD_POOL_UNVERIFIED' } };
  }

${marker}`);
fs.writeFileSync(path.join(dest,'handlers/item.js'),item);
let grant=fs.readFileSync(path.join(base,'services/RewardGrantService.js'),'utf8');
grant=grant.replace("if (asset && asset.type === 99 && /^random_connect_/.test(asset.icon || '')) {", "if (asset && asset.type === 99 && /^random_connect_/.test(asset.icon || '')\n      && !require('./RandomUsableItemRewardService').getVerifiedBoxPool(asset.id)) {");
fs.writeFileSync(path.join(dest,'services/RewardGrantService.js'),grant);
const legacyBoxes=[];
for(const [ids,table,kind] of [
 [[100001,100002,100003,100004,100005,100006,100007],'PetConfig','legacyPet'],
 [[100121,100122,100123,100124,100125],'ValhallaConfig','legacyValhalla'],
 [[100151,100152,100153,100154,100155,100156],'BloodlineConfig','legacyBloodline'],
 [[100051,100052,100053],'ArtifactConfig','legacyArtifact'],
]) for(const id of ids){const a=assets[id];const poolIds=Object.values(config.get(table)).filter(x=>x.quality===a.quality).map(x=>x.id).sort((a,b)=>a-b);if(poolIds.length) legacyBoxes.push({id,kind,type:a.type,icon:a.icon,quality:a.quality,param:a.param,poolIds});}
for(let level=1;level<=6;level++){const id=100090+level,a=assets[id];const poolIds=Object.values(config.get('GemLevelConfig')).filter(x=>x.level===level&&[1,2,3,4].includes(x.type)&&assets[x.id]?.type===18&&assets[x.id]?.quality===a.quality).map(x=>x.id).sort((a,b)=>a-b);if(poolIds.length)legacyBoxes.push({id,kind:'legacyGem',type:a.type,icon:a.icon,quality:a.quality,param:a.param,poolIds});}
fs.writeFileSync(path.join(work,'definitions.json'),JSON.stringify({distribution:'compatible_equal_within_verified_quality_or_level_not_official_CN',boxes:defs,legacyBoxes},null,2)+'\n');
console.log(JSON.stringify({count:defs.length,ids:defs.map(x=>x.id)}));
