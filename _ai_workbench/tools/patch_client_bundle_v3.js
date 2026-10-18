const fs = require('fs');
const path = require('path');

const bundlePath = path.resolve(__dirname, '../../linhhoasu/webgame/game/js/main.min_drop100.js');
let content = fs.readFileSync(bundlePath, 'utf8');

const oldUpdate = 'this.currencyItem.data={itemId:36},this.update()},a.update=function(){if(-1!=this._petUId){';
const newUpdate = 'this.currencyItem.data={itemId:36},this.update()},a.update=function(){this.initReleaseBtn&&this.initReleaseBtn();if(-1!=this._petUId){';

if (!content.includes(oldUpdate)) {
    throw new Error('oldUpdate target string not found in main.min_drop100.js');
}
content = content.replace(oldUpdate, newUpdate);

const oldInit = 'a.initReleaseBtn=function(){var self=this;if(!this.releaseBtn&&this.resetBtn&&this.resetBtn.parent){var rb=this.releaseBtn=new U.Button;rb.skinName="BtnRed0Skin";rb.label="Phóng sinh";rb.scaleX=rb.scaleY=.55;rb.x=this.resetBtn.x;rb.y=this.resetBtn.y>=55?this.resetBtn.y-50:this.resetBtn.y+50;this.resetBtn.parent.addChild(rb);rb.addEventListener(egret.TouchEvent.TOUCH_TAP,function(){self.onClickReleaseBtn()},this)}this.releaseBtn&&this.resetBtn&&(this.releaseBtn.x=this.resetBtn.x,this.releaseBtn.y=this.resetBtn.y>=55?this.resetBtn.y-50:this.resetBtn.y+50,this.releaseBtn.visible=!0)},';

const newInit = 'a.initReleaseBtn=function(){var self=this;var container=(this.shareBtn&&this.shareBtn.parent)||(this.resetBtn&&this.resetBtn.parent)||this;if(!this.releaseBtn){var rb=this.releaseBtn=new U.Button;rb.skinName="BtnRed0Skin";rb.label="Phóng sinh";rb.width=92;rb.height=36;container.addChild(rb);rb.addEventListener(egret.TouchEvent.TOUCH_TAP,function(){self.onClickReleaseBtn()},this)}var updatePos=function(){if(!self.releaseBtn)return;if(self.shareBtn&&self.shareBtn.y>0){self.releaseBtn.x=self.shareBtn.x-(self.releaseBtn.width-(self.shareBtn.width||60))/2;self.releaseBtn.y=self.shareBtn.y+(self.shareBtn.height||60)+16}else if(self.resetBtn&&self.resetBtn.y>0){self.releaseBtn.x=self.resetBtn.x-(self.releaseBtn.width-(self.resetBtn.width||60))/2;self.releaseBtn.y=self.resetBtn.y+(self.resetBtn.height||60)+95}else{self.releaseBtn.x=580;self.releaseBtn.y=360}self.releaseBtn.visible=!0;if(self.releaseBtn.parent&&self.releaseBtn.parent.setChildIndex){self.releaseBtn.parent.setChildIndex(self.releaseBtn,self.releaseBtn.parent.numChildren-1)}};updatePos();if(typeof egret!=="undefined"&&egret.callLater){egret.callLater(updatePos,this)}else{setTimeout(updatePos,100)}},';

if (!content.includes(oldInit)) {
    throw new Error('oldInit target string not found in main.min_drop100.js');
}
content = content.replace(oldInit, newInit);

fs.writeFileSync(bundlePath, content, 'utf8');
console.log('PATCH_SUCCESS: Updated main.min_drop100.js');
