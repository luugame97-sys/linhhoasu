'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const acorn=require(process.env.FISH_ACORN_PATH||path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
const root=path.resolve(process.argv[2]),input=process.argv[3]||'main.js',target=process.argv[4]||'main.fixed.js',source=fs.readFileSync(path.join(root,input),'utf8');let output=source;const edits=[];
function patch(marker,transform,anchor){const at=output.indexOf(marker,anchor?output.indexOf(anchor):0);assert(at>=0,marker);let n=acorn.parseExpressionAt(output,at+marker.indexOf('function'),{ecmaVersion:'latest'});if(n.type==='SequenceExpression')n=n.expressions[0];const before=output.slice(n.start,n.end),after=transform(before);assert.notEqual(before,after);output=output.slice(0,n.start)+after+output.slice(n.end);edits.push({marker,before,after});}
function once(s,a,b){assert.equal(s.split(a).length-1,1,a);return s.replace(a,b);}
patch('u.sendChangeScene=function',()=> 'function(id,callback){return this.changeFishRoom(id,null,callback)}');
patch('u.reconnectSuccess=function',s=>once(s,'function(){','function(){this._fishRoomChanging=false;this.changeSceneCallBack=null;'));
patch('u.sendFishing=function',s=>once(s,'function(o){','function(o){if(this._fishRoomChanging)return;'));
patch('u.cs_fish_map_leave=function',()=> 'function(){if(this._fishRoomChanging)return;var m=this,raid=Y.RaidMgr.mFishRaid;this.isAutoFish=false;this.Rpc(4051,{},function(r){if(r&&r.result===0&&Y.RaidMgr.mFishRaid===raid)Y.RaidMgr.FishMapClear();})}');
const helpers=fs.readFileSync(path.join(__dirname,'fishing_rooms_client_methods_20260906.js'),'utf8').trim();
const modelEnd='u.getDealMap=function';output=once(output,modelEnd,helpers+'\n'+modelEnd);edits.push({insert:helpers+'\n',anchor:modelEnd});
patch('ESe.sc_fish_map_enter=function',s=>once(s,'Y.FishingModel.fishInfo.nextFishTime=0,','Y.FishingModel._fishRoomChanging=false,Y.FishingModel.fishing=false,Y.FishingModel.fishInfo.nextFishTime=0,'));
for(const name of ['sc_fish_map_other_enter','sc_fish_map_leave','sc_fish_map_other_start','sc_fish_map_other_switch_rod','sc_fish_map_other_switch_food','sc_fish_player_emoji','sc_fish_map_other_switch_raft']){
 patch('ESe.'+name+'=function',s=>once(s,'function(t){','function(t){if(t.roomId!=null&&(!this.roomInfo||Number(t.roomId)!==Number(this.roomInfo.roomId)||Number(t.mapId)!==Number(this.roomInfo.mapId)))return;'));
}
// Remove immediately: an exit tween otherwise leaves the old body on a reused seat.
patch('r.PlayerLevel=function',()=> 'function(id){this.m_CreatePlayerList=this.m_CreatePlayerList.filter(function(p){return p.dbid!==id;});this.RemoveEntity(id);}', 'i(Abt,');
patch('r.PlayerEnter=function',()=> 'function(p){if(this.mEntityList[p.dbid])return;this.m_CreatePlayerList.push(p);var entity=this.CreateRole(p);entity&&this.entityPlayEnterAnim(entity);}', 'i(Abt,');
patch('a.OnOpen=function',s=>{const end=s.lastIndexOf('}');return s.slice(0,end)+';this.initFishRoomButton();'+s.slice(end);},'i(Ggt,');
patch('a.OnClose=function',s=>once(s,'function(){','function(){this.closeFishRoomPicker();'),'i(Ggt,');
const viewHelpers=fs.readFileSync(path.join(__dirname,'fishing_rooms_view_methods_20260906.js'),'utf8').trim();
const panel=output.indexOf('i(Ggt,'),anchor='a.updateBaitInfo=function',at=output.indexOf(anchor,panel);assert(at>=0);output=output.slice(0,at)+viewHelpers+'\n'+output.slice(at);edits.push({insert:viewHelpers+'\n',anchor});
patch('(_=V6e.prototype).childrenCreated=function',s=>{
 const end=s.indexOf('this.mutlFastGotoLab.textFlow');assert(end>0);
 const card=fs.readFileSync(path.join(__dirname,'fishing_auto_power_layout_20260906.js'),'utf8').trim();
 return card.slice(0,-1)+s.slice(end);
});
acorn.parse(output,{ecmaVersion:'latest'});
let restored=output;for(const e of edits.slice().reverse())restored=e.insert?once(restored,e.insert,''):once(restored,e.after,e.before);assert.equal(restored,source);
fs.writeFileSync(path.join(root,target),output);if(target==='main.fixed.js')fs.writeFileSync(path.join(root,'client-build.json'),JSON.stringify({result:'PASS',edits,rooms:4,nativeUI:true},null,2)+'\n');
console.log(JSON.stringify({result:'PASS',edits:edits.length,nativeUI:true}));
