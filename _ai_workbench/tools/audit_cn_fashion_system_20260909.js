'use strict';
// Exhaustive table/row inventory and dependency collection; never writes game data.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const wb=path.resolve(__dirname,'..'),out=path.join(wb,'temp/fashion_cn_recovery_20260909'),app=path.resolve(wb,'../linhhoasu/lhs/newServer');
const log=require.resolve(path.join(app,'src/logger'));require.cache[log]={id:log,filename:log,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const svc=require(path.join(app,'src/services/ConfigService')),downloads=JSON.parse(fs.readFileSync(path.join(out,'config-download.json'))),build=JSON.parse(fs.readFileSync(path.join(out,'current-build.json')));
const source=path.join(out,downloads.files.find(r=>r.name==='config_bin').path),cn=svc.decodeTables(fs.readFileSync(source)),vn=svc.loadAllTables();
const cnLang=svc.decodeTables(fs.readFileSync(path.join(out,downloads.files.find(r=>r.name==='config_lang_bin').path))).LanguageConfig;
const vnLang=svc.decodeTables(fs.readFileSync(path.resolve(wb,'../linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin'))).LanguageConfig;
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const typeNames={2:'Cánh',5:'Thú cưỡi',17:'Pháp bảo',101:'Danh hiệu',102:'Ảnh đại diện',103:'Khung đại diện',104:'Bong bóng chat',105:'Vệt di chuyển',106:'Ngoại quan giao diện phụ',107:'Chủ đề giao diện',200:'Nền',301:'Vũ khí',302:'Mũ',303:'Áo',304:'Hiệu ứng kết liễu',305:'Diện mạo suối nóng',306:'Hiệu ứng vào trận',309:'Quần'};
function names(id,table='AssetsConfig'){const a=cn[table]?.[id],b=vn[table]?.[id];return {nameCn:cnLang[a?.name]?.cn||'',nameVi:vnLang[b?.name??a?.name]?.cn||''};}
function status(table,id){return vn[table]?.[id]===undefined?'added':same(cn[table]?.[id],vn[table][id])?'same':'changed';}
function tableFor(d){return ['FashionColorConfig','FashionDressLevelConfig','FashionChangeColorConfig','FashionBathConfig','FashionEndDressConfig'][d?.isSuit];}
function variants(t,id){const d=t.FashionDressConfig[id],rows=t[tableFor(d)]?.[id];return !rows?[]:d.isSuit===4?[[0,rows]]:Object.entries(rows).map(([key,row])=>[Number(key),row]);}
const tableDiffs={},delta={},fullFashion={};
for(const table of [...new Set([...Object.keys(cn),...Object.keys(vn)])].filter(n=>/^Fashion/.test(n)).sort()){
 const a=cn[table]||{},b=vn[table]||{};fullFashion[table]=a;
 const keys=Object.keys(a),added=keys.filter(k=>b[k]===undefined),changed=keys.filter(k=>b[k]!==undefined&&!same(a[k],b[k])),removed=Object.keys(b).filter(k=>a[k]===undefined);
 tableDiffs[table]={cn:keys.length,vn:Object.keys(b).length,added,changed,removed};
 delta[table]={added:Object.fromEntries(added.map(k=>[k,a[k]])),changed:Object.fromEntries(changed.map(k=>[k,{vn:b[k],cn:a[k]}])),removed:Object.fromEntries(removed.map(k=>[k,b[k]]))};
}
const integrity=[],alternateRenderReferences=[],suitRows=[],newPartsByDress={},typeCounts={};
for(const d of Object.values(cn.FashionDressConfig)){
 const list=variants(cn,d.id),oldList=variants(vn,d.id),use=cn.AssetsUseConfig[d.id],asset=cn.AssetsConfig[d.id];
 const parts=Object.values(cn.FashionConfig).filter(r=>r.dressId===d.id),oldParts=Object.values(vn.FashionConfig).filter(r=>r.dressId===d.id);
 for(const [key,v]of list)for(const id of [...(v.fashionIds||[]),...(v.spFashionIds||[])]){const p=cn.FashionConfig[id];if(!p||p.dressId!==d.id)integrity.push({kind:'suit-part',dressId:d.id,variant:key,partId:id,partDress:p?.dressId||null});}
 const base=list.find(([key])=>key===0)?.[1],rewardIds=(use?.rewards||[]).map(r=>r.id),baseIds=base?.fashionIds||[];
 suitRows.push({id:d.id,...names(d.id,'FashionDressConfig'),type:d.isSuit,status:status('FashionDressConfig',d.id),
  variantsCn:list.length,variantsVn:oldList.length,newVariants:list.filter(([key])=>!oldList.some(([other])=>other===key)).map(([key,v])=>({key,name:cnLang[v.name]?.cn||'',parts:v.fashionIds,conditions:v.conditions,showType:v.showType,showTypeTw:v.showTypeTw,openDay:v.openDay,star:v.star})),
  partsCn:parts.length,partsVn:oldParts.length,specialVariants:list.filter(([key,v])=>v.spFashionIds).map(([key,v])=>({key,parts:v.spFashionIds})),box:!!(asset?.type===100&&use?.type===105),rewardIds,extraRewards:rewardIds.filter(id=>!baseIds.includes(id)),
  consumes:list.map(([key,v])=>({key,consumes:v.consumes||v.cost||null,openDay:v.openDay,showType:v.showType,showTypeTw:v.showTypeTw,privilege:v.privilege})),
  boxGuardCompatible:!!(asset?.type===100&&use?.type===105&&baseIds.length&&same([...rewardIds].sort((a,b)=>a-b),[...baseIds].sort((a,b)=>a-b)))});
}
for(const row of Object.values(cn.FashionConfig)){
 const group=typeCounts[row.type]||(typeCounts[row.type]={name:typeNames[row.type]||'Chưa gán nhãn',cn:0,vn:0,added:0,changed:0});group.cn++;group[status('FashionConfig',row.id)]!==undefined&&group[status('FashionConfig',row.id)]++;
 if(!cn.AssetsConfig[row.itemId])integrity.push({kind:'part-asset',id:row.id,itemId:row.itemId});
 for(const id of row.appearIds||[])if(!cn.AppearanceConfig[id]){
  if(row.type===107&&cn.FashionBtnConfig[id])alternateRenderReferences.push({id:row.id,table:'FashionBtnConfig',key:id});
  else integrity.push({kind:'part-appearance',id:row.id,appearId:id});
 }
 if(row.dressId&&!cn.FashionDressConfig[row.dressId])integrity.push({kind:'part-parent',id:row.id,dressId:row.dressId});
 if(status('FashionConfig',row.id)==='added'&&row.dressId)(newPartsByDress[row.dressId]||(newPartsByDress[row.dressId]=[])).push(row.id);
}
for(const row of Object.values(vn.FashionConfig)){const group=typeCounts[row.type]||(typeCounts[row.type]={name:typeNames[row.type]||'',cn:0,vn:0,added:0,changed:0});group.vn++;}
const partRows=Object.values(cn.FashionConfig).map(r=>({id:r.id,itemId:r.itemId,type:r.type,typeName:typeNames[r.type]||'',dressId:r.dressId||null,colorId:r.colorId||0,...names(r.itemId),status:status('FashionConfig',r.id),row:r}));
const related={},missingDependencies=[];
function add(table,id){if(cn[table]?.[id]!==undefined){(related[table]||(related[table]={}))[id]=cn[table][id];return cn[table][id];}missingDependencies.push({table,id});}
function walk(v,fn,key=''){if(Array.isArray(v))v.forEach(x=>walk(x,fn,key));else if(v&&typeof v==='object')Object.entries(v).forEach(([k,x])=>walk(x,fn,k));else fn(v,key);}
const rootSkills=new Set();
for(const [table,rows]of Object.entries(fullFashion))walk(rows,(value,key)=>{if(typeof value==='number'&&(key==='skillId'||key==='cpSkill'))rootSkills.add(value);});
for(const r of Object.values(cn.FashionConfig)){add('AssetsConfig',r.itemId);for(const id of r.appearIds||[])if(!(r.type===107&&cn.FashionBtnConfig[id]))add('AppearanceConfig',id);}
for(const d of Object.values(cn.FashionDressConfig)){if(cn.AssetsConfig[d.id])add('AssetsConfig',d.id);if(cn.AssetsUseConfig[d.id])add('AssetsUseConfig',d.id);}
walk(fullFashion,(v,k)=>{if(k==='id'&&typeof v==='number'&&cn.AssetsConfig[v]&&v<10000)add('AssetsConfig',v);});
const actions=new Set(),effectIds=new Set();for(const id of rootSkills){const row=add('SkillConfig',id);for(const action of row?.actions||[]){actions.add(action);effectIds.add(action);}}
for(const id of actions)if(cn.SkillBehaviorConfig[id])add('SkillBehaviorConfig',id);
for(const id of effectIds){const row=add('SkillEffectConfig',id);if(row)walk(row,(v,k)=>{if(k==='args'&&typeof v==='number'&&v>=100000&&cn.SkillEffectConfig[v])effectIds.add(v);});}
for(const row of Object.values(related.AppearanceConfig||{}))for(const k of ['wuqiEffectId'])if(row[k]){add('EffectConfig',row[k]);for(const table of ['EffectFlyConfig','EffectScaleConfig'])if(cn[table]?.[row[k]])add(table,row[k]);}
const allStrings=new Set(),deltaStrings=new Set(),languageIds=new Set();
const strings=v=>walk(v,(value,key)=>{if(typeof value==='string'&&value&&value.length<180)allStrings.add(value);if(typeof value==='number'&&/name|desc|text|tips|notice/i.test(key)&&cnLang[value])languageIds.add(value);});
strings(fullFashion);strings(related);
for(const [table,rows]of Object.entries({...fullFashion,...related}))for(const [id,row]of Object.entries(rows))if(status(table,id)!=='same')walk(row,v=>{if(typeof v==='string'&&v&&v.length<180)deltaStrings.add(v);});
const relatedDiffs={};for(const [table,rows]of Object.entries(related)){const count={total:Object.keys(rows).length,added:0,changed:0,same:0};for(const id of Object.keys(rows))count[status(table,id)]++;relatedDiffs[table]=count;}
const langDiff={missing:[],same:[],different:[]};for(const id of languageIds){const v=vnLang[id],c=cnLang[id];langDiff[v===undefined?'missing':same(v,c)?'same':'different'].push(id);}
const existingVariantChanges=suitRows.filter(r=>r.status!=='added'&&(r.newVariants.length||tableDiffs[tableFor(cn.FashionDressConfig[r.id])]?.changed.includes(String(r.id))));
const summary={at:new Date().toISOString(),sourceBuild:build.js.find(n=>/main\.min/.test(n)),sourceConfig:path.basename(source),sourceHash:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
 cnTotalTables:Object.keys(cn).length,vnTotalTables:Object.keys(vn).length,tableDiffs,relatedDiffs,typeCounts,suitRows,existingVariantChanges,newPartsByDress,
 newStandalone:partRows.filter(r=>r.status==='added'&&!r.dressId),changedParts:partRows.filter(r=>r.status==='changed'),integrity,alternateRenderReferences,
 missingDependencies:[...new Map(missingDependencies.map(x=>[JSON.stringify(x),x])).values()],language:{referenced:languageIds.size,...langDiff},
 scope:'All Fashion* tables, every FashionConfig row, parent/variant membership, directly related assets/appearance/skills/effects; static audit, no production import.'};
for(const [name,data]of Object.entries({'system-audit.json':summary,'fashion-cn-tables.json':fullFashion,'fashion-table-deltas.json':delta,'fashion-related-cn.json':related,
 'fashion-inventory.json':partRows,'fashion-language-cn.json':Object.fromEntries([...languageIds].map(id=>[id,cnLang[id]])),
 'resource-inputs.json':{all:[...allStrings].sort(),delta:[...deltaStrings].sort()}}))fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({build:summary.sourceBuild,tables:[summary.vnTotalTables,summary.cnTotalTables],newSuits:suitRows.filter(r=>r.status==='added'),existingVariantChanges,
 tableDiffs:Object.fromEntries(Object.entries(tableDiffs).map(([k,v])=>[k,{vn:v.vn,cn:v.cn,added:v.added.length,changed:v.changed.length,removed:v.removed.length}])),
 newStandalone:summary.newStandalone.length,newPartsByDress:Object.fromEntries(Object.entries(newPartsByDress).map(([k,v])=>[k,v.length])),integrity:integrity.slice(0,12),integrityCount:integrity.length,missingDependencies:summary.missingDependencies.slice(0,12),missingDependencyCount:summary.missingDependencies.length,relatedDiffs,languageMissing:langDiff.missing.length}));
