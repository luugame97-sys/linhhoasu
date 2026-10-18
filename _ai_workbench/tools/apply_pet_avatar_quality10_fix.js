const fs = require('fs');
const path = require('path');

const jsPath = 'linhhoasu/webgame/game/js/main.min_drop100.js';
let code = fs.readFileSync(jsPath, 'utf8');

// 1. Patch pDt.getOutHead
const targetHead = 'pDt.getOutHead=function(t){return"head_"+t}';
const replaceHead = 'pDt.getOutHead=function(t){var e="head_"+t;if(window.RES&&RES.hasRes&&RES.hasRes(e))return e;var i="icon_"+t;if(window.RES&&RES.hasRes&&RES.hasRes(i))return i;var n=window.Y&&Y.Config&&Y.Config.AssetsConfig&&Y.Config.AssetsConfig[t];return n&&n.icon&&window.RES&&RES.hasRes&&RES.hasRes(n.icon)?n.icon:e}';

if (!code.includes(targetHead)) {
  throw new Error('TARGET_HEAD_NOT_FOUND');
}
code = code.replace(targetHead, replaceHead);
console.log('Patched pDt.getOutHead successfully');

// 2. Patch PetHandbookTabBarItem dataChanged
const targetTab = '_.dataChanged=function(){null!=this.data&&(this.iconImage.source="common_bm_quality_"+this.data,this.showRedPoint())}';
const replaceTab = '_.dataChanged=function(){null!=this.data&&(this.iconImage.source=(this.data==10&&(!window.RES||!RES.hasRes||!RES.hasRes("common_bm_quality_10"))?"assets/atlas_ui/0_common/bm/lang_cn/common_bm_quality_10_264c3006.png":"common_bm_quality_"+this.data),this.showRedPoint())}';

if (!code.includes(targetTab)) {
  throw new Error('TARGET_TAB_NOT_FOUND');
}
code = code.replace(targetTab, replaceTab);
console.log('Patched PetHandbookTabBarItem dataChanged successfully');

fs.writeFileSync(jsPath, code, 'utf8');
console.log('Saved main.min_drop100.js successfully');
