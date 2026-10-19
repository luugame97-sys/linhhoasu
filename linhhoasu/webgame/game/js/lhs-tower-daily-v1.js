/* Server-authoritative tower rollover at 00:00 GMT+7, including open sessions. */
(function(root){
  'use strict';if(root.LhsTowerDaily)return;
  var api=root.LhsTowerDaily={version:'20261018_tower_daily_reset_v2',day:0,pending:false,installed:false},identity='',lastRequest=0;
  function manager(){return root.GlobalManager||root.GameGlobalYDXZ||root.W||{};}
  function owner(){var m=manager(),u=root.UserInfo||{};return m.ActorModel&&m.ActorModel.actorID?u.ServerID+':'+u.UserID+':'+m.ActorModel.actorID:'';}
  function time(){var x=root.LhsCrossEvents;return x&&x.snapshot?Number(x.snapshot.serverTime)+Date.now()-x.receivedAt:Date.now();}
  function dayKey(now){var d=new Date(now+25200000);return d.getUTCFullYear()*10000+(d.getUTCMonth()+1)*100+d.getUTCDate();}
  function apply(r){if(root.LhsTowerFixV2&&root.LhsTowerFixV2.applySnapshot)return root.LhsTowerFixV2.applySnapshot(r);var m=manager().ClimbingTowerModel;if(!m||!r||r.result!==0||!Number.isFinite(r.nextResetAt))return false;m.initData(r);api.day=r.dayKey;api.nextResetAt=r.nextResetAt;
    var c=root.MessageCenter&&root.MessageCenter.ins();if(c)c.dispatch((root.MessageDef||{}).CLIMBING_TOWER_INFO_UPDATE||'CLIMBING_TOWER_INFO_UPDATE');return true;}
  function refresh(){var m=manager().ClimbingTowerModel,id=owner();if(!id||!m||typeof m.Rpc!=='function'||api.pending)return;
    api.pending=true;lastRequest=Date.now();var timeout=root.setTimeout(function(){api.pending=false;},8000);
    try{m.Rpc(3704,{},function(r){root.clearTimeout(timeout);api.pending=false;if(owner()===id)apply(r);},function(){root.clearTimeout(timeout);api.pending=false;});}
    catch(_){root.clearTimeout(timeout);api.pending=false;}}
  function install(){var T=root.ClimbingTowerMain;try{T=T||root.egret.getDefinitionByName('ClimbingTowerMain');}catch(_){}
    var raid=manager().RaidInfoModel,rp=raid&&Object.getPrototypeOf(raid);if(rp&&typeof rp.Rpc==='function'&&!rp.__lhsTowerDailyRpc){var rpc=rp.Rpc;rp.Rpc=function(tag,data,ok,error){if(Number(tag)!==2300||Number(data&&data.type)!==9)return rpc.apply(this,arguments);var self=this;return rpc.call(this,tag,data,function(r){if(!r||r.result!==0){refresh();var tips=root.UserTips;if(tips&&tips.ins)tips.ins().showTips(r&&r.msg||'Tiến độ bảo điện đã thay đổi. Vui lòng thử lại.');if(typeof error==='function')error.call(self,r);return;}if(typeof ok==='function')ok.call(self,r);},error);};rp.__lhsTowerDailyRpc=true;}
    var p=T&&T.prototype;if(!p||typeof p.OnOpen!=='function')return false;if(!p.__lhsTowerDaily){var open=p.OnOpen;p.OnOpen=function(){var r=open.apply(this,arguments);refresh();return r;};p.__lhsTowerDaily=true;}return api.installed=true;}
  api.refresh=refresh;api.apply=apply;api.dayKey=dayKey;
  (function tick(){install();var id=owner();if(id!==identity){identity=id;api.day=0;api.pending=false;lastRequest=0;}
    if(id&&api.day!==dayKey(time())&&Date.now()-lastRequest>=10000)refresh();root.setTimeout(tick,1000);}());
}(window));
