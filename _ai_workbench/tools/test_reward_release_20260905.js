'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const WB = path.resolve(__dirname,'..');
const RELEASE = path.join(WB,'temp/reward_release_20260905');
const APP = process.env.LHS_APP_ROOT || path.join(RELEASE,'app');
process.env.CONFIG_BIN_PATH = process.env.LHS_CONFIG_PATH || path.join(RELEASE,'config.bin');
const cfg = require(path.join(APP,'src/services/ConfigService'));
const service = require(path.join(APP,'src/services/PlayerService'));
service.savePlayer = async (_id,p) => p;
service.savePlayerDeferred = async (_id,p) => p;
const item = require(path.join(APP,'src/handlers/item'));
const activity = require(path.join(APP,'src/handlers/activity'));
const native = require(path.join(APP,'src/services/NativeItemRewardService'));
const grant = require(path.join(APP,'src/services/RewardGrantService'));
const pills = require(path.join(APP,'src/services/ItemPillService'));
const sync = require(path.join(APP,'src/services/RewardSync'));
const tables = cfg.loadAllTables();
const clone = value => JSON.parse(JSON.stringify(value));
let seed=19;Math.random=()=>{seed=seed*48271%2147483647;return seed/2147483647;};
function base(id=0) {
  return {userId:'reward-release-contract',playerId:'reward-release-contract',name:'QA',level:99,exp:0,
    roleInfo:{kungfuId:4,subJob:0,stage:999},items:id?{[id]:50}:{},currencies:{diamond:100000,silver:100000,gold:100000},
    fashionInfo:{activateFashion:[],fashions:{},fashionData:[],emoji:{},emojiGroups:[],dress:[]},
    other_attr_info:{elfInfo:{elfData:[{id:154101,star:1,level:1}]}},petInfo:{},swordInfo:{},spiritInfo:{},formationInfo:{},artifactInfo:{},
    equipInfo:{equipList:[],openList:[],setInfoMap:{},curIndex:0},rechargeInfo:{records:[],monthCards:{},periodRecords:{}},
    shopInfo:{buyRecords:{},pack:[]},activityInfo:{datas:[],giftCodeRecords:{}},itemUseRecords:{},taskInfo:{tasks:{},tasksMap:{}},raidInfo:{}};
}
function state(p,id,kind) {
  if(kind==='elf')return p.other_attr_info.elfInfo?.elfData.find(x=>x.id===id);
  if(kind==='curios')return p.other_attr_info.curiosInfo?.curiosData.find(x=>x.id===id);
  if(kind==='orb')return p.artifactInfo.orbInfo?.orbDataMap[id];
  return p.other_attr_info.valhallaFormationInfo?.connect.find(x=>x.id===id);
}
function outputPackets(p,result) {
  return grant.buildNativeSyncPackets(p,result);
}
const checkCount={nativeAssets:0,nativeGrants:0,nativeCases:0,pills:0,clientReceivers:0};
function clientReceiver(name) {
  const main=fs.readFileSync(path.join(RELEASE,'client/main.js'),'utf8');
  const start=main.indexOf(name+'=function');assert(start>=0,name);
  const fnStart=start+name.length+1;
  const acorn=require(process.env.REWARD_TEST_ACORN || path.join(APP,'node_modules/acorn'));
  let expression=acorn.parseExpressionAt(main,fnStart,{ecmaVersion:'latest'});
  if(expression.type==='SequenceExpression')expression=expression.expressions[0];
  assert.equal(expression.type,'FunctionExpression');
  const source=main.slice(expression.start,expression.end);
  const context={Y:{Config:tables},A:{ins:()=>({dispatch(){}})},E:{},y:{ins:()=>({doFrame(_a,_b,fn,scope){fn.call(scope);}})},iM:{OrderShow(){}}};
  return vm.runInNewContext('('+source+')',context);
}
async function run() {
  for(const table of ['ElfConfig','CuriosConfig','OrbConfig','ValhallaFormationConnectItemConfig'])for(const row of Object.values(tables[table])) {
    if(!tables.AssetsConfig[row.id])continue;
    const id=row.id,kind=native.getKind(id);assert(kind);checkCount.nativeAssets++;
    for(const route of ['item','activity']) {
      const p=base(), already=id===154101&&kind==='elf';
      const reward=route==='item'?item.addRewardRowsToPlayer(p,[{id,count:2}],1).rewardInfo:activity.grantRewardRows(p,[{id,count:2}]);
      assert.equal(p.items[id]||0,0,`${route}:${id}:body-in-bag`);
      const owned=state(p,id,kind);assert(owned,`${kind}:${id}:ownership`);
      if(kind==='elf')assert.equal(p.items[row.piece.id],row.piece.count*(already?2:1));
      if(kind==='curios')assert.equal(p.other_attr_info.curiosInfo.unconvertedRewardCopies[id],1);
      if(kind==='orb')assert.equal(owned.subCount,2);
      if(kind==='connect')assert(owned.count>=2);
      const delta=sync.buildRewardItemSync(p,reward.items);assert(!delta.items.some(x=>x.id===id));
      const packets=outputPackets(p,reward);
      if(!already)assert(packets.some(x=>x.tag===({elf:6001,curios:5200,orb:6401,connect:6801}[kind])));
      const persisted=clone(p);assert(state(persisted,id,kind));checkCount.nativeGrants++;
    }
  }
  const audit=JSON.parse(fs.readFileSync(path.join(WB,'temp/item_catalog_production_recheck_20260905.json')));
  for(const test of audit.nativeMisroutes) {
    const p=base(test.id),session={userId:p.userId,player:p};
    const packets=await item.handleUseItem({index:test.id,count:1,...test.params},session,1000+checkCount.nativeCases);
    const response=(Array.isArray(packets)?packets:[packets]).find(x=>x.tag===1300);
    assert.equal(response.data.result,0,`${test.id}:${test.params}`);assert.equal(p.items[test.id],49);
    assert(state(p,test.reward.id,native.getKind(test.reward.id)));
    assert.equal(p.items[test.reward.id]||0,0);
    checkCount.nativeCases++;
  }
  for(const use of Object.values(tables.AssetsUseConfig).filter(x=>x.type===103&&x.rewards?.length&&Object.keys(x.attrs||{}).length===0)) {
    const p=base(use.id),s={userId:p.userId,player:p},expected=use.rewards[0];
    // Keep below a configured level-up threshold so the test measures the
    // grant itself, not the game's separate exp reset-on-level-up rule.
    const levelRow=Object.values(tables.RoleLevelConfig).find(r=>r.exp>expected.count*3);
    if(expected.id===3){assert(levelRow);p.level=levelRow.lv;}
    const expBefore=p.exp, bagBefore=p.items[4]||0;
    const packets=await item.handleUseItem({index:use.id,count:3},s,3000+checkCount.pills);
    const response=(Array.isArray(packets)?packets:[packets]).find(x=>x.tag===1300);
    assert.equal(response.data.result,0);assert.equal(p.items[use.id],47);
    assert(response.data.rewardInfo.items.some(x=>x.id===expected.id&&x.count===3*expected.count));
    if(expected.id===3)assert.equal(p.exp,expBefore+3*expected.count);
    if(expected.id===4)assert.equal(p.items[4],bagBefore+3*expected.count);
    assert.equal(p.itemUseRecords[pills.groupFor(use.id)],3);checkCount.pills++;
  }
  const p=base(110122);p.items[110123]=50;
  const s={userId:p.userId,player:p};
  await item.handleUseItem({index:110122,count:10},s,1);
  const failed=await item.handleUseItem({index:110123,count:1},s,2);assert.equal(failed.data.code,'ITEM_PILL_DAILY_LIMIT');assert.equal(p.items[110123],50);
  const cap=pills.plan(p,110123,1);assert.equal(cap.cap,10);
  const tomorrow=Date.now()+86400000;pills.ensure(p,tomorrow);assert.equal(p.itemUseRecords[-802],0);
  const vip=base();for(const r of Object.values(tables.PrivilegeConfig))vip.rechargeInfo.monthCards[r.id]=Date.now()+86400000;
  const expectedAdd=Object.values(tables.PrivilegeConfig).reduce((sum,r)=>sum+(Number(r.groups?.[4])||0),0);
  assert.equal(pills.privilegeAdd(vip,4),expectedAdd);
  for(const echo of Object.values(tables.CuriosEchoConfig).filter(r=>Object.values(r.addPrivilege||{}).some(x=>x[3]||x[4]))) {
    const q=base(),tier=Math.max(...Object.keys(echo.addPrivilege).map(Number));
    q.other_attr_info.curiosInfo={curiosData:echo.suit.map(id=>({id,star:tier}))};
    assert(pills.privilegeAdd(q,4)>=Number(echo.addPrivilege[tier][4]||0));
  }
  for(const variants of Object.values(tables.FashionBathConfig))for(const bath of Object.values(variants)) {
    if(!bath.privilege?.[4]&&!bath.privilege?.[3])continue;
    const q=base();for(const id of bath.fashionIds||[])q.fashionInfo.fashions[id]=1;
    assert(pills.privilegeAdd(q,4)>=Number(bath.privilege[4]||0));
  }
  const hold=base(90151);const held=await item.handleUseItem({index:90151,count:1,selects:{1:1}},{userId:hold.userId,player:hold},9);
  assert.equal(held.data.code,'ITEM_REWARD_POOL_UNVERIFIED');assert.equal(hold.items[90151],50);assert.equal(hold.items[100721],undefined);
  const faulty=base(90202),faultSession={userId:faulty.userId,player:faulty};
  service.savePlayer=async()=>{throw new Error('TEST_SAVE_FAILURE');};
  await assert.rejects(()=>item.handleUseItem({index:90202,count:1,selects:{0:1}},faultSession,10),/TEST_SAVE_FAILURE/);
  assert.equal(faultSession.player,null);service.savePlayer=async(_u,p)=>p;
  const elfRecv=clientReceiver('onElfDataUpdate');const elfModel={seen:[],updateElfData(row){this.seen.push(row.id);}};
  elfRecv.call(elfModel,{elfData:[{id:156502}]});assert.deepEqual(elfModel.seen,[156502]);checkCount.clientReceivers++;
  const orbRecv=clientReceiver('sc_orb_info_update');const orbModel={orbInfo:{orbDataMap:{}},parseSingleOrbInfo:clientReceiver('parseSingleOrbInfo'),getMaxStar:()=>5};
  const orbP=base();item.addRewardRowsToPlayer(orbP,[{id:9166,count:1}]);orbRecv.call(orbModel,outputPackets(orbP,{items:[{id:9166,count:1}]}).find(x=>x.tag===6401).data);
  assert.equal(orbModel.orbInfo.orbDataMap[9166].subCount,1);checkCount.clientReceivers++;
  const connRecv=clientReceiver('onValhallaFormationConnectUpdate');const connModel={seen:[],updateConnectData(row){this.seen.push(row);}};
  connRecv.call(connModel,{connects:[{id:200414,count:2}]});assert.equal(connModel.seen[0].count,2);checkCount.clientReceivers++;
  const curiosRecv=clientReceiver('sc_curios_init');const curiosModel={parseCuriosProp:r=>r,parseSystemConfig:()=>({}),updateBoxTime(){},checkResonanceActive(){},calPrivilegeMap(){this.updated=true;}};
  const curiosP=base();item.addRewardRowsToPlayer(curiosP,[{id:130601,count:1}]);curiosRecv.call(curiosModel,outputPackets(curiosP,{items:[{id:130601,count:1}]}).find(x=>x.tag===5200).data);
  assert(curiosModel.curiosData.curiosDataMap[130601]);assert(curiosModel.updated);checkCount.clientReceivers++;
  const report={result:'PASS',...checkCount,globalCap:true,dayReset:true,privileges:true,saveFailureInvalidatesSession:true,placeholderHeldWithoutConsume:true,nativeVisualTest:false};
  fs.writeFileSync(path.join(RELEASE,'contract.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
run().catch(error=>{console.error(String(error.stack).split('\n').filter(line=>line.length<1800).join('\n'));process.exitCode=1;});
