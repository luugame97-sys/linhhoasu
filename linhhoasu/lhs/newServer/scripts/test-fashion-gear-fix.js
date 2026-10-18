'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = process.env.FEATURE_APP || path.resolve(__dirname, '..'), client = process.env.FEATURE_CLIENT || path.resolve(root, '../../webgame/game/js/lhs-fashion-gear-v1.js');
const config = require(path.join(root, 'src/services/ConfigService')), tables = config.loadAllTables();
const clone = x => JSON.parse(JSON.stringify(x));
let writes = 0, network = 0;
const deny=()=>{network++;throw Error('TEST_NETWORK_DENIED');};require('net').Socket.prototype.connect=deny;global.fetch=deny;
for(const module of ['http','https']){require(module).request=deny;require(module).get=deny;}
const stubLogger = { info(){}, warn(){}, error(){}, debug(){} };
const loggerPath = require.resolve(path.join(root, 'src/logger'));
require.cache[loggerPath] = { id: loggerPath, filename: loggerPath, loaded: true, exports: stubLogger };
const fashion = require(path.join(root, 'src/handlers/fashion'));
const item = require(path.join(root, 'src/handlers/item'));
const appearance = require(path.join(root, 'src/services/RoleAppearanceService'));
const boxes = require(path.join(root, 'src/services/FashionBoxService'));
const out = [];
function pass(name, fn) { fn(); out.push(name); }
function player() { return { userId:'fashion_test', playerId:'fashion_test', level:120, roleInfo:{kungfuId:8,subJob:1}, items:{}, currencies:{diamond:0,silver:0,gold:0}, fashionInfo:{curFashion:{},fashion:{},fashionMap:{},equipped:{},fashions:{},activateFashion:[],fashionData:[],sets:[],setId:0,suits:{}} }; }
function own(p, ids) { ids.forEach(id => appearance.grantFashionOwnership(p,id)); }
function suit(dress,color=0) { const d=tables.FashionDressConfig[dress], tab=['FashionColorConfig','FashionDressLevelConfig','FashionChangeColorConfig','FashionBathConfig','FashionEndDressConfig'][d.isSuit]; const rows=tables[tab][dress]; return (d.isSuit===4?rows:rows[color]).fashionIds; }
function runHandler() {
  const original = require(path.join(root,'src/services/PlayerService'));
  const oldSave=original.savePlayer,oldDrain=original.drainPendingSaves;
  original.savePlayer=async(_id,p)=>{writes++;return p}; original.drainPendingSaves=async()=>{};
  try {
    pass('all-fixed-box-reward-config-valid',()=>{for(const id of Object.keys(tables.FashionDressConfig).filter(id=>boxes.isBox(id))) assert.equal(boxes.rewardsFor(Number(id),1).length>0,true);});
      const p=player(), ids=suit(29040);p.items[29040]=1;let s={userId:p.userId,player:p};
    return (async()=>{
      const boxRequest=''+Date.now()+'-boxTest01';
      const opened=await item.handleUseItem({id:29040,count:1,requestId:boxRequest},s,1);
      const ack=(Array.isArray(opened)?opened:[opened]).find(x=>x.tag===1300&&x.msgUid===1)?.data;
      assert.equal(ack.result,0);assert.equal(p.items[29040],0);assert.ok(ids.every(id=>appearance.hasFashionOwnership(p,id)));
      const replay=await item.handleUseItem({id:29040,count:1,requestId:boxRequest},s,2);
      assert.equal((Array.isArray(replay)?replay:[replay]).find(x=>x.tag===1300).data.replayed,true);
      pass('open-hidden-box-creates-ownership-not-bag-item',()=>{});
      const incomplete=player();own(incomplete,[ids[0]]);const si={userId:incomplete.userId,player:incomplete};
      assert.equal((await fashion.handleChangeSuit({id:29040,color:0,set:0},si,3)).data.result,-1);
      pass('incomplete-suit-rejected',()=>{});
      const full=player();own(full,ids);const sf={userId:full.userId,player:full};
      assert.equal((await fashion.handleChangeSuit({id:29040,color:0,set:0},sf,4)).find(x=>x.tag===1802)?.data.result,0);
      assert.deepEqual(ids.map(id=>full.fashionInfo.fashion[tables.FashionConfig[id].type]),ids);
      pass('full-suit-selects-all-parts',()=>{});
      await fashion.handleChangeFashion({id:-1,type:301,set:0},sf,5);appearance.ensureRoleAppearance(full);
      assert.equal(full.fashionInfo.fashion[301],-1);assert.equal(appearance.getPlayerFashionMap(full)[301],-1);
      pass('hidden-selection-survives-normalizer-and-showinfo',()=>{});
      own(full,suit(28040));await fashion.handleChangeSuit({id:28040,color:0,set:1},sf,6);
      await fashion.handleFashionChangeSet({setId:0},sf,7);assert.equal(full.fashionInfo.fashion[303],29043);assert.equal(full.fashionInfo.fashion[301],-1);
      pass('preset-switch-restores-exact-slot-snapshot',()=>{});
      const before=JSON.stringify(full);original.savePlayer=async()=>null;
      await assert.rejects(fashion.handleChangeSuit({id:29040,color:0,set:0},sf,8),/FASHION_SAVE_NOT_CONFIRMED/);
      assert.equal(sf.player,null);assert.equal(JSON.stringify(full),before);
      pass('save-null-never-mutates-original-or-acks-success',()=>{});
      original.savePlayer=async(_id,p)=>{writes++;return p};
      for(const boxId of Object.keys(tables.FashionDressConfig).map(Number).filter(boxes.isBox)){
        const current=player();current.userId='fashion_box_'+boxId;const session={userId:current.userId,player:current};
        item.addRewardRowsToPlayer(current,[{id:boxId,count:2}],1);assert.equal(current.items[boxId],2);
        const parts=boxes.rewardsFor(boxId,1).map(r=>r.id);assert.ok(parts.every(id=>!appearance.hasFashionOwnership(current,id)));
        const beforeDiamond=current.currencies.diamond||0;
        await item.handleUseItem({id:boxId,count:2},session,20);
        assert.equal(current.items[boxId],0);assert.ok(parts.every(id=>appearance.hasFashionOwnership(current,id)));
        const duplicateValue=parts.reduce((sum,id)=>sum+(tables.FashionConfig[id].swaps||[]).filter(r=>r.id===1).reduce((a,r)=>a+r.count,0),0);
        assert.equal((current.currencies.diamond||0)-beforeDiamond,duplicateValue);
      }
      pass('56-boxes-open-explicitly-with-configured-duplicate-conversion',()=>{});
      let variants=0;
      for(const d of Object.values(tables.FashionDressConfig).filter(d=>d.id!==28000)){
        const table=['FashionColorConfig','FashionDressLevelConfig','FashionChangeColorConfig','FashionBathConfig','FashionEndDressConfig'][d.isSuit];
        const rows=d.isSuit===4?{0:tables[table][d.id]}:tables[table][d.id];
        for(const [color,row] of Object.entries(rows||{}))for(const role of [{kungfuId:4,subJob:0},{kungfuId:8,subJob:1}]){
          if(!row.fashionIds?.length)continue;const current=player();current.userId='suit_'+(++variants);current.roleInfo=role;
          own(current,row.fashionIds);const session={userId:current.userId,player:current};
          const result=await fashion.handleChangeSuit({id:d.id,color:Number(color),set:0},session,30);
          assert.equal((Array.isArray(result)?result:[result]).find(p=>p.tag===1802).data.result,0,'variant '+d.id+'/'+color);
          const restored=clone(current);appearance.ensureRoleAppearance(restored);
          for(const id of row.fashionIds)assert.equal(restored.fashionInfo.fashion[tables.FashionConfig[id].type],id);
          for(const type of row.banTypeIds||[])if(tables.FashionBaseConfig.planPart.includes(type)&&!row.fashionIds.some(id=>tables.FashionConfig[id].type===type))assert.ok(restored.fashionInfo.fashion[type]<=0);
        }
      }
      assert(variants>=280);pass('all-configured-suit-colors-two-role-genders-normalize',()=>{});
      for(const mode of ['throw','commit-throw']){
        const current=player();current.userId='save_'+mode;current.items[29040]=1;const session={userId:current.userId,player:current},before=clone(current);let saved;
        original.savePlayer=async(_id,p)=>{if(mode==='commit-throw')saved=clone(p);throw Error('TEST_SAVE_FAILURE');};
        const request={index:29040,count:1,requestId:Date.now()+'-fault_'+mode};
        await assert.rejects(item.handleUseItem(request,session,31),/TEST_SAVE_FAILURE/);assert.equal(session.player,null);assert.deepEqual(current,before);
        if(saved){session.player=saved;original.savePlayer=async()=>{throw Error('REPLAY_MUST_NOT_SAVE');};
          const replay=await item.handleUseItem(request,session,32);assert(replay.find(p=>p.tag===1300).data.replayed);assert.equal(session.player.items[29040],0);
        }
      }
      original.savePlayer=async(_id,p)=>{writes++;return p};pass('save-throw-and-ambiguous-commit-replay-preserve-inventory',()=>{});
      return true;
    })().finally(()=>{original.savePlayer=oldSave;original.drainPendingSaves=oldDrain;});
  } catch(e){original.savePlayer=oldSave;original.drainPendingSaves=oldDrain;throw e;}
}
async function main(){await runHandler();
  const sent=[]; class GameSocket { Rpc(tag,data,cb){sent.push({tag,data});if(cb)cb(tag===2499?{result:0,epoch:'a'.repeat(32),sequence:0,expiresIn:86400000}:this.reply||{result:0,tag});} }
  class FishingModel { getFishInfo(){return this.info||{rodId:5907,raftId:6210};} isUnlockFishRod(id){return id===5901||id===5907;} isUnlockFishRaft(id){return id===6201||id===6210;} }
  class RodPanel { constructor(){this.selectId=5907;this.circulateList={updateData:x=>{this.rows=x},refreshByDataList:x=>{this.refresh=x},scrollTo:()=>true};} }
  class RaftPanel extends RodPanel {}
  class ItemModel { initData(){} getBagItems(){return Object.values(this.items||{});} CheckItemCanUse(){return true;} checkBagUseRed(){return false;} }
  class FashionModel { constructor(){this._fashionInfo={fashion:{301:29041},sets:[],setId:0};} onFashionData(data){this._fashionInfo.fashion=data&&data.selection||this._fashionInfo.fashion;} }
  const cfg=clone(tables); const manager={Config:cfg,FishingModel:new FishingModel(),UnlockSystem:{checkConditions:()=>true},FashionModel:null};
  const rootObj={W:manager,GameSocket,FashionModel,FishRodPanel:RodPanel,FishRaftPanel:RaftPanel,ItemModel,ResDataPath:{GetImgByID:id=>cfg.AssetsConfig[id]?.icon||'missing'},RES:{hasRes:key=>key==='head_rs_2834'||key==='ui_zb_bm_jiantou'||key==='icon_29041'},MessageCenter:{ins:()=>({dispatch(){}})},MessageDef:{},UserTips:{ins:()=>({showTips(){}})},eui:{Label:class{}},setTimeout(){},console};
  manager.FashionModel=new FashionModel();rootObj.FashionModel=FashionModel;rootObj.ItemModel=ItemModel;rootObj.FishingModel=FishingModel;
  rootObj.window=rootObj;vm.runInNewContext(fs.readFileSync(client,'utf8'),rootObj);
  const rod=new RodPanel();rod.initCirculateList&&rod.initCirculateList();assert.ok(rod.rows.some(x=>x.id===5907));
  const raft=new RaftPanel();raft.initCirculateList&&raft.initCirculateList();assert.ok(raft.rows.some(x=>x.id===6210));
  pass('client-keeps-owned-rods-and-rafts-before-open-day',()=>{});
  const itemModel=new ItemModel();itemModel.items={29040:1};itemModel.getBagItems();assert.equal(cfg.AssetsConfig[29040].ifShow,1);pass('client-shows-fashion-box-in-bag',()=>{});
  assert.equal(rod.rows.length,8);assert.equal(raft.rows.length,10);assert.ok(!cfg.FishRodConfig[5907].conditions.some(x=>x.type===5));
  pass('all-8-rods-and-10-rafts-visible-no-day-gates',()=>{});
  const socket=new GameSocket();let callback=0;socket.reply={result:-1};socket.Rpc(1801,{id:29041},()=>callback++);assert.equal(callback,0);pass('client-error-does-not-overwrite-fashion',()=>{});
  assert.equal(rootObj.ResDataPath.GetImgByID(28341),'head_rs_2834');pass('client-fallback-does-not-use-currency-icon',()=>{});
  assert.equal(network,0);console.log(JSON.stringify({result:'PASS',tests:out.length,productionWrites:0,networkAttempts:network,writes}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
