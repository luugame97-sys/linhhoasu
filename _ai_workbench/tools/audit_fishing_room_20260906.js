'use strict';
// Read-only diagnostic. Actual handler + native receivers; all saves in memory and sockets forbidden.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),vm=require('vm'),net=require('net');
const root=path.resolve(process.argv[2]),app=path.join(root,'app');
const acorn=require(path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
process.env.CONFIG_BIN_PATH=path.join(root,'server.bin');process.env.NODE_ENV='test';process.env.LOG_DIR='';
net.Socket.prototype.connect=()=>{throw Error('ROOM_AUDIT_NETWORK_FORBIDDEN');};
const clone=x=>JSON.parse(JSON.stringify(x));
function stub(rel,exports){const f=require.resolve(path.join(app,rel));require.cache[f]={id:f,filename:f,loaded:true,exports};}
let saves=0;const durable=new Map();
stub('src/logger',{info(){},warn(){},error(){},debug(){}});
stub('src/services/PlayerService',{async savePlayer(id,p){saves++;durable.set(id,clone(p));return p;},wasRecentlySaved:()=>false});
const config=require(path.join(app,'src/services/ConfigService'));config.loadAllTables();
const fish=require(path.join(app,'src/handlers/fish'));
const main=fs.readFileSync(path.join(root,'main.js'),'utf8'),source=fs.readFileSync(path.join(app,'src/net/WSServer.js'),'utf8');
function extract(marker,after=0){const p=main.indexOf(marker,after);assert(p>=0,marker);let n=acorn.parseExpressionAt(main,p+marker.indexOf('function'),{ecmaVersion:'latest'});if(n.type==='SequenceExpression')n=n.expressions[0];assert.equal(n.type,'FunctionExpression');return main.slice(n.start,n.end);}
const posAt=main.indexOf('u.PosConfig=')+'u.PosConfig='.length;
let positionExpr=acorn.parseExpressionAt(main,posAt,{ecmaVersion:'latest'});assert.equal(positionExpr.type,'SequenceExpression');positionExpr=positionExpr.expressions[0];
const positions=clone(vm.runInNewContext('('+main.slice(positionExpr.start,positionExpr.end)+')',{}));
const serverAst=acorn.parse(source,{ecmaVersion:'latest'}),serverClass=serverAst.body.find(n=>n.type==='ClassDeclaration'&&n.id.name==='WSServer');assert(serverClass);
const broadcastMethod=serverClass.body.body.find(n=>n.type==='MethodDefinition'&&n.key.name==='broadcastExceptUser');assert(broadcastMethod);
const broadcast=vm.runInNewContext('(function'+source.slice(broadcastMethod.value.start,broadcastMethod.value.end)+')',{WebSocket:{OPEN:1}});
const rows=r=>Array.isArray(r)?r:[r];
function native(id){
 const stats={errors:[],otherStarts:0,joins:0},ctx={B:{deepCopy:clone,strformatByLangId:(id,v)=>String(v)},yD:{PosConfig:positions},S8:{sortF:()=>0},
  S:{ins:()=>({showTipsByLangId(){}})},P:{ins:()=>({close(){}})},T:{serverTimeMilli:Date.now()},
  Y:{ActorModel:{actorID:id},RoleModel:{getNameByStage:()=>''},FashionModel:{GetShowServerData:()=>({dbid:id,name:id,level:116,stage:1,fashionMap:{},rodId:5901,raftId:6201,food:5501}),CreteShowDataByInfo:x=>x},FishingModel:{fishInfo:{scene:1,rodId:5901,raftId:6201,food:5501},getRodResById:()=>'',getRaftResById:()=>''}}};
 function nativeFn(marker,after=0){return vm.runInNewContext('('+extract(marker,after)+')',ctx);}
 class Data{};Data.prototype.parse=nativeFn('Iye.prototype.parse=function');ctx.KD=Data;
 class Raid{
  constructor(){this.mEntityList={};this.m_CreatePlayerList=[];this.lootNode={$children:[],addChild:n=>this.lootNode.$children.push(n)};this.fishMainView={};}
  Init(){} OnEnter(){this.CreateAllPlayer();} OnExit(){this.mEntityList={};this.m_CreatePlayerList=[];}
  Create(d){if(this.mEntityList[d.handle])return null;const entity={id:d.handle,pos:d.pos};this.mEntityList[d.handle]=entity;return entity;}
  RemoveEntity(id){delete this.mEntityList[id];}
  entityPlayEnterAnim(){} entityPlayLevelAnim(n,cb){cb();}
  startFishing(){stats.otherStarts++;} switchRod(){} switchBait(){} switchRaft(){} playerEmoji(){}
 }
 for(const name of ['CreateRole','CreateRoleList','CreateAllPlayer','PlayerEnter','PlayerLevel'])Raid.prototype[name]=nativeFn('r.'+name+'=function',1695500);
 ctx.il=Raid;const manager=ctx.Y.RaidMgr={};manager.FishMapClear=nativeFn('_.FishMapClear=function');manager.EnterFishMapRaid=nativeFn('_.EnterFishMapRaid=function');
 const room={parseRoleData:nativeFn('ESe.parseRoleData=function')};
 const handlers={4050:'sc_fish_map_enter',4051:'sc_fish_map_other_enter',4052:'sc_fish_map_leave',4053:'sc_fish_player_emoji',4060:'sc_fish_map_other_start',4061:'sc_fish_map_other_switch_rod',4062:'sc_fish_map_other_switch_food',4063:'sc_fish_map_other_switch_raft'};
 for(const[tag,name]of Object.entries(handlers))handlers[tag]=nativeFn('ESe.'+name+'=function');
 return {ctx,stats,manager,receive(packet){if(packet.msgUid)return;try{if(handlers[packet.tag])handlers[packet.tag].call(room,clone(packet.data));}catch(e){stats.errors.push({tag:packet.tag,message:e.message});}},
  visible(){return Object.keys(manager.mFishRaid?.mEntityList||{}).sort();},points(){return Object.values(manager.mFishRaid?.mEntityList||{}).map(x=>({id:x.id,pos:x.pos,x:x.x,y:x.y,scaleX:x.scaleX}));}};
}
function server(){let seq=0;const endpoints=[],packets=[];
 const host={clients:new Map(),_sendSingle(ws,p){ws.log.push(clone(p));ws.client?.receive(p);}};
 function add(name,withPlayer=true){
  const p={userId:'room-'+name,playerId:name,name,serverId:1001,level:116,roleInfo:{kungfuId:4,subJob:0},items:{65:100,68:100,5534:100},currencies:{diamond:0,gold:0,silver:0},other_attr_info:{},taskInfo:{},fishInfo:{level:28,scene:1},systemUnlockInfo:{unlockedSystem:[215,221]},rechargeInfo:{monthCards:{}}};fish.ensureFishInfo(p);
  const endpoint={session:{userId:withPlayer?p.userId:null,player:withPlayer?p:null,_fishRoomMapId:0},client:native(name),ws:{readyState:1,log:[]}};
  endpoint.ws.client=endpoint.client;endpoint.session._broadcastExceptUser=(tag,data)=>{packets.push({from:name,tag,data:clone(data)});broadcast.call(host,endpoint.session.userId,tag,data);};
  host.clients.set(name,{ws:endpoint.ws,session:endpoint.session});endpoints.push(endpoint);return endpoint;
 }
 async function rpc(e,method,data={}){const r=await fish[method](data,e.session,++seq);for(const p of rows(r))host._sendSingle(e.ws,p);return r;}
 return {host,endpoints,packets,add,rpc,join:(e,id=1)=>rpc(e,'handleFishEnterMap',{id}),change:(e,id)=>rpc(e,'handleFishChangeScene',{id}),leave:e=>rpc(e,'handleFishLeaveMap')};
}
const cases=[];
async function probe(name,fn){try{cases.push({name,status:'PROBE_COMPLETE',evidence:await fn()});}catch(e){cases.push({name,status:'HARNESS_ERROR',error:e.stack});}}
async function run(){
 await probe('native_has_four_distinct_positions_zero_based',async()=>{assert.deepEqual(Object.keys(positions),['0','1','2','3']);assert.equal(new Set(Object.values(positions).map(p=>p.x+','+p.y)).size,4);return {positions,capacity:4,seatIndexBase:0,horizontalAnchorGap:456,verticalAnchorGap:201};});
 await probe('two_sequential_players_see_asymmetrically_and_overlap',async()=>{const h=server(),a=h.add('A'),b=h.add('B');const ra=await h.join(a),rb=await h.join(b);
  assert.deepEqual(a.client.visible(),['A','B']);assert.deepEqual(b.client.visible(),['B']);
  assert.equal(rows(ra)[0].data.players.length,0);assert.equal(rows(rb)[0].data.players.length,0);
  assert(a.client.points().every(p=>p.pos===1&&p.x===228&&p.y===-80));assert.equal(a.client.stats.errors.length,0);
  return {Asees:a.client.visible(),Bsees:b.client.visible(),Acoordinates:a.client.points(),incomingRosterSize:0,classification:'BUG_ONE_WAY_VISIBILITY_AND_OVERLAP'};
 });
 await probe('eight_players_have_no_capacity_or_distinct_seat_allocation',async()=>{const h=server(),e=Array.from({length:8},(_,i)=>h.add('P'+(i+1)));for(const p of e)await h.join(p);assert.equal(e[0].client.visible().length,8);assert.equal(e[7].client.visible().length,1);
  const points=e[0].client.points();assert.equal(new Set(points.map(p=>p.x+','+p.y)).size,1);assert.equal(new Set(points.map(p=>p.pos)).size,1);
  return {firstSees:e[0].client.visible(),lastSees:e[7].client.visible(),uniqueCoordinates:1,positionsSent:[...new Set(points.map(p=>p.pos))],capacityEnforced:false};
 });
 await probe('same_map_reentry_clears_existing_peers_without_resync',async()=>{const h=server(),a=h.add('A'),b=h.add('B');await h.join(a);await h.join(b);const before=a.client.visible(),broadcastCount=h.packets.length;await h.join(a);
  assert.deepEqual(before,['A','B']);assert.deepEqual(a.client.visible(),['A']);assert.equal(h.packets.length,broadcastCount);return {before,after:a.client.visible(),otherEnterRebroadcast:false};
 });
 await probe('different_map_packets_broadcast_to_all_but_native_entry_filters_map',async()=>{const h=server(),a=h.add('A'),b=h.add('B'),c=h.add('C'),observer=h.add('NOT_LOGGED_IN',false);await h.join(a,1);await h.join(b,1);await h.join(c,2);
  assert.deepEqual(a.client.visible(),['A','B']);assert.deepEqual(c.client.visible(),['C']);assert(b.ws.log.some(p=>p.tag===4051&&p.data.mapId===2));assert(observer.ws.log.some(p=>p.tag===4051));
  return {differentMapIgnoredByClient:true,broadcastFilteredOnServer:false,uninitializedSocketReceivesPresence:true,crossServerRooms:false};
 });
 await probe('two_server_instances_do_not_share_fish_presence',async()=>{const h1=server(),h2=server(),a=h1.add('S1A'),b=h2.add('S2B');await h1.join(a);await h2.join(b);assert.deepEqual(a.client.visible(),['S1A']);assert.deepEqual(b.client.visible(),['S2B']);return {sameMapIdAcrossServersVisible:false};});
 await probe('native_explicit_four_seat_payload_renders_four_distinct_anchors',async()=>{const client=native('SELF'),players=[0,2,3].map((pos,i)=>({dbid:'OTHER'+i,name:'OTHER'+i,level:116,stage:1,fashionMap:{},rodId:5901,raftId:6201,food:5501,pos}));
  client.receive({tag:4050,msgUid:0,data:{mapId:1,pos:1,time:0,players}});assert.equal(client.stats.errors.length,0);assert.equal(client.points().length,4);assert.equal(new Set(client.points().map(p=>p.x+','+p.y)).size,4);
  return {nativeWithoutAssetChanges:true,points:client.points(),visualAcceptance:false};
 });
 await probe('server_zero_seat_clamped_and_fifth_seat_invalid_in_native',async()=>{const p=server().add('A').session.player;assert.equal(fish.buildFishMapPlayer(p,p.fishInfo,0).pos,1);const client=native('SELF');client.receive({tag:4050,msgUid:0,data:{mapId:1,pos:1,players:[],time:0}});
  client.receive({tag:4051,msgUid:0,data:{mapId:1,mapPlayer:{dbid:'FIFTH',name:'FIFTH',level:116,stage:1,fashionMap:{},rodId:5901,raftId:6201,food:5501,pos:4}}});assert.equal(client.stats.errors.length,1);
  return {serverBuildRequested0Actual:1,nativePosition4Error:client.stats.errors[0],conclusion:'Do not allocate seats 1..4; native supports 0..3'};
 });
 await probe('leave_and_change_remove_old_peer_but_newcomer_roster_remains_empty',async()=>{const h=server(),a=h.add('A'),b=h.add('B'),c=h.add('C');await h.join(a);await h.join(b);await h.join(c,2);await h.change(b,2);
  assert.deepEqual(a.client.visible(),['A']);assert.deepEqual(c.client.visible(),['B','C']);assert.deepEqual(b.client.visible(),['B']);await h.leave(b);assert.deepEqual(c.client.visible(),['C']);
  return {oldMapLeaveWorks:true,newArrivalSeesExisting:false,explicitLeaveRemovesPeer:true};
 });
 await probe('ordinary_catch_has_no_peer_cast_animation_push',async()=>{const h=server(),a=h.add('A'),b=h.add('B');await h.join(a);await h.join(b);const start=h.packets.length;const r=await h.rpc(b,'handleFishCatch',{count:1});assert(rows(r).some(x=>x.tag===4000&&x.data.result===0));
  assert.equal(h.packets.length,start);assert.equal(a.client.stats.otherStarts,0);return {successfulCatch:true,peer4060Push:false,peerCastAnimationCalls:0};
 });
 await probe('rod_and_bait_switch_do_not_sync_peers_raft_does',async()=>{const h=server(),a=h.add('A'),b=h.add('B');await h.join(a);await h.join(b);let at=h.packets.length;
  const rod=await h.rpc(b,'handleFishRodSwitch',{id:5901});assert.equal(rows(rod).find(r=>r.msgUid).data.result,0);assert.equal(h.packets.length,at);
  const bait=await h.rpc(b,'handleFishBaitBagUpdate',{food:5534});assert.equal(rows(bait).find(r=>r.msgUid).data.result,0);assert.equal(h.packets.length,at);
  const raft=await h.rpc(b,'handleFishRaftSwitch',{id:6201});assert.equal(rows(raft).find(r=>r.msgUid).data.result,0);assert(h.packets.slice(at).some(p=>p.tag===4063));
  return {peerRod4061:false,peerBait4062:false,peerRaft4063:true};
 });
 const output={result:cases.every(x=>x.status==='PROBE_COMPLETE')?'AUDIT_COMPLETE':'HARNESS_ERROR',generatedAt:new Date().toISOString(),count:cases.length,remoteWrites:0,playerReads:0,nativeVisual:false,localMemorySaves:saves,cases};
 fs.writeFileSync(path.join(root,'room-audit.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));if(output.result==='HARNESS_ERROR')process.exitCode=1;
}
run().catch(e=>{console.error(e.stack);process.exitCode=1;});
