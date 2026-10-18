'use strict';
const fs=require('fs'),path=require('path'),Module=require('module'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),work=path.join(root,'_ai_workbench/temp/item_boxes_20261002');
process.env.CONFIG_BIN_PATH=path.join(root,'_ai_workbench/temp/petsoul_release_20261002/baseline/config.bin');
require('net').Socket.prototype.connect=()=>{throw new Error('NETWORK_FORBIDDEN')};
const original=Module._load,cache=new Map(); let saves=0;
function load(file,actual){if(cache.has(file))return cache.get(file).exports;const m=new Module(actual,module);cache.set(file,m);m.filename=actual;m.paths=Module._nodeModulePaths(path.dirname(actual));m._compile(fs.readFileSync(file,'utf8'),actual);return m.exports;}
Module._load=function(name,parent,isMain){
  if(/(^|\/)PlayerService$/.test(name))return{savePlayer:async()=>{saves++;return true}};
  const target=['RandomUsableItemRewardService','RewardGrantService','NativeItemRewardService'].find(x=>name.endsWith('/'+x));
  if(target){const prefix=target==='NativeItemRewardService'?'baseline':'candidate';return load(path.join(work,prefix,'server/services',target+'.js'),path.join(root,'linhhoasu/lhs/newServer/src/services',target+'.js'));}
  const resolved=Module._resolveFilename(name,parent,isMain);
  const sourceRoot=path.join(root,'linhhoasu/lhs/newServer/src')+path.sep;
  if(typeof resolved==='string'&&resolved.startsWith(sourceRoot)){
    const snapshot=path.join(work,'baseline/server',path.relative(sourceRoot,resolved));
    if(fs.existsSync(snapshot))return load(snapshot,resolved);
  }
  return original.call(this,name,parent,isMain);
};
const config=require(path.join(root,'linhhoasu/lhs/newServer/src/services/ConfigService'));
const random=load(path.join(work,'candidate/server/services/RandomUsableItemRewardService.js'),path.join(root,'linhhoasu/lhs/newServer/src/services/RandomUsableItemRewardService.js'));
const item=load(path.join(work,'candidate/server/handlers/item.js'),path.join(root,'linhhoasu/lhs/newServer/src/handlers/item.js'));
function fresh(id,count){return {items:{[id]:count},currencies:{diamond:0,gold:0,silver:0},other_attr_info:{},roleInfo:{stage:1},level:200,exp:0};}
function handler(name){return require(path.join(root,'linhhoasu/lhs/newServer/src/handlers',name));}
function ownership(p,d,id){
 if(d.kind==='elf'){const info=handler('elf').ensureElfInfo(p);return Number(info.elfData.some(x=>x.id===id));}
 if(d.kind==='curios'){const info=handler('curios').ensureCuriosInfo(p);return Number(info.curiosData.some(x=>x.id===id))+(info.unconvertedRewardCopies?.[id]||0);}
 if(d.kind==='orb'){const info=handler('artifact').ensureArtifactInfo(p);return info.orbInfo?.orbDataMap?.[id]?.subCount||0;}
 if(d.kind==='connect'){const info=handler('valhalla-formation').ensureValhallaFormationInfo(p);return info.connect.find(x=>x.id===id)?.count||0;}
 if(d.kind==='artifactSoul'){return handler('artifact').ensureArtifactInfo(p).artifacts.filter(x=>x.id===id).length;}
 return p.items[id]||0;
}
async function open(id,count,p=fresh(id,count),params={}){const value=await item.handleUseItem({itemId:id,count,...params},{userId:'ISOLATED_BOX_TEST',player:p},7);const packets=Array.isArray(value)?value:[value];return{p,packets,reply:packets.find(x=>x.tag===1300)};}
(async()=>{
 const realRandom=Math.random;Math.random=()=>0;let cases=0;
 try {
 for(const d of random.VERIFIED_BOX_DEFINITIONS){
   const pool=random.getVerifiedBoxPool(d.id);assert.deepEqual(pool,d.poolIds,'pool '+d.id);
   for(const count of [1,3,55]){
    const p=fresh(d.id,count),id=pool[0],before=ownership(p,d,id),got=await open(d.id,count,p);
    assert.equal(got.reply.data.result,0,'open '+d.id);assert.equal(p.items[d.id]||0,0,'debit '+d.id);
    if(d.kind==='elf'){assert.equal(ownership(p,d,id),1);const piece=config.get('ElfConfig')[id].piece;assert.equal(p.items[piece.id]||0,(count-(before?0:1))*piece.count);}
    else if(d.kind==='fixed'){for(const row of d.rewards)assert.equal(p.items[row.id],row.count*count,'fixedcount '+d.id);}
    else assert.equal(ownership(p,d,id)-before,count,'typed count '+d.id);
    if(['elf','curios','orb','connect','artifactSoul'].includes(d.kind))assert.equal(p.items[id]||0,0,'not bag '+d.id);
    const syncTag=d.kind==='elf'&&before?1202:({elf:6001,curios:5200,orb:6401,connect:6801,artifactSoul:3500}[d.kind]||1202);
    assert.ok(got.packets.some(x=>x.tag===syncTag),'sync '+d.id);
    cases++;
   }
   // A missing pool member must fail closed, without shrinking odds or debiting.
   const poolId=pool[0],saved=config.get('AssetsConfig')[poolId];delete config.get('AssetsConfig')[poolId];
   const p=fresh(d.id,3),countSaves=saves;
   try{const got=await open(d.id,3,p);assert.equal(got.reply.data.result,-1);assert.equal(p.items[d.id],3);assert.equal(saves,countSaves);cases++;}finally{config.get('AssetsConfig')[poolId]=saved;}
   const source=config.get('AssetsConfig')[d.id],icon=source.icon;source.icon='INVALID_POOL_METADATA';
   try{const got=await open(d.id,3);assert.equal(got.reply.data.result,-1);assert.equal(got.p.items[d.id],3);cases++;}finally{source.icon=icon;}
 }
 for(const id of [407,433,445,100021,100022,100020,100641,283]){const got=await open(id,2);assert.equal(got.reply.data.result,-1,'unknown '+id);assert.equal(got.p.items[id],2);cases++;}
 for(const count of [0,-1,1.5,10001]){const p=fresh(100511,20000);const got=await open(100511,count,p);assert.equal(got.reply.data.result,-1);assert.equal(p.items[100511],20000);cases++;}
 const box=await open(100802,55);assert.equal(box.reply.data.result,0);assert.equal(box.reply.data.rewardInfo.items.reduce((s,x)=>s+x.count,0),55);cases++;
 for(const d of JSON.parse(fs.readFileSync(path.join(work,'definitions.json'),'utf8')).legacyBoxes)for(const count of [1,3,55]){
  const got=await open(d.id,count);assert.equal(got.reply.data.result,0,'legacy result '+d.id);assert.equal(got.p.items[d.id]||0,0);
  const key={legacyPet:'pets',legacyValhalla:'valhalla',legacyBloodline:'bloodline',legacyArtifact:'artifacts',legacyGem:'gems'}[d.kind];
  assert.equal(got.reply.data.rewardInfo[key].length,count,'legacy native reward '+d.id);cases++;
 }
 // Choice wrappers remain tangible bags, then open to native items exactly once.
 const selected=await open(90151,2,fresh(90151,2),{selects:{1:2}});
 assert.equal(selected.reply.data.result,0);assert.equal(selected.p.items[100721],4);assert.equal(selected.p.items[90151]||0,0);
 const connectDef=random.VERIFIED_BOX_DEFINITIONS.find(x=>x.id===100721),target=connectDef.poolIds[0],before=ownership(selected.p,connectDef,target);
 await open(100721,4,selected.p);assert.equal(ownership(selected.p,connectDef,target)-before,4);cases++;
 console.log(JSON.stringify({pass:true,definitions:random.VERIFIED_BOX_DEFINITIONS.length,cases,saves,network:'blocked',database:'mocked'}));
 }finally{Math.random=realRandom;}
})().catch(e=>{console.error(e.stack);process.exitCode=1}).finally(()=>{Module._load=original});
