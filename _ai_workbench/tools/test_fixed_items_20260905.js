'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const app=process.env.LHS_APP_ROOT||path.resolve(__dirname,'../../linhhoasu/lhs/newServer');
process.env.CONFIG_BIN_PATH=process.env.LHS_CONFIG_PATH||path.resolve(__dirname,'../../linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin');
const config=require(path.join(app,'src/services/ConfigService'));
const ps=require(path.join(app,'src/services/PlayerService'));ps.savePlayer=async(_u,p)=>p;
const item=require(path.join(app,'src/handlers/item'));const cfg=config.loadAllTables();
function base(id){return{userId:'fixed-items',playerId:'fixed-items',level:99,items:{[id]:5},currencies:{diamond:77},other_attr_info:{},fashionInfo:{},petInfo:{},roleInfo:{kungfuId:4,stage:1},itemUseRecords:{}};}
async function use(p,id,count=1){const r=await item.handleUseItem({index:id,count},{userId:p.userId,player:p},10);return{packets:Array.isArray(r)?r:[r],result:(Array.isArray(r)?r:[r]).find(p=>p.tag===1300)};}
(async()=>{
 let cases=0;
 for(const [id,group] of [[94702,5],[94704,6],[94707,7],[94712,8],[94716,9],[94720,10],[94722,11],[94727,12]]){
  const p=base(id),expected=Object.values(cfg.EmojiConfig).filter(r=>r.group===group).map(r=>r.id).sort((a,b)=>a-b);
  const multi=await use(p,id,2);assert.equal(multi.result.data.code,'EMOJI_PACK_SINGLE_USE_ONLY');assert.equal(p.items[id],5);
  const first=await use(p,id);assert.equal(first.result.data.result,0);assert.equal(p.items[id],4);assert.equal(p.currencies.diamond,77);
  assert.deepEqual(p.fashionInfo.emoji[2],expected);assert.equal(first.packets.filter(r=>r.tag===1802).length,10);
  const duplicate=await use(p,id);assert.equal(duplicate.result.data.code,'EMOJI_PACK_ALREADY_OWNED');assert.equal(p.items[id],4);
  const persisted=JSON.parse(JSON.stringify(p));assert.equal((await use(persisted,id)).result.data.result,-1);
  cases+=4;
 }
 const p=base(100019),r=await use(p,100019,2);assert.equal(r.result.data.result,0);assert.equal(p.items[100019],3);
 assert.equal(r.result.data.rewardInfo.pets.length,2);assert(r.result.data.rewardInfo.pets.every(p=>p.id===85401));
 assert.equal(new Set(r.result.data.rewardInfo.pets.map(p=>p.uid)).size,2);
 console.log(JSON.stringify({result:'PASS',emojiItems:8,emojiCases:cases,permanentEmojis:80,petItem:100019,petReward:85401,duplicatesPreserved:true,clientVisualTest:'user'}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
