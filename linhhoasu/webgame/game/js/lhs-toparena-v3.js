/* Durable TopArena requests; native panels remain in use. */
(function(root){'use strict';
  if(root.LhsTopArenaV3)return;
  var api=root.LhsTopArenaV3={installed:false},mutations={2350:1,6201:1,6202:1,6213:1,6216:1,6218:1,6220:1},seq=0;
  function manager(){return root.GlobalManager||root.GameGlobalYDXZ||{};}
  function identity(){var u=root.UserInfo||{};return String(u.ServerID)+':'+String(u.UserID);}
  function notice(msg){if(root.UserTips&&root.UserTips.ins)root.UserTips.ins().showTips(msg);}
  function install(){var model=manager().TopArenaModel,p=model&&Object.getPrototypeOf(model);if(!p||!p.Rpc)return false;
    if(p.__lhsTopArenaV3)return true;p.__lhsTopArenaV3=true;var rpc=p.Rpc,nativeInfo=p.onInfoUpdate;
    p.Rpc=function(tag,data,callback,error){var self=this,owner=identity(),args=data||{},key=String(tag),cycle=self.info&&self.info.cycleKey||'';
      if(mutations[tag]){self._taPending=self._taPending||{};var signature=JSON.stringify([owner,cycle,tag,args]),pending=self._taPending[key];
        if(pending&&pending.inflight)return;
        if(pending&&pending.signature!==signature){notice('Yêu cầu trước chưa xác nhận. Hãy thử lại đúng thao tác đó.');return;}
        if(!pending)pending=self._taPending[key]={signature:signature,id:'ta3_'+Date.now()+'_'+(++seq)+'_'+Math.floor(Math.random()*1e9)};
        if(!pending.args)pending.args=Object.assign({},args,{requestId:pending.id,cycleKey:cycle,challengeVersion:self.challengeInfo&&self.challengeInfo.challengeVersion||'',round:self.getCurRound?self.getCurRound():0});
        args=pending.args;
        pending.inflight=true;var timer=root.setTimeout(function(){pending.inflight=false;},10000);
      }
      return rpc.call(self,tag,args,function(r){if(owner!==identity())return;
        if(timer)root.clearTimeout(timer);if(pending)pending.inflight=false;
        if(r&&r.result!=null&&r.result!==0){if(!r.retryable&&self._taPending)delete self._taPending[key];notice(r.message||'Yêu cầu chưa được chấp nhận.');if(error)error.call(self,r);return;}
        if(self._taPending)delete self._taPending[key];
        if(r&&r.challengeInfo)self.challengeInfo=r.challengeInfo;
        if(r&&r.info&&r.playerInfo)self.onInfoUpdate(r);
        if(callback)callback.call(self,r);
      },function(r){if(timer)root.clearTimeout(timer);if(pending)pending.inflight=false;if(error)error.call(self,r);});
    };
    p.onInfoUpdate=function(r){if(!r||!r.info||!r.playerInfo)return;var old=this.info&&this.info.cycleKey;if(old&&old!==r.info.cycleKey){this.matchInfo=null;this.showInfo=null;this.selfRoomIdMap={};this._taPending={};}
      var signature=JSON.stringify([r.info,r.playerInfo]);if(signature===this._taInfoSignature)return;this._taInfoSignature=signature;return nativeInfo.call(this,r);};
    var nativeSelfRoom=p.parseSelfRoomId;
    p.parseSelfRoomId=function(){if(nativeSelfRoom)nativeSelfRoom.call(this);var room=this.matchInfo&&this.matchInfo.roomInfo,actor=manager().ActorModel&&manager().ActorModel.actorID;
      if(room)Object.keys(room.playerMap||{}).forEach(function(k){var entry=room.playerMap[k];if(entry.playerId===actor){this.selfRoomIdMap[this.getCurRoomMatchMode()]=room.roomId;}},this);};
    var nativeClose=p.OnSocketClose;
    p.OnSocketClose=function(){this._taInfoSignature='';if(this._taPending)Object.keys(this._taPending).forEach(function(k){this._taPending[k].inflight=false;},this);if(nativeClose)return nativeClose.apply(this,arguments);};
    // The server's round/step timestamp is authoritative across daily resets.
    p.getNextBattleTime=function(step){var row=root.LhsCrossEvents&&root.LhsCrossEvents.snapshot&&root.LhsCrossEvents.snapshot.events.topArena;
      var t=row&&row.matchConfig,round=this.getRoomRound();if(!t)return 0;var start=t.promotionStartTime+round*86400000;
      var times=manager().Config.TopArenaBaseConfig.roundFightTime,day=Math.floor((start+25200000)/86400000)*86400000-25200000;
      if(day+times[0]*1000<start)day+=86400000;return day+times[step]*1000;};
    p.GetPassOpenDay=function(){var t=manager().Config.TopArenaOpenConfig[this.getCurMatchId()];if(!t)return -1;var snap=root.LhsCrossEvents&&root.LhsCrossEvents.snapshot;
      var now=snap?Number(snap.serverTime)+Date.now()-root.LhsCrossEvents.receivedAt:Date.now();return 1+Math.floor((now+25200000)/86400000)-Math.floor((t.gamePassStartTime+25200000)/86400000);};
    api.installed=true;return true;
  }
  api.install=install;(function tick(){if(!install())root.setTimeout(tick,500);})();
})(window);
