'use strict';
const fs=require('fs'),path=require('path');const root=path.resolve('_ai_workbench/temp/fishing_audit_20260906T211352Z'),out=path.resolve('_ai_workbench/temp/fishing_notice_20260907');
process.env.CONFIG_BIN_PATH=path.join(root,'server.bin');process.env.LOG_DIR='';
const c=require(path.resolve('linhhoasu/lhs/newServer/src/services/ConfigService')),t=c.loadAllTables(),lang=c.reload(path.join(root,'lang.bin')).LanguageConfig;
const grants=[];
function walk(o,p){if(!o||typeof o!=='object')return;if(o.id===119&&o.count!==undefined)grants.push({path:p,row:o});for(const[k,v]of Object.entries(o))if(v&&typeof v==='object')walk(v,p+'.'+k);}
for(const[k,v]of Object.entries(t))walk(v,k);
const sources=['services/FishingGameplayService.js','services/FishingEventService.js','handlers/fish.js','handlers/fish-soul.js'];
const refs=sources.map(rel=>({file:rel,item119References:(fs.readFileSync(path.join(root,'app/src',rel),'utf8').match(/\b119\b/g)||[]).length}));
const result={item:t.AssetsConfig[119],name:lang[119].cn,description:lang[10000119].cn,
 showOnly:grants.filter(r=>r.path.includes('showRewards')).length,costRows:grants.filter(r=>r.path.includes('.cost.')).length,
 actualRewardRows:grants.filter(r=>!r.path.includes('showRewards')&&!r.path.includes('.cost.')),sources:refs,
 dropRateConfigured:false,conclusion:'Item119 shown by Activity33 and spent by type10 shop; no item119 grant or probability in current fishing services or supplied reward tables. Needs explicit source/rate/lifecycle decision, no retroactive grants.'};
fs.writeFileSync(path.join(out,'currency-audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
