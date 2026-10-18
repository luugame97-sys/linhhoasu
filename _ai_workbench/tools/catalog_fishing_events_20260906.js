'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(process.argv[2]),app=path.join(root,'app');
process.env.NODE_ENV='test';process.env.LOG_DIR='';process.env.CONFIG_BIN_PATH=path.join(root,'server.bin');
const logger=require.resolve(path.join(app,'src/logger'));require.cache[logger]={id:logger,filename:logger,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const cfg=require(path.join(app,'src/services/ConfigService')),tables=cfg.loadAllTables(),lang=cfg.reload(path.join(root,'lang.bin'));cfg.reload(path.join(root,'server.bin'));
function name(id){const row=lang.LanguageConfig?.[id]||tables.LanguageConfig?.[id];return typeof row==='string'?row:row?.cn||row?.text||row?.value||String(id);}
const out={tableNames:Object.keys(tables).filter(k=>/Fish|Activity|Language/.test(k)),langTables:Object.keys(lang),gear:{},activities:{}};
for(const table of ['FishRodConfig','FishRaftConfig','FishSceneConfig'])out.gear[table]=Object.values(tables[table]||{}).map(row=>({...row,translatedName:name(row.name||tables.AssetsConfig[row.id]?.name),translatedDesc:name(row.desc),asset:tables.AssetsConfig[row.id],shop:tables.ShopConfig[row.shopId]}));
for(const type of [6,33])out.activities[type]=Object.values(tables.ActivityConfig||{}).filter(r=>r.activityType===type).map(row=>({...row,translatedName:name(row.name),typeConfig:tables['Activity'+type+'Config']?.[row.id]}));
out.activityTables=Object.fromEntries(out.tableNames.filter(k=>/^Activity(?:6|33)/.test(k)).map(k=>[k,tables[k]]));
out.base=tables.ActivityBaseConfig;out.sampleLanguage=Object.entries(lang[Object.keys(lang)[0]]||{}).slice(0,3);
fs.writeFileSync(path.join(root,'catalog-initial.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({result:'CATALOG_WRITTEN',rods:out.gear.FishRodConfig.length,rafts:out.gear.FishRaftConfig.length,registeredType33:out.activities[33].length,registeredType6:out.activities[6].length,artifact:path.join(root,'catalog-initial.json')}));
