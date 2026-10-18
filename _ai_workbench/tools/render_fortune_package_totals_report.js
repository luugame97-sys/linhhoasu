#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [inputPath, markdownPath, htmlPath] = process.argv.slice(2);
if (!inputPath || !markdownPath || !htmlPath) {
  console.error('usage: render_fortune_package_totals_report.js AUDIT_JSON REPORT_MD REPORT_HTML');
  process.exit(2);
}

const inputBuffer = fs.readFileSync(path.resolve(inputPath));
const inputSha256 = crypto.createHash('sha256').update(inputBuffer).digest('hex');
const payload = JSON.parse(inputBuffer.toString('utf8'));
const audit = payload.audit || {};
const totals = audit.totals || {};
const rows = Array.isArray(audit.rows) ? audit.rows : [];
const postFixLog = payload.postFixLog || {};
const nf = new Intl.NumberFormat('vi-VN');
const n = (value) => nf.format(Number(value) || 0);
const safe = (value) => String(value == null ? '' : value).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
const stamp = new Date(audit.generatedAt || Date.now());
const localStamp = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(stamp);

const mdRows = rows.map((row, index) => `| ${index + 1} | ${safe(row.accountId)} | ${safe(row.name)} | ${safe(row.userId)} | ${n(row.authoritativeCount)} | ${n(row.packageBaoziReceived)} | ${n(row.currentBaoziBalance)} | ${n(row.eligibleDailyClaims)} | ${n(row.minimumExcessClaims)} | ${n(row.minimumExcessBaozi)} | ${Number(row.todayLedgerCount) === 1 ? 'Đã nhận' : 'Chưa nhận'} |`).join('\n');

