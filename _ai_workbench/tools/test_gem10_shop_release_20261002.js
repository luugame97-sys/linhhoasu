'use strict';
// Exercise deployed item purchase/use handlers with the scoped config release.
const fs=require('fs'),path=require('path'),Module=require('module'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),work=path.join(root,'_ai_workbench/temp/gem10_candidate_20261002');
const boxes=path.join(root,'_ai_workbench/temp/item_boxes_20261002');
process.env.CONFIG_BIN_PATH=path.join(root,'_ai_workbench/temp/petsoul_release_20261002/baseline/config.bin');
require('net').Socket.prototype.connect=()=>{throw Error('NETWORK_FORBIDDEN')};
const sourceRoot=path.join(root,'linhhoasu/lhs/newServer/src')+path.sep;
const original=Module._load,cache=new Map(),players=new Map();let saves=0;
function load(file,actual){if(cache.has(file))return cache.get(file).exports;const m=new Module(actual,module);cache.set(file,m);m.filename=actual;m.paths=Module._nodeModulePaths(path.dirname(actual));m._compile(fs.readFileSync(file,'utf8'),actual);return m.exports;}
const service={savePlayer:async(uid,p)=>{players.set(uid,p);saves++;return p;},drainPendingSaves:async()=>{},loadPlayer:async uid=>players.get(uid)};
Module._load=function(name,parent,isMain){
 if(/(^|\/)PlayerService$/.test(name))return service;
 if(name.endsWith('/gemLevel10Choice'))return load(path.join(work,'server/config/gemLevel10Choice.js'),path.join(sourceRoot,'config/gemLevel10Choice.js'));
 const target=Module._resolveFilename(name,parent,isMain);
 if(typeof target==='string'&&target.startsWith(sourceRoot)){
  const rel=path.relative(sourceRoot,target);
  for(const folder of [path.join(work,'server'),path.join(boxes,'candidate/server'),path.join(boxes,'baseline/server')]){
   const file=path.join(folder,rel);if(fs.existsSync(file))return load(file,target);
  }
 }
 return original.call(this,name,parent,isMain);
};
const c=require(path.join(sourceRoot,'services/ConfigService')),tables=c.loadAllTables();
const item=require(path.join(sourceRoot,'handlers/item'));
const overlay=require(path.join(work,'server/config/gemLevel10Choice'));
let seq=0;
function session(bag=0,diamond=0){const uid='GEM10_FIXTURE_'+(++seq),player={userId:uid,items:{100097:bag},currencies:{diamond,gold:0,silver:0},other_attr_info:{},roleInfo:{stage:1},level:200,exp:0};players.set(uid,player);return {userId:uid,player};}
function reply(result,tag){return (Array.isArray(result)?result:[result]).find(p=>p.tag===tag&&p.msgUid!==0).data;}
(async()=>{
 let cases=0;
 const raw=c.decodeTables(fs.readFileSync(process.env.CONFIG_BIN_PATH));
 for(const id of [10000001,10000002,10000003,10000004,10000005,10000006])assert.deepEqual(tables.ShopConfig[id],raw.ShopConfig[id]);
 assert.equal(overlay.PRICE_DIAMOND,40*3**5*4*3**3);
 assert.equal(tables.AssetsConfig[100097].type,1);assert.equal(tables.AssetsConfig[100097].icon,'select_gem_09');
 assert.deepEqual(tables.ShopConfig[10000007].cost,[{id:1,count:1049760}]);
 for(let k=0;k<6;k++){
  const s=session(0,1049760);
  const buy=reply(await item.handleMultiBuyItem({require:{10000007:1}},s,11),1202);
  assert.equal(buy.result,0);assert.equal(s.player.currencies.diamond,0);assert.equal(s.player.items[100097],1);assert.equal(buy.rewardInfo.gems.length,0);
  const opened=reply(await item.handleUseItem({index:100097,count:1,selects:{[k]:1}},s,12),1300);
  assert.equal(opened.result,0);assert.equal(s.player.items[100097]||0,0);assert.equal(opened.rewardInfo.gems.length,1);assert.equal(opened.rewardInfo.gems[0].id,25091+k);
  assert(s.player.other_attr_info.gemInfo.gems.some(g=>g.uid===opened.rewardInfo.gems[0].uid&&g.id===25091+k));
  assert.equal(s.player.other_attr_info.gemInfo.fieldCount,1200);cases++;
 }
 const low=session(0,1049759),beforeSaves=saves;
 assert.equal(reply(await item.handleMultiBuyItem({require:{10000007:1}},low,15),1202).result,-1);assert.equal(low.player.currencies.diamond,1049759);assert.equal(low.player.items[100097]||0,0);assert.equal(saves,beforeSaves);cases++;
 for(const selection of [{},{6:1},{'-1':1},{0:2},{0:1,1:1},{'01':1},{0:'1'}]){
  const s=session(1),prior=saves;assert.equal(reply(await item.handleUseItem({index:100097,count:1,selects:selection},s,17),1300).result,-1);assert.equal(s.player.items[100097],1);assert.equal(saves,prior);cases++;
 }
 const multi=session(0,3*1049760);assert.equal(reply(await item.handleShopBuy({goodsId:10000007,count:3},multi,20),1210).result,0);assert.equal(multi.player.items[100097],3);assert.equal(multi.player.currencies.diamond,0);
 const opened=reply(await item.handleUseItem({index:100097,count:3,selects:{0:1,5:2}},multi,21),1300);assert.equal(opened.rewardInfo.gems.length,3);assert.equal(opened.rewardInfo.gems.filter(g=>g.id===25096).length,2);cases++;
 const again=reply(await item.handleUseItem({index:100097,count:1,selects:{0:1}},multi,22),1300);assert.equal(again.result,-1);cases++;
 overlay.apply(tables);assert.equal(tables.ShopConfig[10000007].cost[0].count,1049760);
 console.log(JSON.stringify({pass:true,cases,price:1049760,capacity:1200,oldSixShopRows:'unchanged',nativeGemRewards:true,network:'blocked',persistence:'mocked',saves}));
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(()=>{Module._load=original});
