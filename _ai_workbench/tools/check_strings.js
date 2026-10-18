const fs = require('fs');
const path = require('path');

const p = path.resolve(__dirname, '../../linhhoasu/webgame/game/js/main.min_drop100.js');
const content = fs.readFileSync(p, 'utf8');

const s1 = 'var r=Y.Config.PetSoulConfig[a[o].id];if(r.races==s.type)if(n<Y.PetSoulModel.getScoreByData(a[o]))return!0';
console.log('s1 occurrences:', content.split(s1).length - 1);

const s2 = 't=Ad.getBoneNodeInfo(this.mBody,"p_smoke",this.mBody.parent),this.runSmokeOffsetX=O.abs(t.pos.x),this.runSmokeEff.y=t.pos.y';
console.log('s2 occurrences:', content.split(s2).length - 1);

const s3 = 'a.sendRelease=function(t,c){var e=this;this.Rpc(3315,{uid:t},function(r){if(r&&r.result===0){e.deletePet(t),A.ins().dispatch(E.PET_DATA_UPDATE),A.ins().dispatch(E.ATTR_CHANGE,6);var s="Phóng sinh thành công! Nhận "+Number(r.silver||0).toLocaleString()+" Bạc";r.refundFruit>0&&(s+=", hoàn trả "+Number(r.refundFruit||0).toLocaleString()+" Quả Linh"),S.ins().showTips(s),c&&c(r)}else S.ins().showTips(r&&r.msg||"Phóng sinh thất bại")})},';
console.log('s3 occurrences:', content.split(s3).length - 1);
