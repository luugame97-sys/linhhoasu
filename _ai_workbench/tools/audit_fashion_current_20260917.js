'use strict';
// Runs against installed code, with persistence and network replaced before imports.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const app = process.env.FEATURE_APP || '/linhhoasu/lhs/newServer';
let networkAttempts = 0, memorySaves = 0;
const deny = () => { networkAttempts++; throw Error('AUDIT_NETWORK_DENIED'); };
require('net').Socket.prototype.connect = deny;
require('tls').connect = deny;
for (const name of ['http', 'https']) { require(name).request = deny; require(name).get = deny; }
global.fetch = deny;
const clone = value => JSON.parse(JSON.stringify(value));
function stub(rel, exports) {
  const filename = require.resolve(path.join(app, rel));
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
stub('src/logger', { info(){}, warn(){}, error(){}, debug(){} });
stub('src/services/PlayerService', {
  savePlayer: async (_id, player) => { memorySaves++; return clone(player); },
  drainPendingSaves: async () => {},
});
stub('src/services/RuntimeBus', { getWsServer: () => null });
const cfg = require(path.join(app, 'src/services/ConfigService'));
const tables = cfg.loadAllTables();
const appearance = require(path.join(app, 'src/services/RoleAppearanceService'));
const fashion = require(path.join(app, 'src/handlers/fashion'));
const item = require(path.join(app, 'src/handlers/item'));
const boxes = require(path.join(app, 'src/services/FashionBoxService'));
const langs = cfg.decodeTables(fs.readFileSync('/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin')).LanguageConfig;
const kindTables = ['FashionColorConfig','FashionDressLevelConfig','FashionChangeColorConfig','FashionBathConfig','FashionEndDressConfig'];
const results = { at: new Date().toISOString(), scope: 'live installed code/config; RAM fixtures only', counts: {}, failures: [], mismatches: [], passes: {}, suitRows: [] };
function variants(d) {
  const r = tables[kindTables[d.isSuit]]?.[d.id];
  if (!r) return [];
  const list = d.isSuit === 4 ? [[0,r]] : Object.entries(r).map(([k,v])=>[Number(k),v]);
  return list.flatMap(([color,v]) => [{color,row:v,parts:v.fashionIds||[],special:false}, ...(v.spFashionIds?.length ? [{color:color+100,row:v,parts:v.spFashionIds,special:true}] : [])]);
}
let seq = 0;
function player(role = {kungfuId:8,subJob:1}) {
  return { userId:'audit_fashion_ram_'+(++seq), playerId:'audit_ram', level:120, roleInfo:role, items:{}, currencies:{diamond:0,silver:0,gold:0}, fashionInfo:{curFashion:{},fashion:{},fashionMap:{},equipped:{},fashions:{},activateFashion:[],fashionData:[],sets:[],setId:0,suits:{},dress:[]} };
}
const own = (p, ids) => ids.forEach(id => appearance.grantFashionOwnership(p,id));
const session = p => ({userId:p.userId,player:p});
const ack = (r,tag) => (Array.isArray(r)?r:[r]).find(x=>x.tag===tag)?.data;
function check(kind, detail, condition, more={}) {
  results.counts[kind] = (results.counts[kind]||0)+1;
  if (condition) results.passes[kind]=(results.passes[kind]||0)+1;
  else results.failures.push({kind,...detail,...more});
}
function fund(p, cost) {
  for (const r of (Array.isArray(cost)?cost:[cost]).filter(Boolean)) {
    if (r.id === 1) p.currencies.diamond += Number(r.count)||0;
    else if (r.id === 2) p.currencies.silver += Number(r.count)||0;
    else if (r.id === 6) p.currencies.gold += Number(r.count)||0;
    else p.items[r.id] = (p.items[r.id]||0)+(Number(r.count)||0);
  }
}
async function main() {
  for (const d of Object.values(tables.FashionDressConfig)) {
    const vs=variants(d), a=tables.AssetsConfig[d.id];
    results.suitRows.push({id:d.id,name:langs[a?.name||d.name]?.cn||'',kind:d.isSuit,quality:a?.quality??null,variants:vs.length,box:boxes.isBox(d.id)});
    for (const v of vs) {
      if (d.id===28000 || !v.parts.length) continue;
      for (const id of v.parts) {
        const f=tables.FashionConfig[id];
        if (!f || f.dressId!==d.id) results.mismatches.push({kind:'part-parent',dressId:d.id,color:v.color,part:id,actual:f?.dressId??null});
        if ([0,2,3].includes(d.isSuit) && Number(f?.colorId||0)!==(v.special?v.color-100:v.color))
          results.mismatches.push({kind:'part-color',dressId:d.id,color:v.color,part:id,actual:f?.colorId??null});
        if (!tables.AssetsConfig[f?.itemId]) results.mismatches.push({kind:'part-asset',dressId:d.id,part:id});
      }
      for (const role of [{kungfuId:4,subJob:0},{kungfuId:8,subJob:1}]) {
        const p=player(role); own(p,v.parts); const s=session(p), set=d.isSuit===3?999:0;
        try {
          const r=ack(await fashion.handleChangeSuit({id:d.id,color:v.color,set},s,1802),1802);
          const restored=clone(p); appearance.ensureRoleAppearance(restored);
          const selection=set===999?restored.fashionInfo.sets.find(x=>x.id===999)?.selection:restored.fashionInfo.fashion;
          const missing=v.parts.filter(id=>selection?.[tables.FashionConfig[id]?.type]!==id);
          check('wear-normalize',{id:d.id,color:v.color,role:role.kungfuId},r?.result===0&&!missing.length,{ack:r?.result,missing});
        } catch(e) { check('wear-normalize',{id:d.id,color:v.color,role:role.kungfuId},false,{error:e.message}); }
      }
      if ([0,2,3].includes(d.isSuit) && (v.color>0||d.isSuit!==0)) {
        const p=player(), base=vs.find(x=>x.color===0);
        if ((d.isSuit===0||d.isSuit===3)&&v.color>0) own(p,base?.parts||[]);
        fund(p,v.row.cost); const s=session(p);
        try {
          const r=ack(await fashion.handleSuitColorUnlock({id:d.id,color:v.color},s,1803),1803);
          check('unlock-color',{id:d.id,color:v.color},r?.result===0&&v.parts.every(id=>appearance.hasFashionOwnership(p,id)),{ack:r?.result,cost:v.row.cost});
        } catch(e) {check('unlock-color',{id:d.id,color:v.color},false,{error:e.message});}
      }
    }
    if (boxes.isBox(d.id)) {
      const p=player(); p.items[d.id]=1; const s=session(p);
      try {
        const rewards=boxes.rewardsFor(d.id,1), r=ack(await item.handleUseItem({id:d.id,count:1},s,1300),1300);
        check('open-box',{id:d.id},r?.result===0&&p.items[d.id]===0&&rewards.every(x=>appearance.hasFashionOwnership(p,x.id)),{ack:r?.result,parts:rewards.map(x=>x.id)});
      } catch(e) {check('open-box',{id:d.id},false,{error:e.message});}
    }
    if (d.isSuit===1 && vs.length>1) {
      const p=player();own(p,vs.find(v=>v.color===0)?.parts||[]); const s=session(p);
      for (const v of vs.filter(v=>v.color>0).sort((a,b)=>a.color-b.color)) {
        const prior=vs.find(x=>x.color===v.color-1);fund(p,prior?.row.consumes);
        try { const r=ack(await fashion.handleDressStarUp({id:d.id,star:v.color},s,1804),1804);
          check('upgrade-star',{id:d.id,star:v.color},r?.result===0&&v.parts.every(id=>appearance.hasFashionOwnership(p,id)),{ack:r?.result});
        }catch(e){check('upgrade-star',{id:d.id,star:v.color},false,{error:e.message});}
      }
    }
  }
  const cosmetics=Object.values(tables.FashionConfig).filter(f=>[2,5,17].includes(f.type)||(f.type===301&&f.id>=23000&&f.id<24000));
  for(const f of cosmetics) {
    const p=player(),s=session(p);
    try {const grant=item.addRewardRowsToPlayer(p,[{id:f.itemId||f.id,count:1}],1);
      const r=ack(await fashion.handleChangeFashion({id:f.id,type:f.type,set:0},s,1801),1801);
      check('cosmetic-grant-wear',{id:f.id,type:f.type},r?.result===0&&appearance.hasFashionOwnership(p,f.id)&&p.fashionInfo.fashion[f.type]===f.id,{ack:r?.result});
    }catch(e){check('cosmetic-grant-wear',{id:f.id,type:f.type},false,{error:e.message});}
  }
  const assetIds=new Set([...Object.keys(tables.FashionDressConfig),...Object.values(tables.FashionConfig).map(x=>String(x.itemId))]);
  results.tables=Object.fromEntries(Object.entries(tables).filter(([n])=>/^Fashion/.test(n)||['AppearanceConfig','RoleGenderConfig','SpiritConfig','FormationConfig','SwordConfig','ArtifactConfig','SpecialArtifactConfig'].includes(n)));
  results.tables.AssetsConfig=Object.fromEntries(Object.entries(tables.AssetsConfig).filter(([id])=>assetIds.has(id)));
  results.tables.AssetsUseConfig=Object.fromEntries(Object.entries(tables.AssetsUseConfig).filter(([id])=>assetIds.has(id)||['99001','99002'].includes(id)));
  results.tables.LanguageConfig=Object.fromEntries(Object.entries(langs).filter(([id])=>assetIds.has(id)));
  results.configHashes=Object.fromEntries(Object.entries(tables).filter(([k])=>/^Fashion/.test(k)||['AssetsConfig','AppearanceConfig'].includes(k)).map(([k,v])=>[k,crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')]));
  results.networkAttempts=networkAttempts;results.memorySaves=memorySaves;results.productionWrites=0;
  process.stdout.write(JSON.stringify(results));
}
main().catch(e=>{process.stderr.write(e.stack+'\n');process.exitCode=1;});
