'use strict';
// Production source/config snapshot, actual handlers, in-memory storage only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const ROOT=path.resolve(process.argv[2]),APP=path.join(ROOT,'app');
process.env.CONFIG_BIN_PATH=path.join(ROOT,'server.bin');
net.Socket.prototype.connect=function(){throw new Error('AUDIT_NETWORK_FORBIDDEN');};
function stub(rel,value){const p=require.resolve(path.join(APP,rel));require.cache[p]={id:p,filename:p,loaded:true,exports:value};}
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v)),arr=v=>Array.isArray(v)?v:[],obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
let context;
stub('src/logger',{info(){},warn(){},error(){},debug(){},verbose(){},log(){}});
stub('src/services/PlayerService',{
 async savePlayer(_id,p){context.durable=clone(p);context.saves++;return p;},
 async savePlayerDeferred(_id,p){context.durable=clone(p);return p;},
 async loadPlayer(){return clone(context.durable);},wasRecentlySaved(){return false;},
 async drainPendingSaves(){},
});
stub('src/services/MessageService',{pushPlayerNotice(){}});
stub('src/services/DistClient',{async rechargeCallback(){throw new Error('NO_UPSTREAM_ALLOWED');}});
function doc(p){return Object.assign(clone(p),{markModified(){},toObject(){return clone(this);},async save(){context.durable=clone(this);context.saves++;return this;}});}
stub('src/db/models/Player',{async findOne(){return doc(context.durable);}});
stub('src/db/models/Transaction',{async findOne(q){return context.orders.get(q.orderId)||null;},async create(p){assert(!context.orders.has(p.orderId));context.orders.set(p.orderId,clone(p));return p;}});
stub('src/db/models/Mail',{
 find(){return{lean:async()=>clone(context.mailRows)};},
 async updateMany(){for(const m of context.mailRows)m.claimed=true;},
 async findOneAndUpdate(q,u){return{_id:'fixture-added-mail',...u.$setOnInsert};},
});
stub('src/db/models/RedemptionCode',{db:{readyState:1},async findOne(){return{status:'active',rewards:{items:context.giftItems},usedCount:0,usedBy:[],async save(){}};}});
stub('src/services/RechargeConfigService',{
 normalizeProductId:v=>String(v||'').trim(),normalizeRewardItems:r=>arr(r),
 async getResolvedRow(id){const p=tables.PayConfig[id];return p?{productId:String(id),source:'catalog',enabled:true,amount:Number(p.priceR),attachments:[]}:null;},
});
const cfg=require(path.join(APP,'src/services/ConfigService')),tables=cfg.loadAllTables();
const configModule=require.resolve(path.join(APP,'src/services/ConfigService'));
delete require.cache[configModule];
const clientTables=require(configModule).loadAllTables(path.join(ROOT,'client.bin'));
delete require.cache[configModule];
const langCfg=require(configModule),lang=langCfg.loadAllTables(path.join(ROOT,'lang.bin')).LanguageConfig||{};
require.cache[configModule].exports=cfg;
delete require.cache[configModule];require.cache[configModule]={id:configModule,filename:configModule,loaded:true,exports:cfg};
const mail=require(path.join(APP,'src/handlers/mail')),item=require(path.join(APP,'src/handlers/item'));
const activity=require(path.join(APP,'src/handlers/activity')),recharge=require(path.join(APP,'src/handlers/recharge'));
const compat=require(path.join(APP,'src/handlers/compat')),resolver=require(path.join(APP,'src/services/RechargeRewardResolver'));
const {syncSessionPlayerFields}=require(path.join(APP,'src/services/SessionPlayerSyncService'));
require(path.join(APP,'src/services/ServerConfigService')).getCurrentRechargeArea=async()=>1;
const grant=require(path.join(APP,'src/services/RewardGrantService'));
const sources=['FashionConfig','FashionDressConfig','FormationConfig','SwordConfig','ArtifactConfig','SpecialArtifactConfig','SpiritConfig','PetConfig','PetSoulConfig','SpecialSwordConfig'];
const ids=[...new Set(sources.flatMap(k=>Object.values(tables[k]||{}).map(r=>Number(r.id))))].sort((a,b)=>a-b);
const idSet=new Set(ids),name=id=>lang[tables.AssetsConfig[id]?.name||tables.FashionConfig[id]?.name||id]?.cn||String(id);
function begin(){const p={userId:'audit-memory',playerId:'audit-memory-role',name:'fixture',level:999,exp:0,
items:{1001:100000000,1002:100000000,1003:100000000,19:80},currencies:{diamond:0,silver:0,gold:0},
roleInfo:{kungfuId:4,stage:999,subJob:0},rechargeInfo:{area:1,records:[],periodRecords:{},monthCards:{}},shopInfo:{pack:[],chainPack:[],buyRecords:{}},
activityInfo:{datas:[],giftCodeRecords:{}},fashionInfo:{fashions:{},activateFashion:[],fashionData:[],dress:[],emoji:{},emojiGroups:[]},
other_attr_info:{},equipInfo:{equipList:[],openList:[],setInfoMap:{},curIndex:0},swordInfo:{},petInfo:{},artifactInfo:{},formationInfo:{},spiritInfo:{},bloodlineInfo:{},valhallaInfo:{},taskInfo:{tasks:{},tasksMap:{}},raidInfo:{}};
context={player:p,durable:clone(p),saves:0,orders:new Map(),mailRows:[],giftItems:{},packets:[]};
context.session={userId:p.userId,player:p};context.ws={getPlayerForMutation(){return p;},invalidatePlayerForMutation(){context.session.player=null;},syncSessionPlayer(_id,v,o){return syncSessionPlayerFields(p,v,o);},pushToUser(_id,tag,data){context.packets.push({tag,data});}};return context;}
const fashionOwned=(p,id)=>arr(p.fashionInfo?.activateFashion).map(Number).includes(id)||Number(p.fashionInfo?.fashions?.[id])>0;
const balance=(p,id)=>Number(id)===1?Number(p.currencies?.diamond)||0:Number(id)===2?Number(p.currencies?.silver)||0:Number(id)===6?Number(p.currencies?.gold)||0:Number(p.items?.[id])||0;
function kind(id){for(const [k,names] of [['formation',['FormationConfig']],['sword',['SwordConfig','SpecialSwordConfig']],['artifact',['ArtifactConfig','SpecialArtifactConfig']],['spirit',['SpiritConfig']],['pet',['PetConfig']],['petSoul',['PetSoulConfig']],['fashion',['FashionConfig']],['dress',['FashionDressConfig']]])if(names.some(n=>tables[n]?.[id]))return k;return 'item';}
function validate(p,id){const issues=[],k=kind(id),f=tables.FashionConfig[id];
if(f&&!fashionOwned(p,id))issues.push('FASHION_OWNERSHIP_MISSING');
if(f?.condition?.[10]>0){const d=arr(p.fashionInfo?.fashionData).find(x=>x.id===id);if(!(d?.limitValues?.[10]>Date.now()/1000))issues.push('TIMED_EXPIRY_MISSING');}
if(k==='formation'&&!arr(p.formationInfo?.owns).includes(id))issues.push('FORMATION_MISSING');
if(k==='sword'&&!arr(p.swordInfo?.data).some(r=>r.id===(Number(tables.SpecialSwordConfig[id]?.showId)||id)))issues.push('SWORD_MISSING');
if(k==='artifact'&&!arr(p.artifactInfo?.artifacts).some(r=>r.id===(Number(tables.SpecialArtifactConfig[id]?.showId)||id)))issues.push('ARTIFACT_MISSING');
if(k==='spirit'&&!arr(p.spiritInfo?.owns).includes(id))issues.push('SPIRIT_MISSING');
if(k==='pet'&&!arr(p.petInfo?.pets).some(r=>r.id===id))issues.push('PET_MISSING');
if(k==='petSoul'&&!arr(p.other_attr_info?.petSoulInfo?.petSouls).some(r=>r.id===id)&&!Object.values(obj(p.other_attr_info?.petSoulInfo?.petSoulMap)).some(r=>r.id===id))issues.push('PET_SOUL_MISSING');
if(k==='dress'&&!(Number(p.items?.[id])>0))issues.push('DRESS_BOX_MISSING');
if(k==='fashion'&&Number(p.items?.[id])>0)issues.push('FASHION_BODY_IN_BAG');return issues;}
function pkts(x){return Array.isArray(x)?x:[x];}
async function receive(id,channel,iteration){
if(channel==='mail'){const mid='audit-mail-'+iteration;context.mailRows=[{_id:mid,userId:context.player.userId,claimed:false,attachments:[{id,count:1}]}];return mail.handleMailClaim({ids:[mid]},context.session,6000+iteration);}
context.giftItems={[id]:1};return activity.handleActivityGiftCode({giftCode:'AUDIT_ONLY_'+iteration},context.session,6000+iteration);
}
function rewardRows(raw){if(typeof raw==='string'){try{raw=JSON.parse(raw);}catch{return[];}}return Array.isArray(raw)?raw.map(r=>({id:Number(r.item_id??r.id),count:Number(r.amount??r.count)})):Object.entries(obj(raw)).map(([id,count])=>({id:Number(id),count:Number(count)}));}
function appearanceDescendants(id,seen=new Set()){if(seen.has(id))return[];seen.add(id);if(idSet.has(id))return[id];return arr(tables.AssetsUseConfig[id]?.rewards).flatMap(r=>appearanceDescendants(Number(r.id),seen));}
async function main(){
 const routes=[];
 for(const id of ids){if(!tables.AssetsConfig[id]&&!tables.FashionConfig[id]){routes.push({id,name:name(id),channel:'catalog',status:'INTERNAL_NOT_SENDABLE'});continue;}
 for(const channel of ['mail','gameGiftcode']){begin();for(let n=1;n<=2;n++){try{const before=clone(context.player),result=await receive(id,channel,n),ps=pkts(result),ack=ps.find(p=>p?.tag===(channel==='mail'?1103:1750)&&p.msgUid===6000+n);const issues=validate(context.player,id);if(ack?.data?.result!==0)issues.push('ACK_NOT_SUCCESS');
 const duplicateSwaps=n===2&&kind(id)==='fashion'&&!(tables.FashionConfig[id]?.condition?.[10]>0)?arr(tables.FashionConfig[id]?.swaps).filter(r=>Number(r.count)>0).map(r=>({id:r.id,expected:r.count,actual:balance(context.player,r.id)-balance(before,r.id)})):[];
 const durableIssues=validate(context.durable,id);routes.push({id,name:name(id),kind:kind(id),channel,iteration:n,status:issues.length||durableIssues.length?'FAIL':'PASS',issues,durableIssues,duplicateSwaps,bag:Number(context.player.items[id])||0,tags:[...new Set(ps.map(p=>p?.tag))],swapIds:arr(tables.FashionConfig[id]?.swaps).map(r=>r.id)});
 }catch(e){routes.push({id,name:name(id),channel,iteration:n,status:'ERROR',error:e.message});break;}}
 }}
 const suits=[];
 for(const d of Object.values(tables.FashionDressConfig)){const u=tables.AssetsUseConfig[d.id];if(!u){suits.push({id:d.id,status:'INTERNAL_NO_USE_CONFIG'});continue;}begin();await receive(d.id,'mail',1);try{const out=await item.handleUseItem({id:d.id,count:1},context.session,7000),ack=pkts(out).find(p=>p?.tag===1300);const missing=arr(u.rewards).filter(r=>tables.FashionConfig[r.id]&&!fashionOwned(context.player,r.id)).map(r=>r.id);suits.push({id:d.id,name:name(d.id),status:ack?.data?.result===0&&!missing.length?'PASS':'FAIL',result:ack?.data?.result,missing,remaining:Number(context.player.items[d.id])||0,targets:arr(u.rewards).map(r=>r.id)});}catch(e){suits.push({id:d.id,status:'ERROR',error:e.message});}}
 const plans=[],purchases=[];
 for(const pay of Object.values(tables.PayConfig))for(const route of ['cash','token']){begin();const plan=resolver.resolveRechargeRewards(context.player,{payId:pay.id,route,amount:Number(pay.priceR),multi:1,allowActivity9:true,allowActivationPass:true,now:Date.now()});
 const direct=[...new Set([...arr(plan.rows),...arr(plan.doubleRows)].map(r=>Number(r.id)).filter(id=>idSet.has(id)))];
 const linked=Object.values(tables.ShopConfig).filter(s=>Number(s.payId??s.payid??s.rechargeId)===Number(pay.id));
 const catalogAppearances=[...new Set(linked.flatMap(s=>['rewards','firstRewards','subsequentRewards','extraRewards'].flatMap(k=>arr(s[k]).flatMap(r=>appearanceDescendants(Number(r.id))))))];
 const state={payId:pay.id,name:name(pay.name||pay.id),route,ok:plan.ok,reason:plan.reason,direct,catalogAppearances,rows:arr(plan.rows),doubleRows:arr(plan.doubleRows)};plans.push(state);
 if(!plan.ok||(!direct.length&&!catalogAppearances.length))continue;
 try{let response;if(route==='cash')response=await recharge.handleRecharge({userId:context.player.userId,orderId:'audit-pay-'+pay.id,productId:String(pay.id),amount:Number(pay.priceR),idempotentSuccess:true},context.ws);else{const out=await compat.handleTokenRecharge1230({id:pay.id,multi:1},context.session,9000);response=pkts(out).find(p=>p?.tag===1230)?.data;context.packets=pkts(out);}
 const success=route==='cash'?response?.success===true:response?.result===0;
 const liveMissing=direct.flatMap(id=>validate(context.player,id).map(issue=>({id,issue}))),durableMissing=direct.flatMap(id=>validate(context.durable,id).map(issue=>({id,issue})));
 purchases.push({payId:pay.id,name:state.name,route,success,error:response?.error||response?.code,direct,catalogAppearances,liveMissing,durableMissing,tags:[...new Set(context.packets.map(p=>p.tag))]});
 }catch(e){purchases.push({payId:pay.id,name:state.name,route,error:e.message,direct,catalogAppearances});}}
 const staleBagProbes=[];for(const id of ids.filter(id=>kind(id)==='fashion')){begin();context.player.items[id]=1;try{const out=await item.handleUseItem({id,count:1},context.session,8000);const ack=pkts(out).find(p=>p?.tag===1300);staleBagProbes.push({id,name:name(id),result:ack?.data?.result,code:ack?.data?.code,bag:Number(context.player.items[id])||0,owned:fashionOwned(context.player,id),clientHasUseType:!!tables.AssetsConfig[id]?.useType});}catch(e){staleBagProbes.push({id,error:e.message});}}
 const configDifferences=[];for(const id of ids)for(const table of ['FashionConfig','FashionDressConfig','AssetsConfig','AssetsUseConfig','SpecialArtifactConfig','SpecialSwordConfig'])if(JSON.stringify(tables[table]?.[id])!==JSON.stringify(clientTables[table]?.[id]))configDifferences.push({id,table,serverExists:!!tables[table]?.[id],clientExists:!!clientTables[table]?.[id]});
 const web=JSON.parse(fs.readFileSync(path.join(ROOT,'web_inventory.json'),'utf8'));
 const webRows=web.tables.webshop_items.map(r=>({...r,gameName:name(Number(r.item_id)),appearanceIds:appearanceDescendants(Number(r.item_id))})).filter(r=>r.appearanceIds.length);
 const giftRows=web.tables.giftcodes.map(r=>({id:r.id,isActive:r.is_active,expiresAt:r.expires_at,usedCount:r.used_count,rewards:rewardRows(r.reward_items).map(x=>({...x,name:name(x.id),appearanceIds:appearanceDescendants(x.id)}))})).filter(r=>r.rewards.some(x=>x.appearanceIds.length));
 const affectedCash=purchases.filter(p=>p.route==='cash'&&p.success&&p.liveMissing?.length);
 const payload={generatedAt:new Date().toISOString(),readOnly:true,productionMutations:0,upstreamPayment:false,nativeUi:false,
 catalog:{fashion:Object.keys(tables.FashionConfig).length,dresses:Object.keys(tables.FashionDressConfig).length,uniqueIds:ids.length,payIds:Object.keys(tables.PayConfig).length},
 summary:{routeCases:routes.filter(r=>r.channel!=='catalog').length,routeFailures:routes.filter(r=>['FAIL','ERROR'].includes(r.status)).length,suitCases:suits.filter(r=>r.status!=='INTERNAL_NO_USE_CONFIG').length,suitFailures:suits.filter(r=>['FAIL','ERROR'].includes(r.status)).length,purchaseCases:purchases.length,cashOnlineMissingPackages:affectedCash.length,purchaseOtherIssues:purchases.filter(p=>p.error||!p.success||p.durableMissing?.length).length},
 routes,suits,plans,purchases,webRows,giftRows,staleBagProbes,configDifferences,
 catalogIds:ids.map(id=>({id,name:name(id),kind:kind(id),fashion:!!tables.FashionConfig[id],timedSeconds:Number(tables.FashionConfig[id]?.condition?.[10])||0,asset:!!tables.AssetsConfig[id],useType:tables.AssetsUseConfig[id]?.type,swaps:tables.FashionConfig[id]?.swaps||[]})),
 };
 fs.writeFileSync(path.join(ROOT,'fixture.json'),JSON.stringify(payload,null,2)+'\n');
 console.log(JSON.stringify({catalog:payload.catalog,summary:payload.summary,routeFailures:routes.filter(r=>['FAIL','ERROR'].includes(r.status)).slice(0,20),suitFailures:suits.filter(r=>['FAIL','ERROR'].includes(r.status)),cashOnlineMissing:affectedCash.map(p=>({payId:p.payId,name:p.name,missing:p.liveMissing})),webAppearanceRows:webRows.length,activeWebAppearanceRows:webRows.filter(r=>Number(r.is_active)===1).length,giftAppearanceRows:giftRows.length},null,2));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
