'use strict';
// Extract source rows, not an import patch. Preserve CN balance/IDs verbatim.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const wb=path.resolve(__dirname,'..'),out=path.join(wb,'temp/fashion_cn_recovery_20260909'),app=path.resolve(wb,'../linhhoasu/lhs/newServer');
const logger=require.resolve(path.join(app,'src/logger'));require.cache[logger]={id:logger,filename:logger,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const service=require(path.join(app,'src/services/ConfigService'));
const downloaded=JSON.parse(fs.readFileSync(path.join(out,'config-download.json'))).files;
const cnPath=path.join(out,downloaded.find(r=>r.name==='config_bin').path),langPath=path.join(out,downloaded.find(r=>r.name==='config_lang_bin').path);
const cn=service.decodeTables(fs.readFileSync(cnPath)),lang=service.decodeTables(fs.readFileSync(langPath)).LanguageConfig,local=service.loadAllTables();
const ids=[28370,28380,28410],selected={},missing=[],resourceRefs=new Set(),languageIds=new Set();
function add(table,id){const row=cn[table]&&cn[table][id];if(row===undefined){missing.push({table,id});return;} (selected[table]||(selected[table]={}))[id]=row;return row;}
function walk(value,fn,key=''){if(Array.isArray(value))value.forEach(v=>walk(v,fn,key));else if(value&&typeof value==='object')Object.entries(value).forEach(([k,v])=>walk(v,fn,k));else fn(value,key);}
for(const id of ids){add('AssetsConfig',id);add('AssetsUseConfig',id);const dress=add('FashionDressConfig',id);
 add(['FashionColorConfig','FashionDressLevelConfig','FashionChangeColorConfig','FashionBathConfig','FashionEndDressConfig'][dress.isSuit],id);
}
const parts=Object.values(cn.FashionConfig).filter(row=>ids.includes(row.dressId));
for(const part of parts){add('FashionConfig',part.id);add('AssetsConfig',part.itemId);for(const id of part.appearIds||[])add('AppearanceConfig',id);}
const variants=ids.flatMap(id=>cn.FashionDressConfig[id].isSuit===4?[cn.FashionEndDressConfig[id]]:Object.values(cn.FashionDressLevelConfig[id]));
for(const row of variants){for(const item of row.consumes||[])add('AssetsConfig',item.id);for(const id of [row.skillId,row.cpSkill])if(id)add('SkillConfig',id);}
for(const id of ids)if(cn.FashionDressConfig[id].skillId)add('SkillConfig',cn.FashionDressConfig[id].skillId);
const rootActions=new Set(Object.values(selected.SkillConfig||{}).flatMap(s=>s.actions||[]));
for(const id of rootActions)add('SkillBehaviorConfig',id);
const actions=new Set(rootActions);
// Numeric effect args may contain constants; follow only existing nodes within
// these three skill families, and leave their raw args intact for integration.
for(const id of actions){const row=add('SkillEffectConfig',id);
 if(row)walk(row,(v,k)=>{if(k==='args'&&typeof v==='number'&&v>=100000&&cn.SkillEffectConfig[v])actions.add(v);});}
for(const id of actions){if(cn.SkillBehaviorConfig[id])add('SkillBehaviorConfig',id);if(cn.SkillEffectConfig[id])add('SkillEffectConfig',id);}
for(const row of Object.values(selected.AppearanceConfig||{}))if(row.wuqiEffectId){add('EffectConfig',row.wuqiEffectId);for(const table of ['EffectFlyConfig','EffectScaleConfig'])if(cn[table]?.[row.wuqiEffectId])add(table,row.wuqiEffectId);}
walk(selected,(value,key)=>{
 if(typeof value==='string'&&/^(sp_|icon_|head_|yr_|tcly_|attack_|ui_)/.test(value))resourceRefs.add(value);
 if(typeof value==='number'&&/name|desc|text|tips|notice/i.test(key)&&lang[value])languageIds.add(value);
});
selected.LanguageConfig=Object.fromEntries([...languageIds].sort((a,b)=>a-b).map(id=>[id,lang[id]]));
const comparison={};for(const [table,rows]of Object.entries(selected)){if(table==='LanguageConfig')continue;
 comparison[table]={missing:[],different:[],same:[]};for(const [id,row]of Object.entries(rows)){
  const old=local[table]?.[id];comparison[table][old===undefined?'missing':JSON.stringify(old)===JSON.stringify(row)?'same':'different'].push(Number(id));}}
const suits=ids.map(id=>{const rewards=cn.AssetsUseConfig[id].rewards,dress=cn.FashionDressConfig[id],levels=dress.isSuit===4?[cn.FashionEndDressConfig[id]]:Object.values(cn.FashionDressLevelConfig[id]);
 assert(rewards.every(r=>cn.FashionConfig[r.id]?.dressId===id));assert(levels.every(v=>v.fashionIds.every(p=>cn.FashionConfig[p]?.dressId===id)));
 return{id,nameCn:lang[cn.AssetsConfig[id].name]?.cn,nameVi:{28370:'Viêm Đế Tiêu Viêm',28380:'Võ Tổ Lâm Động',28410:'Tinh La Trùng Ảnh (tạm dịch)'}[id],isSuit:dress.isSuit,levels:levels.length,rewardIds:rewards.map(r=>r.id),fashionRows:parts.filter(r=>r.dressId===id).length,openingEffect:cn.FashionEndDressConfig[id]?.beginEffectId||null};});
const summary={sourceBuild:path.basename(cnPath),cnTables:Object.keys(cn).length,localTables:Object.keys(local).length,
 sourceHash:crypto.createHash('sha256').update(fs.readFileSync(cnPath)).digest('hex'),suits,rowsByTable:Object.fromEntries(Object.entries(selected).map(([name,rows])=>[name,Object.keys(rows).length])),comparison,missing,resourceRefs:[...resourceRefs].sort(),notes:['Source-only extraction; no gameplay import or production writes.','28410 contains opening-effect item 28416/type306 in addition to four outfit pieces.','SkillEffect args and CN-only fields need semantic review before integration.']};
for(const [name,data]of Object.entries({'config-subset.json':selected,'config-review.json':summary}))fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({suits,rowsByTable:summary.rowsByTable,missing,resourceReferences:resourceRefs.size,comparison:Object.fromEntries(Object.entries(comparison).map(([name,v])=>[name,{missing:v.missing.length,different:v.different.length,same:v.same.length}]))}));