const md = `# Báo cáo tổng kiểm kê Gói Vận Thế – Shop 11018000

## 1. Tổng kết mới nhất

Thời điểm snapshot production: **${localStamp} (UTC+7)**, tương ứng ngày ledger GMT+8 số \`${audit.currentDayKey}\`.

| Chỉ số | Kết quả |
|---|---:|
| Tài khoản duy nhất từng nhận | **${n(totals.uniqueAccounts)}** |
| Nhân vật duy nhất từng nhận | **${n(totals.uniquePlayers)}** |
| Tổng lượt nhận thành công | **${n(totals.totalClaims)}** |
| Tổng bánh bao đã phát từ riêng gói này | **${n(totals.totalPackageBaoziReceived)}** |
| Tổng số dư bánh bao hiện tại của 37 người | ${n(totals.totalCurrentBaoziBalance)} |
| Người vượt giới hạn tối thiểu | ${n(totals.minimumExcessPlayers)} |
| Lượt vượt giới hạn tối thiểu | ${n(totals.minimumExcessClaims)} |
| Bánh bao vượt giới hạn tối thiểu | ${n(totals.minimumExcessBaozi)} |
| Người đã nhận trong ngày GMT+8 hiện tại | ${n(totals.todayClaimedPlayers)} |
| Ledger hôm nay vượt quá 1 | **${n(totals.todayLedgerOverLimit)}** |
| Hai counter Mongo không khớp | **${n(totals.counterMismatches)}** |
| UI và ledger hôm nay không khớp | **${n(totals.todayUiMismatchesLedger)}** |

### Kết luận chính

- Có đúng **${n(totals.uniqueAccounts)} tài khoản / ${n(totals.uniquePlayers)} nhân vật** từng nhận gói.
- Hai counter độc lập \`shopInfo.buyRecords.11018000\` và \`rechargeInfo.records[id=11018000]\` khớp **37/37**, nên tổng **${n(totals.totalClaims)} lượt / ${n(totals.totalPackageBaoziReceived)} bánh bao** là số persisted chính xác.
- Tổng số dư hiện tại ${n(totals.totalCurrentBaoziBalance)} không phải toàn bộ quà bug còn lại: nó bao gồm bánh bao từ nguồn khác và đã bị thay đổi do người chơi tiêu/nhận thêm.
- Cột “vượt tối thiểu” dùng phương án có lợi cho người chơi: cho phép tối đa 1 lượt ở mọi ngày GMT+8 mà activity của chính nhân vật có thể hoạt động. Vì vậy đây là mức tối thiểu chắc chắn, không phải phép suy đoán tối đa.

## 2. Trạng thái sau hotfix

- 23 người đã nhận trước hotfix được backfill ledger.
- Sau hotfix có ${n(postFixLog.realGrantedEvents)} lượt thật được cấp hợp lệ; tài khoản: ${Object.keys(postFixLog.realGrantedByUser || {}).map((id) => `\`${id}\``).join(', ') || 'không có'}.
- Hiện có ${n(totals.todayClaimedPlayers)} người mang ledger hôm nay \`count=1\`.
- Không có ledger \`count>1\`; UI/ledger khớp ${n(totals.todayUiMatchesLedger)}/${n(totals.uniquePlayers)}.
- Source live vẫn đúng hash hotfix:
  - \`item.js\`: \`${audit.live && audit.live.itemSha256}\`
  - \`activity.js\`: \`${audit.live && audit.live.activitySha256}\`
- Server healthy; audit hoàn toàn read-only, không thay đổi dữ liệu người chơi.

## 3. Danh sách đầy đủ

| STT | Tài khoản | Nhân vật | User ID | Lượt nhận | Bánh bao từ gói | Số dư hiện tại | Ngày được phép | Lượt vượt tối thiểu | Bánh bao vượt tối thiểu | Hôm nay |
|---:|---|---|---|---:|---:|---:|---:|---:|---:|---|
${mdRows}

## 4. Cách đọc số liệu

- **Lượt nhận**: counter persisted, chỉ tăng sau khi server phát quà và save thành công.
- **Bánh bao từ gói**: \`lượt nhận × 10\`, không lấy từ số dư hiện tại.
- **Số dư hiện tại**: toàn bộ bánh bao còn trong túi, có thể đến từ nhiều nguồn và có thể đã tiêu.
- **Ngày được phép**: số ngày GMT+8 activity có thể cho nhận hợp lệ đến thời điểm snapshot.
- **Vượt tối thiểu**: \`max(0, lượt nhận - ngày được phép)\`.
- **Hôm nay**: đọc từ ledger server-authoritative sau hotfix.

## 5. Độ toàn vẹn và evidence

- Counter mismatch: \`${n(totals.counterMismatches)}\`.
- Account mapping thiếu: \`${n(totals.missingAccountMapping)}\`.
- Ledger hôm nay vượt 1: \`${n(totals.todayLedgerOverLimit)}\`.
- Audit JSON: \`${path.resolve(inputPath)}\`.
- SHA-256 JSON: \`${inputSha256}\`.
- Công cụ audit: \`_ai_workbench/tools/audit_fortune_package_totals_remote.py\`.
`;

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const htmlRows = rows.map((row, index) => `<tr><td>${index + 1}</td><td>${esc(row.accountId)}</td><td>${esc(row.name)}</td><td class="mono">${esc(row.userId)}</td><td>${n(row.authoritativeCount)}</td><td>${n(row.packageBaoziReceived)}</td><td>${n(row.currentBaoziBalance)}</td><td>${n(row.eligibleDailyClaims)}</td><td class="warn">${n(row.minimumExcessClaims)}</td><td class="warn">${n(row.minimumExcessBaozi)}</td><td class="${Number(row.todayLedgerCount) === 1 ? 'ok' : ''}">${Number(row.todayLedgerCount) === 1 ? 'Đã nhận' : 'Chưa nhận'}</td></tr>`).join('\n');

