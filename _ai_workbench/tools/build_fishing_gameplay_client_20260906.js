'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const acorn=require(path.resolve(__dirname,'../../linhhoasu/lhs/newServer/node_modules/acorn'));
const root=path.resolve(process.argv[2]),original=fs.readFileSync(path.join(root,'main.js'),'utf8');let source=original;const edits=[];
function once(s,a,b){assert.equal(s.split(a).length-1,1,a);return s.replace(a,b);}
function patch(marker,transform,after=0){const p=source.indexOf(marker,after);assert(p>=0,marker);let n=acorn.parseExpressionAt(source,p+marker.indexOf('function'),{ecmaVersion:'latest'});if(n.type==='SequenceExpression')n=n.expressions[0];const before=source.slice(n.start,n.end),next=transform(before);assert.notEqual(before,next);source=source.slice(0,n.start)+next+source.slice(n.end);edits.push({marker,before,after:next});}
patch('u.sendFishing=function',s=>{
 s=once(s,'function(o){if(this._fishRoomChanging)return;var r=this;','function(o){if(this._fishRoomChanging||this._catchRequestPending)return;var r=this,generation=this._autoPowerGeneration||0,answered=false;this._catchRequestPending=true;');
 s=once(s,'this.Rpc(4e3,{count:o},function(i){','this.Rpc(4e3,{count:o,requestId:"fish_cast_"+Date.now()+"_"+Math.floor(Math.random()*1e9),expectedRevision:Number(this.fishInfo&&this.fishInfo.balanceRevision||0)},function(i){if(answered||generation!==(r._autoPowerGeneration||0))return;answered=true;r._catchRequestPending=false;if(i&&i.balanceRevision!=null)r.fishInfo.balanceRevision=i.balanceRevision;');
 return s;
});
patch('u.parseDoubleFish=function',()=> 'function(rows,count){rows.forEach(function(f){f.isDouble=!!f.isDouble;});}');
patch('u.sendAutoPowerFish=function',s=>once(s,'if(r&&r.orderState)m.fishInfo.orders=r.orderState;','if(r&&r.orderState)m.fishInfo.orders=r.orderState;if(r&&r.extraPrice){m.fishInfo.extraPrice=r.extraPrice;A.ins().dispatch(E.FISH_PRICE_REWARN_UPDATE);}'));
patch('u.reconnectSuccess=function',s=>once(s,'function(){','function(){this._catchRequestPending=false;this._soulRequestPending=false;'));
patch('u.changeFishRoom=function',s=>once(s,'if(m.fishing||m._autoPowerPending||','if(m._catchRequestPending||m.fishing||m._autoPowerPending||'));
patch('p.sendFishing=function',s=>{
 s=once(s,'function(t){var r=this;','function(t){var r=this,m=Y.FishingModel;if(m._soulRequestPending)return;m._soulRequestPending=true;var generation=m._autoPowerGeneration||0,answered=false;');
 return once(s,'this.Rpc(4060,{count:t},function(e){','this.Rpc(4060,{count:t,requestId:"soul_cast_"+Date.now()+"_"+Math.floor(Math.random()*1e9),expectedRevision:Number(m.fishInfo.balanceRevision||0)},function(e){if(answered||generation!==(m._autoPowerGeneration||0))return;answered=true;m._soulRequestPending=false;if(e&&e.balanceRevision!=null)m.fishInfo.balanceRevision=e.balanceRevision;');
});
patch('f.sendActivityOperate=function',()=> 'function(id,module,index,param,callback,context){var self=this;this.Rpc(1700,{id:id,module:module,index:index,param:param,requestId:"fish_event_"+Date.now()+"_"+Math.floor(Math.random()*1e9),expectedRevision:Number(Y.FishingModel.fishInfo&&Y.FishingModel.fishInfo.balanceRevision||0)},function(r){if(r&&r.balanceRevision!=null)Y.FishingModel.fishInfo.balanceRevision=r.balanceRevision;if(r&&r.fishRank){if(Y.Config.ActivityConfig[id].activityType===33)self.onActivityFishKingRank(r.fishRank);else self.OnActivityRankInfo(r.fishRank);}if(r&&r.result!==0)S.ins().showTips("Chưa hoàn tất: "+(r.reason||"Vui lòng thử lại"));if(r&&r.rewardInfo&&Y.Config.ActivityConfig[id].activityType===33&&!r.replayed)Er.Open(r.rewardInfo);callback&&callback(r);},null,context)}');
patch('d.sendOperate=function',s=>{
 s=once(s,'n={id:this.id,module:t,index:0,param:0}','n={id:this.id,module:t,index:0,param:0,requestId:"fish_bottle_"+Date.now()+"_"+Math.floor(Math.random()*1e9),expectedRevision:Number(Y.FishingModel.fishInfo.balanceRevision||0)}');
 return once(s,'function(t){a._preOperateModule=-1,','function(t){if(t&&t.balanceRevision!=null)Y.FishingModel.fishInfo.balanceRevision=t.balanceRevision;if(t&&t.result!==0)S.ins().showTips("Chưa hoàn tất: "+(t.reason||"Vui lòng thử lại"));if(t&&t.result===0&&t.rewardInfo&&!t.replayed)Er.Open(t.rewardInfo);a._preOperateModule=-1,');
},source.indexOf('i(zFt,'));
// Prevent UI-only record-delta popup logic from assuming every push contains rewardInfo.
patch('d.updateActvityData=function',s=>once(s,'n=parseInt(i),Er.Open(e.rewardInfo),','n=parseInt(i),e&&e.rewardInfo&&Er.Open(e.rewardInfo),'),source.indexOf('i(zFt,'));
// The advertised rod/raft packages have independent availability for the complete event window.
patch('d.getConfig=function',s=>{
 assert(s.includes('KFt.prototype.getConfig.call(this)'));
 return 'function(){var r=B.deepCopy(KFt.prototype.getConfig.call(this));if(r)r.giftIds=[11000101,11000102,11000106,11000107,11000201,11000202,11000203,11000204,11000205,11000206,11000207,11000208];return r;}';
},source.indexOf('i(zFt,'));
patch('f.CreateActivityData=function',s=>once(s,'function(t){','function(t){if(Y.Config.ActivityConfig[t.id]&&Y.Config.ActivityConfig[t.id].activityType===33&&Y.Config.Activity33Config[t.id])Y.Config.Activity33Config[t.id].giftIds=[11000101,11000102,11000106,11000107,11000201,11000202,11000203,11000204,11000205,11000206,11000207,11000208];'));
// Attack animation consumes the server damage result and waits for its ACK.
patch('d.onclick=function',()=>fs.readFileSync(path.join(__dirname,'fishing_hitgame_callback_20260906.js'),'utf8').trim(),source.indexOf('i(ezt,'));
// Show the chosen server balance at the native fishing help entry.
patch('a.onClick=function',s=>once(s,'case this.helpBtn:S.ins().showHelpContent(17);','case this.helpBtn:S.ins().showHelpContent(17);S.ins().showTips("Bảng máy chủ: mồi thường 4% hụt, 2% thoát; di vật 2%. Mồi/cần đặc biệt áp dụng buff theo mô tả.");'),source.indexOf('i(Ggt,'));
patch('ESe.Init=function',s=>once(s,'e.roleSpine.setEntityAnimtion(0,yht[103][0],!0)','e.roleSpine.setEntityAnimtion(0,yht[103][0],!0);var bounds=e.roleSpine.getBounds();var fit=Math.min(1,300/Math.max(1,bounds.width),300/Math.max(1,bounds.height));e.roleSpine.scaleX=e.roleSpine.scaleY=fit'),source.indexOf('i(vye,'));
patch('r.CreateRole=function',s=>once(s,'t.scaleX=e.scaleX','t.scaleX=e.scaleX*.76,t.scaleY=.76'),source.indexOf('i(Abt,'));
patch('ESe.createFishIcon=function',s=>once(s,';0<i;){',';0<i;){if(!s.length)s=B.deepCopy(this.slot_config);'),source.indexOf('i(vye,'));
acorn.parse(source,{ecmaVersion:'latest'});let restored=source;for(const e of edits.slice().reverse())restored=once(restored,e.after,e.before);assert.equal(restored,original);
fs.writeFileSync(path.join(root,'main.fixed.js'),source);fs.writeFileSync(path.join(root,'gameplay-client-build.json'),JSON.stringify({edits,source:'production baseline',deployed:false},null,2)+'\n');console.log(JSON.stringify({result:'PASS',edited:edits.length}));
