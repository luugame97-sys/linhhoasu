'use strict';
const fs=require('fs'),path=require('path');
const wb=path.resolve(__dirname,'..'),out=path.join(wb,'temp/webshop_upgrade_20260906'),app=path.resolve(wb,'../linhhoasu/lhs/newServer');
process.env.NODE_ENV='test';process.env.LOG_DIR='';process.env.CONFIG_BIN_PATH=path.join(wb,'temp/component_client_fix_20260905/client.bin.before');
const log=require.resolve(path.join(app,'src/logger'));require.cache[log]={id:log,filename:log,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const c=require(path.join(app,'src/services/ConfigService')),t=c.loadAllTables();c.reload(path.join(wb,'temp/fashion_fix_20260905/lang.bin'));const lang=c.get('LanguageConfig');
const title=id=>lang[t.AssetsConfig[id]?.name||t.FashionDressConfig[id]?.name||id]?.cn||String(id);
const sets=[];
for(const d of Object.values(t.FashionDressConfig)){
 let variants=d.isSuit===1?t.FashionDressLevelConfig[d.id]:d.isSuit===2?t.FashionChangeColorConfig[d.id]:d.isSuit===3?t.FashionBathConfig[d.id]:d.isSuit===4?{0:t.FashionEndDressConfig[d.id]}:t.FashionColorConfig[d.id];
 for(const [color,v]of Object.entries(variants||{})){if(!v||!Array.isArray(v.fashionIds)||!v.fashionIds.length)continue;const parts=v.fashionIds.map(id=>({id,amount:1,name:title(id),type:t.FashionConfig[id]?.type,hidden:t.FashionConfig[id]?.showType===0||t.FashionConfig[id]?.showTypeTw===0}));
 if(!parts.some(p=>p.hidden))continue;sets.push({id:d.id,color:Number(color),key:d.id+':'+color,name:title(d.id),kind:d.isSuit,sendableBox:!!t.AssetsUseConfig[d.id],boxId:t.AssetsUseConfig[d.id]?d.id:null,parts,hiddenParts:parts.filter(x=>x.hidden).length,completeModel:[1,2,4].includes(d.isSuit),reward_items:parts.map(p=>({id:p.id,amount:1}))});}
}
fs.writeFileSync(path.join(out,'assets_meta.json'),JSON.stringify(Object.values(t.AssetsConfig).map(a=>({id:a.id,name:title(a.id),icon:a.icon,parent:t.FashionConfig[a.id]?.dressId||null,parentIcon:t.AssetsConfig[t.FashionConfig[a.id]?.dressId]?.icon||null})))+'\n');
fs.writeFileSync(path.join(out,'candidate/assets/item/hidden_fashion_sets.json'),JSON.stringify({generatedAt:new Date().toISOString(),sets},null,2)+'\n');console.log(JSON.stringify({assets:Object.keys(t.AssetsConfig).length,hiddenVariants:sets.length,hiddenSets:new Set(sets.map(s=>s.id)).size,sample:sets.find(s=>s.id===28040)}));