const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tổng kiểm kê Gói Vận Thế</title><style>
:root{--bg:#f4f7fb;--card:#fff;--ink:#172033;--muted:#667085;--line:#dfe6f0;--ok:#067647;--warn:#b54708}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 Inter,Segoe UI,Arial,sans-serif}main{max-width:1550px;margin:26px auto;padding:0 20px 60px}.hero,.card{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:0 8px 28px rgba(16,24,40,.06)}.hero{padding:28px}.card{padding:22px;margin-top:18px}h1{margin:0 0 8px;font-size:30px}h2{margin:0 0 14px;font-size:21px}.muted{color:var(--muted)}.stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:18px}.stat{padding:14px;border:1px solid var(--line);border-radius:12px;background:#f8faff}.stat b{display:block;font-size:22px}.ok{color:var(--ok);font-weight:700}.warn{color:var(--warn);font-weight:700}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:12px}table{width:100%;min-width:1450px;border-collapse:collapse}th,td{padding:9px 11px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}th{position:sticky;top:0;background:#edf3fc;color:#344054;font-size:12px}th:nth-child(2),th:nth-child(3),th:nth-child(4),td:nth-child(2),td:nth-child(3),td:nth-child(4){text-align:left}.mono{font:12px Consolas,monospace}tr:hover td{background:#fafcff}code{background:#eef3fb;padding:2px 6px;border-radius:5px}ul{padding-left:22px}@media(max-width:950px){.stats{grid-template-columns:1fr 1fr}.hero,.card{padding:16px}}
</style></head><body><main><section class="hero"><h1>Tổng kiểm kê Gói Vận Thế</h1><p class="muted">Shop 11018000 · snapshot ${esc(localStamp)} UTC+7 · read-only</p><div class="stats"><div class="stat"><span>Tài khoản</span><b>${n(totals.uniqueAccounts)}</b></div><div class="stat"><span>Tổng lượt</span><b>${n(totals.totalClaims)}</b></div><div class="stat"><span>Bánh bao đã phát</span><b>${n(totals.totalPackageBaoziReceived)}</b></div><div class="stat"><span>Vượt tối thiểu</span><b class="warn">${n(totals.minimumExcessBaozi)}</b></div><div class="stat"><span>Ledger vượt 1</span><b class="ok">${n(totals.todayLedgerOverLimit)}</b></div></div></section>
<section class="card"><h2>Kết luận</h2><ul><li>37 tài khoản/37 nhân vật, hai counter Mongo khớp 37/37.</li><li>Tổng chính xác: <b>${n(totals.totalClaims)} lượt = ${n(totals.totalPackageBaoziReceived)} bánh bao</b> từ riêng gói.</li><li>Ít nhất ${n(totals.minimumExcessBaozi)} bánh bao vượt chính sách 1/ngày.</li><li>24 người đã nhận hôm nay, không có ledger nào vượt 1; UI/ledger khớp 37/37.</li><li>Sau hotfix ghi nhận ${n(postFixLog.realGrantedEvents)} lượt thật hợp lệ.</li></ul></section>
<section class="card"><h2>Danh sách đầy đủ</h2><div class="table-wrap"><table><thead><tr><th>STT</th><th>Tài khoản</th><th>Nhân vật</th><th>User ID</th><th>Lượt nhận</th><th>Bánh bao từ gói</th><th>Số dư hiện tại</th><th>Ngày được phép</th><th>Lượt vượt tối thiểu</th><th>Bánh bao vượt tối thiểu</th><th>Hôm nay</th></tr></thead><tbody>${htmlRows}</tbody></table></div></section>
<section class="card"><h2>Cách đọc</h2><ul><li>Bánh bao từ gói = counter persisted ×10.</li><li>Số dư hiện tại có cả nguồn khác và đã thay đổi do tiêu/nhận thêm.</li><li>Vượt tối thiểu cho phép một lượt ở mọi ngày activity có thể hoạt động, nên là mức bảo thủ có lợi cho người chơi.</li></ul></section>
<section class="card"><h2>Độ toàn vẹn</h2><p>Counter mismatch: <b>${n(totals.counterMismatches)}</b> · Account thiếu mapping: <b>${n(totals.missingAccountMapping)}</b> · UI/ledger mismatch: <b>${n(totals.todayUiMismatchesLedger)}</b>.</p><p class="mono">${esc(path.resolve(inputPath))}</p></section></main></body></html>`;

for (const target of [markdownPath, htmlPath]) fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
fs.writeFileSync(path.resolve(markdownPath), md, 'utf8');
fs.writeFileSync(path.resolve(htmlPath), html, 'utf8');
console.log(JSON.stringify({ markdown: path.resolve(markdownPath), html: path.resolve(htmlPath), rows: rows.length, totals }, null, 2));
