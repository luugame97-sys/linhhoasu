'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '../..');
const bundlePath = path.join(root, 'linhhoasu/webgame/game/js/main.min_drop100.js');
let source = fs.readFileSync(bundlePath, 'utf8');

const beforeHash = crypto.createHash('sha256').update(source).digest('hex');

// 1. Thêm sendRelease vào PetModel sau sendReset
const anchor1 = 'a.sendReset=function(t){var e=this;this.Rpc(3307,{uid:t},function(t){t&&(t.data&&e.updatePetData(t.data),Y.CuriosModel.taskCheck(),Er.Open(t.rewards),A.ins().dispatch(E.PET_DATA_UPDATE),A.ins().dispatch(E.ATTR_CHANGE,6))})},';
const patch1 = anchor1 + 'a.sendRelease=function(t,c){var e=this;this.Rpc(3315,{uid:t},function(r){if(r&&r.result===0){e.deletePet(t),A.ins().dispatch(E.PET_DATA_UPDATE),A.ins().dispatch(E.ATTR_CHANGE,6);var s="Phóng sinh thành công! Nhận "+Number(r.silver||0).toLocaleString()+" Bạc";r.refundFruit>0&&(s+=", hoàn trả "+Number(r.refundFruit||0).toLocaleString()+" Quả Linh"),S.ins().showTips(s),c&&c(r)}else S.ins().showTips(r&&r.msg||"Phóng sinh thất bại")})},';

if (!source.includes(anchor1)) throw new Error('ANCHOR_1_NOT_FOUND');
source = source.replace(anchor1, patch1);

// 2. Thêm releaseBtn vào HIt.prototype.OnOpen sau this.resetBtn.addClickEvent
const anchor2 = 'this.resetBtn.addClickEvent(function(){i.onClickResetBtn()},this),';
const patch2 = anchor2 + 'i.initReleaseBtn&&i.initReleaseBtn(),';

if (!source.includes(anchor2)) throw new Error('ANCHOR_2_NOT_FOUND');
source = source.replace(anchor2, patch2);

// 3. Thêm initReleaseBtn và onClickReleaseBtn vào HIt.prototype trước onClickHelpBtn
const anchor3 = ',a.onClickHelpBtn=function(){';
const patch3 = ',a.initReleaseBtn=function(){var self=this;if(!this.releaseBtn&&this.resetBtn&&this.resetBtn.parent){var rb=this.releaseBtn=new U.Button;rb.skinName="BtnRed0Skin";rb.label="Phóng sinh";rb.scaleX=rb.scaleY=.55;rb.x=this.resetBtn.x;rb.y=this.resetBtn.y>=55?this.resetBtn.y-50:this.resetBtn.y+50;this.resetBtn.parent.addChild(rb);rb.addEventListener(egret.TouchEvent.TOUCH_TAP,function(){self.onClickReleaseBtn()},this)}this.releaseBtn&&this.resetBtn&&(this.releaseBtn.x=this.resetBtn.x,this.releaseBtn.y=this.resetBtn.y>=55?this.resetBtn.y-50:this.resetBtn.y+50,this.releaseBtn.visible=!0)},a.onClickReleaseBtn=function(){var e=this;if(-1!=this._petUId){var t=Y.PetModel.getPetDataByUid(this._petUId);if(t){if(t.locked)return void S.ins().showTipsByLangId(30032323);if(t.slot<=-1&&t.slot>=-3)return void S.ins().showTips("Linh thú đang xuất chiến, không thể phóng sinh!");var soul=Y.PetSoulModel&&Y.PetSoulModel.getPetSoulIdByPetUid&&Y.PetSoulModel.getPetSoulIdByPetUid(this._petUId);if(soul&&soul>0)return void S.ins().showTips("Linh thú đang gắn Hồn Thú, không thể phóng sinh!");var cfg=Y.Config.PetConfig[t.id]||{},q=cfg.quality||2;var map={2:5e3,3:1e4,4:25e3,5:6e4,6:15e4,7:5e5,9:2e6,10:1e7},silver=map[q]||5e3;var name=B.ConvertLanguageToText(cfg.name)||"Linh thú";var msg="Xác nhận phóng sinh ["+name+"]?\\nNhận được: "+Number(silver).toLocaleString()+" Bạc";this._resetCount>0&&(msg+="\\nHoàn trả: "+Number(this._resetCount).toLocaleString()+" Quả Linh");Ost.ins().showWarnLabel(msg,{func:function(){Y.PetModel.sendRelease(e._petUId,function(){e.CloseSelf&&e.CloseSelf()})},thisObj:e},null,"normal",{notClickMask:!1})}}}' + anchor3;

if (!source.includes(anchor3)) throw new Error('ANCHOR_3_NOT_FOUND');
source = source.replace(anchor3, patch3);

fs.writeFileSync(bundlePath, source, 'utf8');
const afterHash = crypto.createHash('sha256').update(source).digest('hex');

console.log(JSON.stringify({
  result: 'PASS',
  before: beforeHash,
  after: afterHash,
  length: source.length
}));
