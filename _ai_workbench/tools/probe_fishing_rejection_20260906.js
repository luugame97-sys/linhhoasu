'use strict';
// Replay current state on detached objects only. Database and network are blocked.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),net=require('net');
const root=path.resolve(process.argv[2]),app=path.resolve(__dirname,'../../linhhoasu/lhs/newServer');
process.env.NODE_ENV='test';process.env.LOG_DIR='';process.env.CONFIG_BIN_PATH=path.resolve(__dirname,'../temp/fishing_fix_20260906/server.bin');
net.Socket.prototype.connect=()=>{throw new Error('DIAG_NETWORK_FORBIDDEN');};
function stub(rel,exports){const file=require.resolve(path.join(app,rel));require.cache[file]={id:file,filename:file,loaded:true,exports};}
stub('src/logger',{info(){},error(){},warn(){},debug(){}});let saved=0;
stub('src/services/PlayerService',{async savePlayer(id,p){saved++;return p;},wasRecentlySaved:()=>false});
const config=require(path.join(app,'src/services/ConfigService')),fish=require(path.join(app,'src/handlers/fish'));
const clone=x=>JSON.parse(JSON.stringify(x)),snapshot=JSON.parse(fs.readFileSync(path.join(root,'snapshot.json'),'utf8')).servers[1001];
function fixture(){saved=0;const p={userId:'read-only-clone',playerId:'read-only-clone',serverId:1001,level:snapshot.level,items:clone(snapshot.items),fishInfo:clone(snapshot.fishInfo),currencies:{},other_attr_info:{},taskInfo:{},roleInfo:{kungfuId:4,subJob:0}};return{p,s:{userId:p.userId,player:p}};}
const ack=(out,tag)=>(Array.isArray(out)?out:[out]).find(p=>p.tag===tag).data;
(async()=>{
const result={productionMutations:0,inputs:{scene:snapshot.fishInfo.scene,fishLevel:snapshot.fishInfo.level,pending:snapshot.fishInfo.fishResult.fishInfos.length,soulPending:snapshot.fishInfo.catchResult.infos.length,food:snapshot.fishInfo.food,foodBag:snapshot.fishInfo.foodBag,items:snapshot.items,sceneConfig:config.get('FishSceneConfig')[snapshot.fishInfo.scene]},probes:[]};
for(const count of [3,2,1]){const{p,s}=fixture(),before=clone(p.items),r=ack(await fish.handleFishCatch({count},s,1),4000);result.probes.push({count,result:r.result,reason:r.reason||null,saves:saved,itemsBefore:before,itemsAfter:p.items,caught:r.fishResult?.fishInfos.map(x=>({id:x.id,uid:x.uid}))});if(count===3){assert.equal(r.result,-1);assert.equal(saved,0);assert.deepEqual(p.items,before);}else assert.equal(r.result,0);}
{const{p,s}=fixture();await fish.handleFishBaitBagUpdate({foodBag:[5514]},s,2);const r=ack(await fish.handleFishCatch({count:3},s,3),4000);assert.equal(r.result,0);assert.equal(p.items[5514],87);result.probes.push({case:'switch_to_5514_then_count3',result:r.result,selectedFood:p.fishInfo.food,left5514:p.items[5514]});}
{const{p,s}=fixture(),r=ack(await fish.handleFishBaitBagUpdate({foodBag:[]},s,4),4007);result.probes.push({case:'remove_all_bait',result:r.result,food:p.fishInfo.food,foodBag:p.fishInfo.foodBag});assert.deepEqual(p.fishInfo.foodBag,[5512,5514]);}
fs.writeFileSync(path.join(root,'probes.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
