'use strict';
// Diagnostics only: no game edits, no database, no network. Evidence under workbench.
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib'), crypto = require('crypto');
const root = path.resolve(__dirname, '../..'), app = path.join(root,'linhhoasu/lhs/newServer');
const logger = path.join(app,'src/logger.js');
require.cache[logger] = {id:logger,filename:logger,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const config = require(path.join(app,'src/services/ConfigService'));
const {ByteArray,BinJsonUtil} = require(path.join(app,'src/protocol/BinJsonUtil'));
const file = path.join(root,'linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin');
const b = fs.readFileSync(file), a = new ByteArray(b), safe = {}, unsafe = config.loadAllTables();
let offsetTables = 0;
while(a.position<a.length){const n=a.readUTFBytes(a.readByte()),len=a.readUnsignedInt(),d=zlib.inflateSync(b.subarray(a.position,a.position+len));a.position+=len;if(d.byteOffset)offsetTables++;safe[n]=BinJsonUtil.readFullJson(new ByteArray(d));}
const selected=['PlantBaseConfig','PlantConfig','PlantBuildConfig','PlantMagicConfig','AlchemyBaseConfig','AlchemyFormulaConfig','AlchemyRoleConfig'];
const evidence={at:new Date().toISOString(),node:process.version,productionWrites:0,liveReverified:false,configFile:file,configHash:crypto.createHash('sha256').update(b).digest('hex'),
  decoding:{unsafeCount:Object.keys(unsafe).length,safeCount:Object.keys(safe).length,offsetTables,selected:selected.map(name=>({name,equal:JSON.stringify(unsafe[name])===JSON.stringify(safe[name]),unsafeKeys:Object.keys(unsafe[name]||{}).slice(0,6),safeKeys:Object.keys(safe[name]||{}).slice(0,6)}))}};
const main=fs.readFileSync(path.join(root,'linhhoasu/webgame/game/js/main.min_a6195824.js'),'utf8'),acorn=require(path.join(app,'node_modules/acorn'));
function extract(marker){const pos=main.indexOf(marker);let n=acorn.parseExpressionAt(main,pos+marker.indexOf('function'),{ecmaVersion:2022});if(n.type==='SequenceExpression')n=n.expressions[0];return main.slice(n.start,n.end);}
const counts=[],im={_itemMap:{27:10},_timeRecords:{27:{count:1,time:Date.now()-3600000}},_composeIdDict:{},isFreeze:false};
const context=vm.createContext({m:im,Y:{Config:safe},E:{ITEM_UPDATE:'ITEM_UPDATE'},A:{ins:()=>({dispatch:e=>{if(e==='ITEM_UPDATE27')counts.push(im.GetItemCount(27));}})}});
for(const n of ['GetItemCount','onItemChange','onItemTimeChange'])vm.runInContext('m.'+n+'='+extract('m.'+n+'=function'),context);
im.onItemChange({items:[],changed:[{id:27,count:11}]});im.onItemTimeChange({itemId:27,time:Date.now()});
evidence.recoveryUi={eventCounts:counts,finalModelCount:im.GetItemCount(27),expectedCount:11};
const calls=[],tips=[];function GameSocket(){}GameSocket.prototype.Rpc=(tag,p,cb)=>calls.push(cb);
const land={_cacheUseItem:{},_isLandCardAuto:true},window={GameSocket,W:{LandModel:land,RepeatRpcBlockModel:{setRpcRecord(){}}},UserTips:{ins:()=>({showTips:x=>tips.push(x)})}};
vm.runInNewContext(fs.readFileSync(path.join(root,'linhhoasu/webgame/game/js/lhs-farm-alchemy-v2.js'),'utf8'),{window,Date,Math});let callbackRuns=0;
new GameSocket().Rpc(2428,{index:0},r=>{callbackRuns++;if(r.result===2)land._isLandCardAuto=false;});calls[0]({result:2});
evidence.cardErrorCallback={callbackRuns,autoFlagImmediatelyAfter:land._isLandCardAuto,otherClientTimerMayStillStopAuto:true};
const receipts=require(path.join(app,'src/services/FeatureReceiptService'));
try{receipts.read({},2500,{id:120101,count:1,requestId:(Date.now()+120000)+'-device_clock'});}catch(error){evidence.clockSkew={seconds:120,error:error.message};}
const formula=safe.AlchemyFormulaConfig[120101],role=safe.AlchemyRoleConfig[1];
const total=Object.entries(formula.qualityWeights).reduce((sum,[q,r])=>sum+r.weight+(role.qualityRates[q]||0),0);
evidence.qualityUi={recipe:120101,baseShownPercent:30,bonusShownPercent:20,normalizedActualPercent:5000/total*100,needClarifyWeightVsPercentagePoint:true};
const tier=[.7,.25,.05],mean=xs=>xs.reduce((s,x,i)=>s+x*tier[i],0),cycle=mean([3600,5400,7200])+300;
evidence.proposedBalance={isNewDesign:true,normalSeed100:{weights:{2:4500,4:3000,101:2000,1:500},expectedPerSeed:{silver:900,baozi:9,corn:.6,diamond:1},baseSeconds:9000},
  magic:{weights:{1:3500,2:1250,3:250,4:350,5:125,6:25,7:2100,8:750,9:150,10:1050,11:375,12:75},meanCycleSeconds:cycle,
    theoreticalPerDayThreePlotsNoTheft:{silver:.5*mean([1000,1500,2000])*86400/cycle*3,baozi:.3*mean([5,10,15])*86400/cycle*3,corn:.15*mean([1,2,3])*86400/cycle*3,diamond:.05*mean([5,10,15])*86400/cycle*3}}};
const stage=JSON.parse(fs.readFileSync(path.join(root,'_ai_workbench/temp/farm_alchemy_fix_20260908/stage.json'),'utf8'));
evidence.localReleaseDrift=Object.entries(stage.localHashes).filter(([p,h])=>crypto.createHash('sha256').update(fs.readFileSync(path.join(app,'src',p))).digest('hex')!==h).map(([p])=>p);
const out=path.join(root,'_ai_workbench/temp/farm_alchemy_fix_20260908/remaining-diagnostic.json');fs.writeFileSync(out,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({out,node:evidence.node,decode:evidence.decoding,ui:evidence.recoveryUi,card:evidence.cardErrorCallback,clock:evidence.clockSkew,localDrift:evidence.localReleaseDrift,productionWrites:0},null,2));
