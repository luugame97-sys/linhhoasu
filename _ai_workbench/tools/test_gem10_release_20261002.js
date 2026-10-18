'use strict';
const fs=require('fs'),path=require('path'),Module=require('module'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),srcRoot=path.join(root,'linhhoasu/lhs/newServer/src')+path.sep;
const boxes=path.join(root,'_ai_workbench/temp/item_boxes_20261002'),gem=path.join(root,'_ai_workbench/temp/gem10_candidate_20261002');
process.env.CONFIG_BIN_PATH=path.join(root,'_ai_workbench/temp/petsoul_release_20261002/baseline/config.bin');
require('net').Socket.prototype.connect=()=>{throw Error('NETWORK_FORBIDDEN')};
const original=Module._load,cache=new Map(),players=new Map();let saves=0,failSave=false;
function load(file,actual){if(cache.has(file))return cache.get(file).exports;const m=new Module(actual,module);cache.set(file,m);require.cache[actual]=m;m.filename=actual;m.paths=Module._nodeModulePaths(path.dirname(actual));m._compile(fs.readFileSync(file,'utf8'),actual);return m.exports;}
const service={savePlayer:async(uid,p)=>{saves++;if(failSave)return false;players.set(uid,p);return p;},drainPendingSaves:async()=>{},loadPlayer:async uid=>players.get(uid)};
Module._load=function(name,parent,isMain){
 if(/(^|\/)PlayerService$/.test(name))return service;
 if(name.endsWith('/gemLevel10Choice'))return load(path.join(gem,'server/config/gemLevel10Choice.js'),path.join(srcRoot,'config/gemLevel10Choice.js'));
 if(name.endsWith('/ConfigService'))return load(path.join(gem,'server/services/ConfigService.js'),path.join(srcRoot,'services/ConfigService.js'));
 let resolved;
 try { resolved=Module._resolveFilename(name,parent,isMain); } catch (error) {
  const parentFile=parent&&parent.filename||'';
  if(parentFile.includes('_ai_workbench\\temp\\item_boxes_20261002\\candidate')||parentFile.includes('_ai_workbench\\temp\\gem10_candidate_20261002')){
   const target=path.resolve(path.dirname(parentFile),name)+ (path.extname(name)?'':'.js');
   const candidateRoot=parentFile.includes('gem10_candidate_20261002')?path.join(gem,'server'):path.join(boxes,'candidate/server');
   const rel=path.relative(candidateRoot,target);
   const baseline=path.join(boxes,'baseline/server',rel), live=path.join(srcRoot,rel);
   if(fs.existsSync(baseline))return load(baseline,baseline);
   if(fs.existsSync(live))return load(live,live);
  }
  throw error;
 }
 if(typeof resolved==='string'&&resolved.startsWith(srcRoot)){
  const rel=path.relative(srcRoot,resolved);
   const candidate=rel==='services/ConfigService.js'?path.join(gem,'server/services/ConfigService.js'):rel==='handlers/gem.js'?path.join(gem,'server/handlers/gem.js'):rel==='handlers/item.js'?path.join(boxes,'candidate/server/handlers/item.js'):['services/RandomUsableItemRewardService.js','services/RewardGrantService.js'].includes(rel)?path.join(boxes,'candidate/server',rel):path.join(boxes,'baseline/server',rel);
  if(fs.existsSync(candidate))return load(candidate,resolved);
 }
 return original.call(this,name,parent,isMain);
};
const config=load(path.join(gem,'server/services/ConfigService.js'),path.join(srcRoot,'services/ConfigService.js')),tables=config.loadAllTables();
load(path.join(boxes,'candidate/server/services/RandomUsableItemRewardService.js'),path.join(srcRoot,'services/RandomUsableItemRewardService.js'));
load(path.join(boxes,'candidate/server/services/RewardGrantService.js'),path.join(srcRoot,'services/RewardGrantService.js'));
const itemPath=path.join(boxes,'candidate/server/handlers/item.js');
const item=load(itemPath,itemPath),gemPath=path.join(gem,'server/handlers/gem.js');
const gemHandler=load(gemPath,gemPath);
function session(gems=[],diamond=0,bag=0){const uid='GEM10_RELEASE_'+Math.random(),p={userId:uid,items:{100097:bag},currencies:{diamond,gold:0,silver:0},other_attr_info:{gemInfo:{gems:gems.map((id,i)=>({uid:i+1,id,shapeId:1}))}},roleInfo:{stage:1},level:200,exp:0};players.set(uid,p);return{userId:uid,player:p};}
function packet(reply,tag){const p=(Array.isArray(reply)?reply:[reply]).find(x=>x.tag===tag&&x.msgUid!==0);return p&&p.data;}
(async()=>{let cases=0;
 assert.equal(tables.AssetsConfig[100097].icon,'select_gem_09');assert.equal(tables.AssetsUseConfig[100097].type,101);assert.equal(tables.ShopConfig[10000007].cost[0].count,1049760);assert.equal(tables.GemBaseConfig.fieldMax,1200);cases++;
 for(let i=0;i<6;i++){const s=session([],0,1);const opened=packet(await item.handleUseItem({index:100097,count:1,selects:{[i]:1}},s,2),1300);assert.equal(opened.result,0);assert.equal(opened.rewardInfo.gems[0].id,25091+i);assert.equal(s.player.items[100097]||0,0);cases++;}
 const shop=tables.ShopConfig[10000007];assert.deepEqual(shop.cost,[{id:1,count:1049760}]);cases++;
 const normal=session([25001,25001,25001]),n=packet(await gemHandler.handleGemAutoCompose({targetLevel:6,level:6},normal,6),3903);assert(n.result===0&&n.gems.every(g=>normal.player.other_attr_info.gemInfo.gems.some(x=>x.uid===g.uid)));cases++;
 const special=session([25051,25051,25052,25052]),sp=packet(await gemHandler.handleGemAutoCompose({targetLevel:7,level:7},special,7),3903);assert(sp.result===0&&sp.gems.some(g=>g.id===25061));cases++;
 const high=session([25091,25091,25091]),h=packet(await gemHandler.handleGemAutoCompose({targetLevel:100,level:100},high,8),3903);assert(h.costs.length===0&&h.gems.length===0);cases++;
 const cap=session();gemHandler.ensureGemInfo(cap.player);assert.equal(cap.player.other_attr_info.gemInfo.fieldCount,1200);cases++;
 failSave=true;const failed=session([25001,25001,25001]),fr=await gemHandler.handleGemAutoCompose({targetLevel:6,level:6},failed,9);assert.equal(packet(fr,3903).result,-1);assert.equal(failed.player,null);cases++;
 console.log(JSON.stringify({pass:true,cases,price:1049760,bagId:100097,capacity:1200,selectedGems:[25091,25092,25093,25094,25095,25096],specialBridge6to7:true,network:'blocked',playerWrites:0,saves}));
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(()=>{Module._load=original});
