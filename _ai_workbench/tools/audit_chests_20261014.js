'use strict';
// Read current VPS code/config; execute use handlers against disposable RAM only.
const fs = require('fs'), Module = require('module'), vm = require('vm'), crypto = require('crypto');
const app = '/linhhoasu/lhs/newServer', web = '/linhhoasu/webgame/game';
const load = Module._load;
let simulatedSaves = 0, networkAttempts = 0, writeAttempts = 0;
require('net').Socket.prototype.connect = function () { networkAttempts++; throw Error('AUDIT_NETWORK_FORBIDDEN'); };
for (const method of ['writeFileSync','appendFileSync','mkdirSync','unlinkSync','rmSync','renameSync','createWriteStream']) {
  fs[method] = () => { writeAttempts++; throw Error('AUDIT_WRITE_FORBIDDEN:' + method); };
}
const logger = { info(){}, warn(){}, error(){}, debug(){}, log(){} };
Module._load = function (name, parent, isMain) {
  if (/(^|\/)logger$/.test(name)) return logger;
  if (/(^|\/)PlayerService$/.test(name)) return {drainPendingSaves:async()=>{},savePlayer:async()=>{simulatedSaves++;return true;},savePlayerDeferred:async()=>{simulatedSaves++;return true;}};
  return load.call(this, name, parent, isMain);
};
global.setTimeout = () => 0; global.clearTimeout = () => {}; global.setInterval = () => 0;
const C = require(app + '/src/services/ConfigService');
const tables = C.loadAllTables(), A = tables.AssetsConfig, U = tables.AssetsUseConfig;
const item = require(app + '/src/handlers/item');
const random = require(app + '/src/services/RandomUsableItemRewardService');
const language = C.decodeTables(fs.readFileSync(web + '/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin')).LanguageConfig || {};
const clientTables = C.decodeTables(fs.readFileSync(web + '/update/resource/assets/excel/config_fashion_20260909.bin'));
const clientRoot = { GlobalManager: {Config:clientTables,PetSoulModel:{}}, setTimeout(){} };
const index = fs.readFileSync(web + '/index.html','utf8');
const addons = {};
for (const name of ['lhs-item-boxes-v1.js','lhs-petsoul-fix-v1.js']) {
  const source = fs.readFileSync(web + '/js/' + name,'utf8');
  addons[name] = {referenced:index.includes(name),sha256:hash(source)};
  if (index.includes(name)) vm.runInNewContext(source, {window:clientRoot,Object,Number,Math,Array,console:logger}, {timeout:3000});
}
function hash(value){return crypto.createHash('sha256').update(value).digest('hex');}
function title(a){return language[a?.name]?.cn || '';}
function description(a){return language[a?.desc]?.cn || '';}
function fresh(id,count){return {userId:'ISOLATED_CHEST_AUDIT',playerId:'ISOLATED_CHEST_AUDIT',items:{[id]:count},currencies:{diamond:0,gold:0,silver:0},other_attr_info:{},roleInfo:{stage:999999},level:999,exp:0};}
function state(p,id){const copy=JSON.parse(JSON.stringify(p));delete copy.items[id];delete copy.itemUseRecords; if(copy.other_attr_info) delete copy.other_attr_info.record;return JSON.stringify(copy);}
async function test(id,count,params={}) {
  let p=fresh(id,count);const before=state(p,id),session={userId:p.userId,player:p};let response,error,packets=[];
  try {const result=await item.handleUseItem({itemId:id,count,...params},session,7);packets=Array.isArray(result)?result:[result];response=packets.find(x=>x?.tag===1300)?.data;p=session.player||p;}
  catch(e){error=String(e.stack||e).split('\n').slice(0,4).join('\n');}
  const info=response?.rewardInfo||{}, rewards=Object.fromEntries(Object.entries(info).filter(([,v])=>Array.isArray(v)&&v.length));
  const consumed=count-(p.items[id]||0),rewardEntries=Object.values(rewards).reduce((n,v)=>n+v.length,0);
  return {count,...params,result:response?.result??null,code:response?.code||response?.reason||response?.msg||'',error:error||null,consumed,rewardEntries,rewards,bag:p.items,emojiUnlocked:(p.fashionInfo?.emoji?.['2']||[]).length,stateChanged:state(p,id)!==before,tags:packets.map(x=>x?.tag)};
}
(async()=>{
  let seed=1;Math.random=()=>{seed=seed*48271%2147483647;return seed/2147483647;};
  const ids=new Set(Object.values(U).filter(u=>[101,102,104,105,106,107,110].includes(u.type)).map(u=>u.id));
  for(const a of Object.values(A)) if(a.type===99 || (a.type===1 && /宝箱|礼包|礼盒|随机|自选/.test(title(a)))) ids.add(a.id);
  const baseIds=new Set(ids);
  for(const a of Object.values(A))if(a.type===1&&/rương|hộp|túi (?:quà|phúc|tài)|cẩm nang|bao lì xì|ngẫu nhiên|tự chọn/i.test(title(a)))ids.add(a.id);
  const rows=[];
  for(const id of [...ids].sort((a,b)=>a-b).filter(id=>!process.env.CHEST_AUDIT_FOCUS||(process.env.CHEST_AUDIT_FOCUS==='extra'?!baseIds.has(id):[94821,94822,94823,94824,94825].includes(id)))) {
    const a=A[id],use=U[id], clientUse=clientTables.AssetsUseConfig[id],cases=[];
    if([101,104,106,110].includes(use?.type)) {
      for(let index=0;index<(use.rewards?.length||1);index++)cases.push(await test(id,1,{selects:{[index]:1}}));
    } else cases.push(await test(id,1,process.env.CHEST_AUDIT_FOCUS==='fish'?{requestId:'audit_box_'+id,expectedRevision:0}:{}));
    const result={id,name:title(a),description:description(a),assetType:a?.type,icon:a?.icon,serverUse:use?.type||0,clientUse:clientUse?.type||0,visible:!!clientTables.AssetsConfig[id]?.ifShow,conditions:clientUse?.conditions||[],cases};
    result.empty=cases.some(x=>x.result===0&&x.consumed>0&&x.rewardEntries===0&&!x.emojiUnlocked);
    result.failed=cases.some(x=>x.result!==0||x.error);
    rows.push(result);
  }
  const screenshot=[];
  if(!process.env.CHEST_AUDIT_FOCUS)for(const count of [1,3,55])screenshot.push(await test(100802,count));
  const files={};for(const file of ['src/handlers/item.js','src/services/RandomUsableItemRewardService.js','src/services/RewardGrantService.js','src/services/ConfigService.js'])files[file]={sha256:hash(fs.readFileSync(app+'/'+file)),mtime:fs.statSync(app+'/'+file).mtime.toISOString()};
  const output={at:new Date().toISOString(),productionWrites:0,simulatedSaves,networkAttempts,writeAttempts,files,addons,screenshotAsset:A[100802],screenshotServerUse:U[100802]||null,screenshotClientUse:clientTables.AssetsUseConfig[100802]||null,resolverSample:random.resolveRandomRewardRows({},100802,55),materials:[268,269,270,271,272].map(id=>({id,name:title(A[id]),config:tables.PetSoulUpgradeMaterialConfig[id]})),screenshot,summary:{items:rows.length,cases:rows.reduce((n,r)=>n+r.cases.length,0),emptyItems:rows.filter(r=>r.empty).length,failedItems:rows.filter(r=>r.failed).length},rows};
  const compact=rows.map(r=>({id:r.id,name:r.name,icon:r.icon,assetType:r.assetType,serverUse:r.serverUse,clientUse:r.clientUse,visible:r.visible,conditions:r.conditions,empty:r.empty,failed:r.failed,cases:r.cases.map(c=>({count:c.count,selects:c.selects,result:c.result,code:c.code,error:c.error,consumed:c.consumed,rewardEntries:c.rewardEntries,rewardItems:c.rewards.items||[],emojiUnlocked:c.emojiUnlocked,bag:c.bag,tags:c.tags,stateChanged:c.stateChanged}))}));
  const server102=rows.filter(r=>r.serverUse===102).map(r=>({id:r.id,name:r.name,icon:r.icon,assetType:r.assetType,visible:r.visible,case:r.cases.map(c=>({result:c.result,code:c.code,consumed:c.consumed,rewardEntries:c.rewardEntries,stateChanged:c.stateChanged}))}));
  const groups={}; server102.forEach(r=>{const c=r.case[0]||{};const k=[c.result,c.code,c.consumed,c.rewardEntries].join('|');(groups[k]??=[]).push(r.id);});
  console.log('CHEST_AUDIT_RESULT='+JSON.stringify({at:output.at,productionWrites:0,simulatedSaves,networkAttempts,writeAttempts,files,addons,screenshotAsset:output.screenshotAsset,screenshotServerUse:output.screenshotServerUse,screenshotClientUse:output.screenshotClientUse,resolverSample:output.resolverSample,materials:output.materials,screenshot,summary:output.summary,groups,server102,compact}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
