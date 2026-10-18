'use strict';
// Audit current handlers with CN fashion data in RAM. Failures are findings,
// not grounds for modifying live configuration or weakening guards.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const wb=path.resolve(__dirname,'..'),out=path.join(wb,'temp/fashion_cn_recovery_20260909'),app=path.resolve(wb,'../linhhoasu/lhs/newServer');
let network=0,saves=0;const deny=()=>{network++;throw Error('AUDIT_NETWORK_BLOCKED');};require('net').Socket.prototype.connect=deny;global.fetch=deny;for(const k of ['http','https']){require(k).request=deny;require(k).get=deny;}
const logger=require.resolve(path.join(app,'src/logger'));require.cache[logger]={id:logger,filename:logger,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const svc=require(path.join(app,'src/services/ConfigService')),t=svc.loadAllTables(),base=JSON.parse(JSON.stringify(t));
const full=JSON.parse(fs.readFileSync(path.join(out,'fashion-cn-tables.json'))),related=JSON.parse(fs.readFileSync(path.join(out,'fashion-related-cn.json')));
for(const [name,rows]of Object.entries({...full,...related}))t[name]={...t[name],...rows};
const players=require(path.join(app,'src/services/PlayerService'));players.savePlayer=async(_id,p)=>(saves++,p);players.drainPendingSaves=async()=>{};
const item=require(path.join(app,'src/handlers/item')),fashion=require(path.join(app,'src/handlers/fashion')),appearance=require(path.join(app,'src/services/RoleAppearanceService'));
const acorn=require(path.join(app,'node_modules/acorn')),cnMain=fs.readFileSync(path.join(out,'raw/js/main.min_dc9b2913.js'),'utf8'),vnMain=fs.readFileSync(path.resolve(wb,'../linhhoasu/webgame/game/js/main.min_a6195824.js'),'utf8');
function source(main,name){const at=main.indexOf('.'+name+'=function');if(at<0)return null;let n=acorn.parseExpressionAt(main,main.indexOf('function',at),{ecmaVersion:2022});if(n.type==='SequenceExpression')n=n.expressions[0];return main.slice(n.start,n.end);}
const x={INITIAL_ROLE_SUIT:28000,ESuitType:{normal:0,linkage:1,changeColor:2,bathrobe:3,endSkill:4},FASHION_BATH_SET_ID:999};
const globals={Config:t,RoleModel:{kungfuId:8,subJob:1}},context={J:globals,Y:globals,x,_t:(a,b)=>a.concat(b)};
const native=(main,name)=>vm.runInNewContext('('+source(main,name)+')',context);
const cnParts=native(cnMain,'GetSuitFashions'),vnParts=native(vnMain,'GetSuitFashions');
let serial=0;
function player(id,count=1){return {userId:'cn_audit_'+(++serial),playerId:'cn_audit_'+serial,level:120,roleInfo:{kungfuId:8,subJob:1},items:{[id]:count},currencies:{diamond:0,silver:0,gold:0},fashionInfo:{curFashion:{},fashion:{},fashionMap:{},equipped:{},fashions:{},activateFashion:[],fashionData:[],sets:[],setId:0,suits:{},dress:[]}};}
function ack(output,tag){return(Array.isArray(output)?output:[output]).find(p=>p.tag===tag)?.data;}
const own=(p,ids)=>ids.forEach(id=>appearance.grantFashionOwnership(p,id));
async function run(){
 const result={networkAttempts:0,productionWrites:0,mode:'current handlers + isolated CN config merge',boxes:[],standalone:[],native:[],findings:[]};
 const audit=JSON.parse(fs.readFileSync(path.join(out,'system-audit.json')));
 for(const row of audit.suitRows.filter(r=>r.status==='added'&&r.box)){
  const p=player(row.id),s={userId:p.userId,player:p};const response=ack(await item.handleUseItem({index:row.id,count:1},s,100),1300);
  const wear=response.result===0?ack(await fashion.handleChangeSuit({id:row.id,color:0,set:0},s,101),1802):null;
  result.boxes.push({id:row.id,result:response.result,code:response.code,remaining:p.items[row.id],owned:p.fashionInfo.activateFashion,wearResult:wear?.result});
 }
 assert.equal(result.boxes.filter(r=>r.result===0).length,5);
 const effectRow=result.boxes.find(r=>r.id===28410);assert.equal(effectRow.result,0);assert(effectRow.owned.includes(28416));
 const refs={vn:{},cn:{}};for(const name of ['GetSuitFashions','suitHasSpFashion','sendChangeSuit','onClickOpeningEff','updateOpeningEff']){refs.vn[name]=source(vnMain,name);refs.cn[name]=source(cnMain,name);}
 for(let color=0;color<5;color++){
  const a=Array.from(vnParts(28340,color,-1,-1,true)),b=Array.from(cnParts(28340,color,-1,-1,true));
  assert.notDeepEqual(a,b);assert.deepEqual(b,t.FashionChangeColorConfig[28340][color].spFashionIds);
  const p=player(28340),s={userId:p.userId,player:p};own(p,[...a,...b]);
  const response=ack(await fashion.handleChangeSuit({id:28340,color:100+color,set:0},s,102),1802);
  result.native.push({id:28340,color,vnParts:a,cnSpecialParts:b,serverSpecialColor:100+color,serverResult:response.result});
 }
 assert(result.native.every(r=>r.serverResult===0));
 {const p=player(28410),s={userId:p.userId,player:p};own(p,t.AssetsUseConfig[28410].rewards.map(r=>r.id));const r=ack(await fashion.handleChangeFashion({id:28416,type:306,set:0},s,103),1801);assert.equal(r.result,0);result.findings.push({kind:'opening-effect-selection',id:28416,...r});}
 for(const id of [29810,29820]){const p=player(id),s={userId:p.userId,player:p};p.items[456]=30;
  const r=ack(await fashion.handleSuitColorUnlock({id,color:0},s,104),1803);assert.equal(r.result,0);
  result.findings.push({kind:'bathrobe-base-purchase',id,result:r.result,currencyRemaining:p.items[456]||0});
  const ids=t.FashionBathConfig[id][0].fashionIds;assert(ids.every(part=>appearance.hasFashionOwnership(p,part)));const wear=ack(await fashion.handleChangeSuit({id,color:0,set:999},s,105),1802);assert.equal(wear.result,0);
 }
 for(const row of audit.newStandalone){const p=player(row.id,0);const granted=item.addRewardRowsToPlayer(p,[{id:row.itemId,count:1}],1);
  const owned=appearance.hasFashionOwnership(p,row.id);result.standalone.push({id:row.id,type:row.type,owned,bagCount:p.items[row.itemId]||0});assert(owned);
 }
 {const official=require(path.join(app,'src/handlers/official-compat'));for(const id of [15502,99999999]){
  const p=player(id,0),s={userId:p.userId,player:p};const r=ack(await official.handleMainPanelChange({id},s,106),1812);
  assert.equal(r.result,-1);assert.equal(p.fashionInfo.mainPanel,undefined);
  result.findings.push({kind:'main-panel-validation-and-save',requested:id,result:r.result,owned:appearance.hasFashionOwnership(p,id),savedAt:'rejected-before-save'});
 }}
 // Extract this real helper without booting the app; both ownership states
 // should differ if the suite bonus is correctly restricted to owned outfits.
 const battle=fs.readFileSync(path.join(app,'src/services/BattleService.js'),'utf8'),at=battle.indexOf('function addFashionAttrs(');
 const node=acorn.parse(battle.slice(at),{ecmaVersion:2022}).body[0];assert.equal(node.type,'FunctionDeclaration');
 const fn=battle.slice(at,at+node.end),add=(target,attrs)=>{for(const [id,v]of Object.entries(attrs||{}))target[id]=(target[id]||0)+v;};
 const calc=vm.runInNewContext('('+fn+')',{config:svc,toSafeInt:(v,f=0)=>Number.isFinite(Number(v))?Math.floor(Number(v)):f,addAttrs:add});
 const raw={};calc(raw,{fashionInfo:{activateFashion:[],starUp:{}}});
 const onlyNew={...t.FashionDressConfig};for(const id of [28310,28370,28380,28410,29280,29820])delete t.FashionDressConfig[id];
 const before={};calc(before,{fashionInfo:{activateFashion:[],starUp:{}}});t.FashionDressConfig=onlyNew;
 const leaked=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,v-(before[k]||0)]).filter(([,v])=>v));
 assert.equal(Object.keys(leaked).length,0);result.findings.push({kind:'unowned-dress-attrs',extraFromNewDressDefinitions:leaked,note:'Ownership gate prevents new dress definitions from adding attrs before grant.'});
 assert.equal(network,0);result.result='AUDIT_COMPLETE_WITH_BLOCKERS';result.savesInMemory=saves;
 fs.writeFileSync(path.join(out,'compat-fixture.json'),JSON.stringify(result,null,2)+'\n');fs.writeFileSync(path.join(out,'native-method-reference.json'),JSON.stringify(refs,null,2)+'\n');
 console.log(JSON.stringify({...result,standalone:{count:result.standalone.length,allOwned:result.standalone.every(r=>r.owned)}}));
}
run().catch(e=>{console.error(e);process.exitCode=1;});
