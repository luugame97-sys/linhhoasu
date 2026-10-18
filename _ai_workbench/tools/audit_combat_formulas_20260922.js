'use strict';
// Diagnostic only: execute immutable runtime source in an isolated VM, read DB.
const fs=require('fs'),vm=require('vm'),cp=require('child_process'),crypto=require('crypto');
const pm=JSON.parse(cp.execSync('pm2 jlist',{encoding:'utf8'})).filter(p=>/^lhs-s100[12]$/.test(p.name));
const getEnv=(p,k)=>p.pm2_env[k]??p.pm2_env.env?.[k];
for(const k of ['SERVER_ID','CONFIG_BIN_PATH','DROP_LEVEL_100_ENABLED','DROP_LEVEL_100_DISABLED','DROP_LEVEL_46_ENABLED','FASHION_CONTENT_OVERLAY_PATH','FASHION_CHOICE_OVERLAY_PATH','FASHION_CHOICE_STARS_OVERLAY_PATH'])if(getEnv(pm[0],k)!=null)process.env[k]=String(getEnv(pm[0],k));
const lp=require.resolve('./src/logger');require.cache[lp]={id:lp,filename:lp,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const cfg=require('./src/services/ConfigService'),battle=require('./src/services/BattleService'),read=require('./src/services/ArenaReadModelService');
const {MongoClient}=require('mongodb'),clone=x=>JSON.parse(JSON.stringify(x)),hash=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const path=require.resolve('./src/services/BattleService'),src=fs.readFileSync(path,'utf8'),client=fs.readFileSync('/linhhoasu/webgame/game/js/main.min_drop100.js','utf8');
const lang=cfg.decodeTables(fs.readFileSync('/linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin')).LanguageConfig;
const attrs=cfg.get('AttrConfig');
function method(marker){const start=client.indexOf(marker);if(start<0)throw Error('METHOD_NOT_FOUND '+marker);const begin=start+marker.length;let depth=1,end=begin;for(;end<client.length&&depth;end++){if(client[end]==='{')depth++;else if(client[end]==='}')depth--;}return {offset:start,body:client.slice(begin,end-1)};}
const native=method('C.attrModify=function(t){'),categories=method('C.changeAllAttr=function(){');
const nativeFn=vm.runInNewContext('(function(t){'+native.body+'})',{Y:{Config:{AttrConfig:attrs}},ec:{copyDataHandler:clone}});
const helperNames=[...src.matchAll(/function (add\w+Attrs)\(base, player/g)].map(m=>m[1]);
const mod={exports:{}};vm.runInNewContext(src+'\nmodule.exports.__audit={applyPercentLinkedAttrs,addAttrs,calcElementDamage,applyBattleDamageRates,'+helperNames.join(',')+'};',{module:mod,exports:mod.exports,require:require('module').createRequire(path)});
const audit=mod.exports.__audit;
function empty(){return Object.fromEntries(Object.keys(attrs).map(k=>[k,0]));}
function diff(a,b){return Object.keys({...a,...b}).filter(k=>a[k]!==b[k]).map(id=>({id:Number(id),native:a[id],server:b[id]}));}
const checks=[];
for(const row of Object.values(attrs))if(row.linkId?.length){const input=empty();for(const dest of row.linkId)input[dest]=10000;input[row.id]=1000;const a=nativeFn(clone(input)),b=clone(input);audit.applyPercentLinkedAttrs(b);checks.push({id:row.id,dataType:row.dataType,linkId:row.linkId,diff:diff(a,b)});}
const pair=empty();pair[1]=10000;const hpLinks=Object.values(attrs).filter(r=>r.dataType===2&&r.linkId?.includes(1));if(hpLinks.length>=2){pair[hpLinks[0].id]=1000;pair[hpLinks[1].id]=2000;const a=nativeFn(clone(pair)),b=clone(pair);audit.applyPercentLinkedAttrs(b);checks.push({kind:'two_percent_same_base',inputs:{1:10000,[hpLinks[0].id]:1000,[hpLinks[1].id]:2000},diff:diff(a,b)});}
const simulatorIds=new Set([1,2,3,4,101,102,103,104,105,106,151,152,153,154,155,156,171,172,173,174,175,181,182,183,184,185,205,243,244,245,246]);
const resolveLang=v=>lang[v]?.text??lang[v]?.value??lang[v]?.content??lang[v]??v;
const out={at:new Date().toISOString(),readOnly:true,productionWrites:0,hashes:{battle:hash(src),client:hash(client)},configPath:process.env.CONFIG_BIN_PATH,attrCount:Object.keys(attrs).length,native:{attrModify:native,categories},constBattle:Object.fromEntries(Object.entries(cfg.get('ConstConfig')).filter(([k])=>/fight|damage|crit|dodge|evade|stun|combo|counter|vamp|suck|resist/i.test(k))),attrRows:Object.values(attrs).map(r=>({...r,localizedName:resolveLang(r.name),localizedDesc:resolveLang(r.desc),simulatorDirectRead:simulatorIds.has(r.id)})),linkChecks:checks,players:[],runtime:pm.map(p=>({name:p.name,cwd:p.pm2_env.pm_cwd,status:p.pm2_env.status}))};
(async()=>{
for(const p of pm){const m=new MongoClient(getEnv(p,'MONGO_URI'),{serverSelectionTimeoutMS:5000});await m.connect();try{
const docs=await m.db().collection('players').find({name:{$regex:'^(FoxPlayer|Talo|.*CaCa)$',$options:'i'}},{maxTimeMS:5000}).limit(6).toArray();
for(const doc of docs){const raw=empty(),parts={};for(const name of helperNames){const part={};audit[name](part,clone(doc));parts[name]=part;}
let captured;const im={exports:{}};const isrc=src.replace('  applyPercentLinkedAttrs(base);','  capture(base);\n  applyPercentLinkedAttrs(base);');if(isrc===src)throw Error('CAPTURE_NOT_INSERTED');
vm.runInNewContext(isrc,{module:im,exports:im.exports,require:require('module').createRequire(path),capture:x=>{captured=clone(x);}});
const server=im.exports.calcPlayerPower(clone(doc));Object.assign(raw,captured);const nativeLinked=nativeFn(clone(raw));
const residual=clone(captured);for(const part of Object.values(parts))for(const [k,v]of Object.entries(part))residual[k]=(residual[k]||0)-v;
out.players.push({name:doc.name,serverId:doc.serverId,level:doc.level,raw:captured,attrs:server,power:read.displayPower(server),nativeLinksOnly:{attrs:nativeLinked,power:read.displayPower(nativeLinked),diff:diff(nativeLinked,server)},componentAttrs:parts,residualBaseStageBoxEquip:residual,storedModulePresence:{specSpiritInfo:!!doc.specSpiritInfo,nestedSpecSpirit:!!doc.other_attr_info?.specSpiritInfo,curiosCount:doc.other_attr_info?.curiosInfo?.curiosData?.length||0,formationKeys:Object.keys(doc.other_attr_info?.valhallaFormationInfo||{})},dbSameOnReadback:hash(doc)===hash(await m.db().collection('players').findOne({_id:doc._id},{maxTimeMS:5000}))});}
}finally{await m.close();}}
console.log(JSON.stringify(out));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
