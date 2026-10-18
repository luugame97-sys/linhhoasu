const fs = require('fs');
const path = require('path');

const bundlePath = path.resolve(__dirname, '../../linhhoasu/webgame/game/js/main.min_drop100.js');
let content = fs.readFileSync(bundlePath, 'utf8');

// 1. Guard checkPetRedPoint
const s1_old = 'var r=Y.Config.PetSoulConfig[a[o].id];if(r.races==s.type)if(n<Y.PetSoulModel.getScoreByData(a[o]))return!0';
const s1_new = 'var r=Y.Config.PetSoulConfig[a[o].id];if(s&&r&&r.races==s.type)if(n<Y.PetSoulModel.getScoreByData(a[o]))return!0';
if (!content.includes(s1_old)) throw new Error('s1_old not found');
content = content.replace(s1_old, s1_new);

// 2. Guard p_smoke bone
const s2_old = 't=Ad.getBoneNodeInfo(this.mBody,"p_smoke",this.mBody.parent),this.runSmokeOffsetX=O.abs(t.pos.x),this.runSmokeEff.y=t.pos.y';
const s2_new = 't=Ad.getBoneNodeInfo(this.mBody,"p_smoke",this.mBody.parent),this.runSmokeOffsetX=O.abs(t&&t.pos?t.pos.x:0),this.runSmokeEff.y=t&&t.pos?t.pos.y:0';
if (!content.includes(s2_old)) throw new Error('s2_old not found');
content = content.replace(s2_old, s2_new);

// 3. Popup Er.Open reward for release
const s3_old = 'a.sendRelease=function(t,c){var e=this;this.Rpc(3315,{uid:t},function(r){if(r&&r.result===0){e.deletePet(t),A.ins().dispatch(E.PET_DATA_UPDATE),A.ins().dispatch(E.ATTR_CHANGE,6);var s="Phóng sinh thành công! Nhận "+Number(r.silver||0).toLocaleString()+" Bạc";r.refundFruit>0&&(s+=", hoàn trả "+Number(r.refundFruit||0).toLocaleString()+" Quả Linh"),S.ins().showTips(s),c&&c(r)}else S.ins().showTips(r&&r.msg||"Phóng sinh thất bại")})},';
const s3_new = 'a.sendRelease=function(t,c){var e=this;this.Rpc(3315,{uid:t},function(r){if(r&&r.result===0){e.deletePet(t),A.ins().dispatch(E.PET_DATA_UPDATE),A.ins().dispatch(E.ATTR_CHANGE,6);var rw=[{id:2,count:r.silver||0}];r.refundFruit>0&&rw.push({id:36,count:r.refundFruit});typeof Er!=="undefined"&&Er.Open&&Er.Open({items:rw});c&&c(r)}else S.ins().showTips(r&&r.msg||"Phóng sinh thất bại")})},';
if (!content.includes(s3_old)) throw new Error('s3_old not found');
content = content.replace(s3_old, s3_new);

fs.writeFileSync(bundlePath, content, 'utf8');
console.log('PATCH_V4_SUCCESS');
