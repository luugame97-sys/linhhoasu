function(event){
 var self=this;
 if(event.currentTarget===this.startBtn){if(this.isHaveHitCount()){this.startBtn.visible=false;this.atkBtn.visible=true;this.startAnim();}else S.ins().showTipsByLangId(30035871);return;}
 if(event.currentTarget!==this.atkBtn||this._serverHitPending)return;
 if(!this.isHaveHitCount()){S.ins().showTipsByLangId(30035871);return;}
 this._serverHitPending=true;this.isStartMove=false;this.atkBtn.visible=false;
 Y.ActivityModel.sendActivityOperate(this.actData.id,1,yD.FishMiniGameType.FishFight,0,function(r){
  self._serverHitPending=false;if(!self.stage)return;
  if(!r||r.result!==0){self.updateInfo();self.atkBtn.visible=true;return;}
  self.atkSpine.setAnimation(0,'a_2',false);
  self.sharkSpine.setAnimation(0,'a_2',false).waitPlayEnd().then(function(){if(!self.stage)return;self.updateInfo();self.atkBtn.visible=self.isHaveHitCount();self.isStartMove=self.isHaveHitCount();self.sharkSpine.setAnimation(0,'a_1',true);if(!self.isHaveHitCount())A.ins().dispatch(E.FISH_ACTIVITY_EVENT_END_UPDATE);});
 });
}
