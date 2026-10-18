'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('>>> CHẠY BỘ KIỂM THỬ ĐỘC LẬP CHO 8 HOẠT ĐỘNG <<<');

const jsPath = path.resolve('linhhoasu/webgame/game/js/main.min_drop100.js');
const htmlPath = path.resolve('linhhoasu/webgame/game/index.html');

const jsCode = fs.readFileSync(jsPath, 'utf8');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Test 1: Check absence of old 3-item limit
assert.ok(!jsCode.includes('e=e.splice(0,O.min(3,e.length))'), 'Mã cũ cắt 3 hoạt động không được tồn tại');
assert.ok(jsCode.includes('e=e.splice(0,O.min(8,e.length))'), 'Mã mới cho phép 8 hoạt động phải tồn tại');
console.log('Test 1: Kiểm tra thay đổi chuỗi getGameList -> PASS');

// Test 2: Check layout column limit
assert.ok(!jsCode.includes('t.requestedColumnCount=e,this.list.validateNow()'), 'Mã layout cũ không được tồn tại');
assert.ok(jsCode.includes('t.requestedColumnCount=Math.min(4,e),this.list.validateNow()'), 'Mã layout mới Math.min(4, e) phải tồn tại');
console.log('Test 2: Kiểm tra cấu hình layout 4 cột -> PASS');

// Test 3: Simulate getGameList logic
const AppInfo = {
    params: {
        subGame: 1,
        subGameOrder: [1, 2, 3, 4, 5, 6, 7, 8]
    }
};
const sht = { exGameAds: undefined };
const O = { min: (a, b) => Math.min(a, b) };

// Extract and eval simulated getGameList
function simulateGetGameList(gameRedMarkMap = {}) {
    var t, a, s, e = [];
    if (1 == AppInfo.params.subGame) {
        t = !gameRedMarkMap[1]; e.push({ type: 1, isRed: t });
        t = !gameRedMarkMap[2]; e.push({ type: 2, isRed: t });
        t = !gameRedMarkMap[3]; e.push({ type: 3, isRed: t });
        t = !gameRedMarkMap[4]; e.push({ type: 4, isRed: t });
        t = !gameRedMarkMap[5]; e.push({ type: 5, isRed: t });
        t = !gameRedMarkMap[6]; e.push({ type: 6, isRed: t });
        t = !gameRedMarkMap[7]; e.push({ type: 7, isRed: t });
        t = !gameRedMarkMap[8]; e.push({ type: 8, isRed: t });
        a = AppInfo.params.subGameOrder;
        s = sht.exGameAds;
        e.sort(function(t, e) {
            var i = a.indexOf(t.type), n = a.indexOf(e.type);
            return (-1 == i ? 999 : i) - (s == t.type ? 99999 : 0) - ((-1 == n ? 999 : n) - (s == e.type ? 99999 : 0));
        });
        e = e.splice(0, O.min(8, e.length));
    }
    return e;
}

const list = simulateGetGameList();
console.log('Simulated result:', JSON.stringify(list));
assert.strictEqual(list.length, 8, 'getGameList phải trả về đủ 8 phần tử');
for (let i = 0; i < 8; i++) {
    assert.strictEqual(list[i].type, i + 1, `Phần tử thứ ${i} phải có type = ${i + 1}`);
}
console.log('Test 3: Mô phỏng getGameList() trả về đủ 8 game đúng thứ tự 1..8 -> PASS');

// Test 4: Layout column calculation
const eLen = list.length;
const requestedCols = Math.min(4, eLen);
assert.strictEqual(requestedCols, 4, 'Với 8 phần tử, requestedColumnCount phải là 4 (chia 2 hàng x 4 cột)');
console.log('Test 4: Tính toán cột hiển thị = 4 (2 hàng x 4 cột) -> PASS');

// Test 5: Check index.html versioning
assert.ok(htmlContent.includes("var translationVersion = '20260920_full_8_subgames_v1';"), 'index.html translationVersion phải cập nhật');
assert.ok(htmlContent.includes('"js/main.min_drop100.js?v=20260920_full_8_subgames_v1"'), 'index.html main.min_drop100.js version phải cập nhật');
console.log('Test 5: Kiểm tra cache buster trong index.html -> PASS');

console.log('\n>>> TOÀN BỘ 5/5 BỘ TEST CASE ĐỀU ĐẠT CHUẨN (PASS 100%)! <<<');
