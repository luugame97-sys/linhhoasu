'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('>>> BẮT ĐẦU VÁ MỞ FULL 8 HOẠT ĐỘNG CLIENT <<<');

const jsPath = path.resolve('linhhoasu/webgame/game/js/main.min_drop100.js');
const htmlPath = path.resolve('linhhoasu/webgame/game/index.html');

// 1. Backup files
const backupDir = path.resolve('_ai_workbench/backups/subgames_8_local_pre_' + Date.now());
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(jsPath, path.join(backupDir, 'main.min_drop100.js.bak'));
fs.copyFileSync(htmlPath, path.join(backupDir, 'index.html.bak'));
console.log('  Đã tạo backup tại:', backupDir);

// 2. Patch main.min_drop100.js
let jsCode = fs.readFileSync(jsPath, 'utf8');

const target1 = 'e=e.splice(0,O.min(3,e.length))';
const replacement1 = 'e=e.splice(0,O.min(8,e.length))';
if (!jsCode.includes(target1)) {
    throw new Error('Target 1 không tìm thấy trong main.min_drop100.js: ' + target1);
}
jsCode = jsCode.replace(target1, replacement1);
console.log('  [PASS] Đã thay thế Target 1 (mở 8 hoạt động trong getGameList)');

const target2 = 't.requestedColumnCount=e,this.list.validateNow()';
const replacement2 = 't.requestedColumnCount=Math.min(4,e),this.list.validateNow()';
if (!jsCode.includes(target2)) {
    throw new Error('Target 2 không tìm thấy trong main.min_drop100.js: ' + target2);
}
jsCode = jsCode.replace(target2, replacement2);
console.log('  [PASS] Đã thay thế Target 2 (cấu hình layout 4 cột x 2 hàng)');

fs.writeFileSync(jsPath, jsCode, 'utf8');
console.log('  Đã ghi tệp:', jsPath);

// 3. Syntax check JS
execSync(`node --check "${jsPath}"`);
console.log('  [PASS] Cú pháp node --check main.min_drop100.js hợp lệ 100%');

// 4. Patch index.html
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

const oldVer = "var translationVersion = '20260920_arena_rewards_v4';";
const newVer = "var translationVersion = '20260920_full_8_subgames_v1';";
if (!htmlContent.includes(oldVer)) {
    throw new Error('oldVer không tìm thấy trong index.html: ' + oldVer);
}
htmlContent = htmlContent.replace(oldVer, newVer);

const oldJsParam = '"js/main.min_drop100.js?v=20260920_mine_smooth_v6",';
const newJsParam = '"js/main.min_drop100.js?v=20260920_full_8_subgames_v1",';
if (!htmlContent.includes(oldJsParam)) {
    throw new Error('oldJsParam không tìm thấy trong index.html: ' + oldJsParam);
}
htmlContent = htmlContent.replace(oldJsParam, newJsParam);

fs.writeFileSync(htmlPath, htmlContent, 'utf8');
console.log('  [PASS] Đã nâng translationVersion & main.min_drop100.js cache buster trong index.html');

console.log('>>> VÁ MÃ NGUỒN CỤC BỘ HOÀN TẤT THÀNH CÔNG! <<<');
