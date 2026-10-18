/* Mount upgrade response guard: do not animate or refresh attrs on failed RPC. */
/* Swallow errors/replays never reach the native success callback. */
(function(root){
  'use strict';
  var version='20261017_mount_star_progress_v1';if(root.LhsMountStarFix)return;
  var api=root.LhsMountStarFix={version:version,installed:false};
  function notice(text){var t=root.UserTips||(root.GlobalManager||{}).UserTips;if(t&&t.ins)t.ins().showTips(text);}
  function install(){var x=root.GlobalManager||root.GameGlobalYDXZ||root.W,m=x&&x.MountModel,p=m&&Object.getPrototypeOf(m);if(!p||typeof p.Rpc!=='function')return false;
    if(p.__lhsSwallowFix)return api.installed=true;var rpc=p.Rpc;
    p.Rpc=function(tag,data,ok,error){
      if(Number(tag)!==3205)return rpc.apply(this,arguments);
      if(this.__lhsSwallowPending)return false;
      var self=this,user=root.UserInfo||{},actor=String(user.ServerID)+':'+String(user.UserID)+':'+String(x.ActorModel&&x.ActorModel.actorID),key=actor+':'+data.targetUid+':'+data.matUid;
      if(!self.__lhsSwallowRequest||self.__lhsSwallowRequest.key!==key){var bytes=new Uint8Array(12);root.crypto.getRandomValues(bytes);var events=root.LhsCrossEvents,now=events&&events.snapshot?Number(events.snapshot.serverTime)+Date.now()-events.receivedAt:Date.now();self.__lhsSwallowRequest={key:key,id:Math.floor(now)+'-'+Array.prototype.map.call(bytes,function(n){return n.toString(16).padStart(2,'0');}).join('')};}
      var request=Object.assign({},data,{requestId:self.__lhsSwallowRequest.id});self.__lhsSwallowPending=true;
      try{return rpc.call(self,tag,request,function(r){self.__lhsSwallowPending=false;
        if(!r||r.result!==0||!r.data||Number(r.data.uid)!==Number(data.targetUid)){notice(r&&r.msg||'Tăng sao chưa hoàn tất. Vui lòng thử lại hoặc đăng nhập lại.');if(typeof error==='function')error.call(self,r);return;}
        self.__lhsSwallowRequest=null;
        if(r.replay){var c=root.MessageCenter&&root.MessageCenter.ins();if(c){c.dispatch((root.MessageDef||{}).MOUNT_MAIN_PANEL_UPDATE||'MOUNT_MAIN_PANEL_UPDATE');c.dispatch((root.MessageDef||{}).MOUNT_SWALLOW_VIEW_UPDATE||'MOUNT_SWALLOW_VIEW_UPDATE',-1);}return;}
        if(typeof ok==='function')ok.call(self,r);
      },function(e){self.__lhsSwallowPending=false;notice('Chưa nhận được kết quả tăng sao. Thử lại sẽ dùng cùng mã giao dịch.');if(typeof error==='function')error.call(self,e);});}
      catch(e){self.__lhsSwallowPending=false;throw e;}
    };p.__lhsSwallowFix=true;return api.installed=true;
  }
  api.install=install;(function retry(){if(!install())root.setTimeout(retry,250);}());
}(window));
(function(root){'use strict';var V='20260915_mount_singleflight_v2';if(root.LhsMountFixV1&&root.LhsMountFixV1.version===V)return;var a=root.LhsMountFixV1={version:V,installed:false,attempts:0};function m(){return root.GlobalManager||root.GameGlobalYDXZ||root.W||null}function d(n,v){var c=root.MessageCenter&&root.MessageCenter.ins&&root.MessageCenter.ins();if(c&&c.dispatch){var e=root.MessageDef&&root.MessageDef[n]||n;c.dispatch(e,v)}}function i(){a.attempts++;var x=m(),o=x&&x.MountModel,p=o&&(o.constructor&&o.constructor.prototype||Object.getPrototypeOf&&Object.getPrototypeOf(o));if(!p||typeof p.SendUpgrade!=='function'){if(a.attempts<120&&root.setTimeout)root.setTimeout(i,100);return}var old=p.SendUpgrade;if(old.__lhsMountFix)return;a.original=old;p.SendUpgrade=function(uid){var self=this;if(self.__lhsMountUpgradePending)return false;self.__lhsMountUpgradePending=true;return self.Rpc(3204,{uid:uid},function(r){self.__lhsMountUpgradePending=false;r=r||{};if(Number(r.result)!==0){d('MOUNT_MAIN_PANEL_UPDATE');return}for(var n=0;n<self._mountInfo.data.length;n++)if(self._mountInfo.data[n].uid==r.data.uid)self._mountInfo.data[n]=r.data;var sm=self.SoundManager||x.SoundManager;if(sm&&sm.PlayEffect)sm.PlayEffect('common_levelup_1_mp3');d('ATTR_CHANGE',2);d('MOUNT_MAIN_PANEL_UPDATE')},function(){self.__lhsMountUpgradePending=false})};p.SendUpgrade.__lhsMountFix=true;a.installed=true}i()})(window);
