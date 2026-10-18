'use strict';
const fs=require('fs'), path=require('path');
const root=path.resolve(__dirname,'../..');
const config=require(path.join(root,'linhhoasu/lhs/newServer/src/services/ConfigService'));
const baseline=process.argv[2]||'_ai_workbench/temp/petsoul_release_20261002/baseline/config.bin';
const tables=config.decodeTables(fs.readFileSync(path.join(root,baseline)));
const lang=config.decodeTables(fs.readFileSync(path.join(root,'linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin'))).LanguageConfig;
const assets=tables.AssetsConfig,uses=tables.AssetsUseConfig;
const rows=Object.values(assets).filter(a=>a.type===99||uses[a.id]?.type===102).map(a=>({id:a.id,name:lang[a.name]?.cn,desc:lang[a.desc]?.cn,type:a.type,useType:uses[a.id]?.type,quality:a.quality,icon:a.icon,param:a.param,visible:a.ifShow,refs:[]}));
const ids=new Map(rows.map(r=>[r.id,r]));
// Exact reward object references; avoid interpreting numeric prices/levels as IDs.
function walk(value,prefix,table){
 if(!value||typeof value!=='object')return;
 if(!Array.isArray(value)&&ids.has(value.id)&&Object.hasOwn(value,'count')&&/(?:^|\.)(?:[A-Za-z]*[Rr]ewards?|rewardItems|awardItems)(?:\.|$)/.test(prefix)){
  const r=ids.get(value.id); if(r.refs.length<20)r.refs.push({table,path:prefix,count:value.count});
 }
 for(const [key,child]of Object.entries(value))if(child&&typeof child==='object')walk(child,prefix+'.'+key,table);
}
for(const [name,table]of Object.entries(tables))if(!['AssetsConfig','AssetsUseConfig'].includes(name))walk(table,'',name);
const out=path.join(root,'_ai_workbench/temp/item_boxes_20261002/catalog.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({baseline,language:'local language labels only; gameplay from verified config',counts:{type99:rows.filter(r=>r.type===99).length,type102:rows.filter(r=>r.useType===102).length},rows},null,2));
console.log(rows.filter(r=>r.type===99&&r.visible).map(r=>`${r.id}\t${r.name}\t${r.desc}\t${r.refs.map(x=>x.table).filter((x,i,a)=>a.indexOf(x)===i).join(',')}`).join('\n'));
console.log('Saved',out);
