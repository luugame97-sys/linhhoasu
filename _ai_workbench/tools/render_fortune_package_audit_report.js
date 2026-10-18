#!/usr/bin/env node
/* Render the read-only Fortune package audit as Markdown and HTML reports. */
'use strict';

const fs = require('fs');
const path = require('path');

const [auditPath, outputMd, outputHtml] = process.argv.slice(2);
if (!auditPath || !outputMd || !outputHtml) {
  console.error('usage: render_fortune_package_audit_report.js AUDIT_JSON OUTPUT_MD OUTPUT_HTML');
  process.exit(2);
}

const audit = JSON.parse(fs.readFileSync(path.resolve(auditPath), 'utf8'));
const rows = (audit.logAudit && Array.isArray(audit.logAudit.actors) ? audit.logAudit.actors : [])
  .filter((row) => row.player && Number(row.excessClaims) > 0)
  .sort((a, b) => Number(b.buyRecord) - Number(a.buyRecord));
const legitimateRows = (audit.logAudit && Array.isArray(audit.logAudit.actors) ? audit.logAudit.actors : [])
  .filter((row) => row.player && Number(row.excessClaims) <= 0);
const merged = audit.mergedTotals || {};
const logTotals = audit.logAudit && audit.logAudit.totals ? audit.logAudit.totals : {};
const dbTotals = audit.dbAudit && audit.dbAudit.totals ? audit.dbAudit.totals : {};
const handler = audit.dbAudit && audit.dbAudit.currentHandler ? audit.dbAudit.currentHandler : {};
const generated = new Date(audit.generatedAt || Date.now());

const nf = new Intl.NumberFormat('vi-VN');
const n = (value) => nf.format(Number(value) || 0);
const clean = (value) => String(value == null ? '' : value).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
const account = (row) => clean(row.player && row.player.account && row.player.account.accountId || '(không tìm thấy)');
const roleName = (row) => clean(row.player && row.player.name || '');

const tableHeader = '| STT | Tài khoản | Nhân vật | User ID | Lượt nhận | Bánh bao từ gói | Ngày đủ điều kiện | Lượt vượt xác nhận | Bánh bao vượt | Số dư hiện tại |\n'
  + '|---:|---|---|---|---:|---:|---:|---:|---:|---:|';
const tableRows = rows.map((row, index) => [
  index + 1,
  account(row),
  roleName(row),
  clean(row.userId),
  n(row.buyRecord),
  n(row.packageBaoziReceived),
  n(row.player.eligibleDailyClaims),
  n(row.excessClaims),
  n(row.excessBaozi),
  n(row.player.baozi),
].join(' | ')).map((line) => `| ${line} |`).join('\n');

const md = `# Kiểm kê lỗi Gói Vận Thế – Shop 11018000

## 1. Kết luận

- Đã xác minh lỗi thật trên production \`103.116.105.154\`.
- Gói miễn phí là Shop ID \`11018000\`, mỗi lượt phát \`Bánh bao ID 4 ×10\`.
- Có **${n(merged.confirmedExploitPlayers)} tài khoản/nhân vật nhận lặp vượt giới hạn ngày**.
- MongoDB ghi nhận **${n(merged.totalClaims)} lượt**, tương ứng **${n(merged.totalPackageBaoziReceived)} bánh bao đã phát từ gói**.
- Phần vượt giới hạn đã xác nhận bằng log + cửa sổ hoạt động là **${n(merged.totalExcessClaims)} lượt / ${n(merged.totalExcessBaozi)} bánh bao**.
- Có ${n(legitimateRows.length)} người chỉ nhận trong giới hạn; không nằm trong danh sách vi phạm bên dưới.
- Đây là kiểm tra read-only: chưa khóa tài khoản, chưa trừ vật phẩm, chưa sửa code hoặc restart dịch vụ.

Thời điểm chốt dữ liệu: ${generated.toISOString()}.

## 2. Nguyên nhân gốc

1. Client hiển thị đúng chính sách từ \`ActivityShopConfig\`: Shop \`11018000\` có \`limit=1\`, \`limitType=1\` (mỗi ngày một lượt).
2. \`ShopConfig[11018000]\` lại có \`limit=0\`, \`limitType=0\`.
3. Client gọi \`ActivityModel.sendBuyItem → ShopModel.sendBuyItem → RPC tag 1200\`.
4. Server đi qua \`handleLegacyShopBuy → handleMultiBuyItem\`, nhưng chỉ kiểm \`ShopConfig.limit\`. Vì giá trị tại đây là 0, server coi gói là không giới hạn.
5. Mỗi lần thành công server tăng cả \`shopInfo.buyRecords.11018000\` và \`rechargeInfo.records\`, sau đó phát thêm 10 bánh bao. Không có ledger theo ngày GMT+8.

Handler production: \`${handler.path || ''}\`  
SHA-256: \`${handler.sha256 || ''}\`

## 3. Phạm vi và độ tin cậy

- Hai bộ đếm Mongo của cả ${n(dbTotals.playersWithBuyRecord)} người đều khớp; \`counterMismatches=${n(dbTotals.counterMismatches)}\`.
- Log giữ lại ghi ${n(logTotals.requestClaims)} yêu cầu và ${n(logTotals.successClaims)} kết quả thành công. Chênh ${n((Number(logTotals.requestClaims) || 0) - (Number(logTotals.successClaims) || 0))} dòng ở ranh giới lúc đang quét; không dùng phần chênh đó để tự quy kết thưởng.
- Mongo ghi nhiều hơn log giữ lại ${n((Number(dbTotals.buyRecords) || 0) - (Number(logTotals.requestClaims) || 0))} lượt. Vì vậy tổng lượt và tổng quà dùng bộ đếm Mongo; log dùng để chứng minh hành vi bấm lặp theo ngày/giây.
- Một User ID có 3 request trong log nhưng không còn bộ đếm persisted trong Mongo; đã loại khỏi danh sách “đã nhận”.
- “Số dư hiện tại” là số bánh bao còn trong túi tại thời điểm audit, không phải toàn bộ quà bug còn nguyên; người chơi có thể đã tiêu một phần.

## 4. Danh sách nhận vượt giới hạn

${tableHeader}
${tableRows}

## 5. Hướng fix chuẩn

1. Không sửa riêng \`ShopConfig.limit=1\`: bộ đếm hiện tại là lifetime, làm vậy sẽ khóa vĩnh viễn sau lượt đầu tiên thay vì reset mỗi ngày.
2. Tạo policy server-authoritative cho Shop \`11018000\`, đọc chính sách \`ActivityShopConfig\` của activity type 43 đang active; tuyệt đối không tin activity ID hoặc limit do client gửi.
3. Lưu ledger bền vững theo khóa \`userId + activityId + shopId + GMT8-dayKey\`, giới hạn count bằng 1.
4. Bao toàn bộ kiểm tra → đánh dấu claim → phát 10 bánh bao → save bằng khóa theo user và cơ chế chống concurrent/replay. Hai request đồng thời chỉ một request được thành công.
5. Đồng bộ \`activityInfo.datas[43001].buyRecords[11018000]\` từ ledger hiện tại để client hiển thị hết lượt; reset khi đổi ngày GMT+8 và khi đăng nhập lại.
6. Request thứ hai trong ngày trả lỗi ổn định như \`DAILY_LIMIT_REACHED\`, không phát quà và không thay đổi bất kỳ counter nào.
7. Ghi audit log có cấu trúc: userId, activityId, shopId, dayKey, count trước/sau, result và msgUid.

## 6. Bộ test bắt buộc trước khi lên production

- Lượt đầu trong ngày nhận đúng 10 bánh bao.
- Lượt thứ hai bị chặn; không tăng vật phẩm/counter.
- Hai request đồng thời: đúng một thành công.
- Qua 00:00 GMT+8 nhận lại được một lần.
- F5, đăng nhập lại và restart \`lhs-s1001\` vẫn không bypass được.
- Activity hết hạn hoặc không active phải fail-closed.
- Gói trả phí \`11018001–11018006\` và các Shop khác không bị ảnh hưởng.
- Chỉ restart \`lhs-s1001\`; sau restart kiểm \`/ready\`, \`/health\`, Mongo/Redis và log lỗi.

## 7. Xử lý dữ liệu lịch sử

- Chưa tự động trừ ${n(merged.totalExcessBaozi)} bánh bao vì một phần có thể đã được tiêu và ảnh hưởng nhiệm vụ/tiến độ; trừ mù có thể làm âm hoặc xử sai người.
- Nên đóng lỗ hổng trước, giữ snapshot/bằng chứng, rồi chọn chính sách: chỉ thu hồi số dư còn lại, khóa tạm nhóm abuse lớn để review, hoặc xử lý theo ngưỡng. Mọi thao tác phải có backup và danh sách duyệt riêng.

## 8. Artifact bằng chứng

- Audit JSON: \`${path.resolve(auditPath)}\`
- Hash JSON: \`${audit.sha256 || '(xem output tool)'}\`
`;

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const htmlRows = rows.map((row, index) => `<tr>
<td>${index + 1}</td><td>${esc(account(row))}</td><td>${esc(roleName(row))}</td>
<td class="mono">${esc(row.userId)}</td><td>${n(row.buyRecord)}</td>
<td>${n(row.packageBaoziReceived)}</td><td>${n(row.player.eligibleDailyClaims)}</td>
<td class="danger">${n(row.excessClaims)}</td><td class="danger">${n(row.excessBaozi)}</td>
<td>${n(row.player.baozi)}</td></tr>`).join('\n');

const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kiểm kê lỗi Gói Vận Thế</title><style>
:root{color-scheme:light;--bg:#f4f7fb;--card:#fff;--ink:#172033;--muted:#5d6980;--line:#dfe6f0;--accent:#2463eb;--danger:#b42318;--ok:#067647}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 Inter,Segoe UI,Arial,sans-serif}
main{max-width:1500px;margin:28px auto;padding:0 24px 60px}.hero,.card{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:0 8px 30px rgba(23,32,51,.06)}
.hero{padding:28px}.card{padding:24px;margin-top:18px}h1{margin:0 0 8px;font-size:30px}h2{margin:0 0 16px;font-size:21px}p{margin:8px 0}.muted{color:var(--muted)}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:20px}.stat{padding:16px;border-radius:12px;background:#f7f9fd;border:1px solid var(--line)}.stat b{display:block;font-size:25px}.danger{color:var(--danger);font-weight:700}.ok{color:var(--ok)}
.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:12px}table{border-collapse:collapse;width:100%;min-width:1280px}th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}th{position:sticky;top:0;background:#eef3fb;color:#344054;font-size:13px}th:nth-child(2),th:nth-child(3),th:nth-child(4),td:nth-child(2),td:nth-child(3),td:nth-child(4){text-align:left}tr:hover td{background:#fafcff}.mono{font-family:Consolas,monospace;font-size:12px}
code{background:#eef3fb;padding:2px 6px;border-radius:5px}ol,ul{padding-left:22px}@media(max-width:900px){.stats{grid-template-columns:1fr 1fr}main{padding:0 12px}.hero,.card{padding:18px}}
</style></head><body><main>
<section class="hero"><h1>Kiểm kê lỗi Gói Vận Thế</h1><p class="muted">Production 103.116.105.154 · Shop 11018000 · chốt ${esc(generated.toISOString())}</p>
<div class="stats"><div class="stat"><span>Người nhận vượt</span><b class="danger">${n(merged.confirmedExploitPlayers)}</b></div>
<div class="stat"><span>Tổng lượt persisted</span><b>${n(merged.totalClaims)}</b></div>
<div class="stat"><span>Bánh bao đã phát</span><b>${n(merged.totalPackageBaoziReceived)}</b></div>
<div class="stat"><span>Bánh bao vượt xác nhận</span><b class="danger">${n(merged.totalExcessBaozi)}</b></div></div></section>
<section class="card"><h2>Kết luận và nguyên nhân</h2><p>Client dùng <code>ActivityShopConfig</code> với giới hạn 1/ngày, nhưng server tag 1200 chỉ đọc <code>ShopConfig.limit=0</code>, nên coi gói miễn phí là không giới hạn. Mỗi lượt persisted phát 10 bánh bao.</p>
<p>Hai bộ đếm Mongo khớp cho ${n(dbTotals.playersWithBuyRecord)} người. Đây là audit read-only; chưa sửa code, chưa trừ vật phẩm và chưa restart.</p></section>
<section class="card"><h2>Danh sách nhận vượt giới hạn</h2><div class="table-wrap"><table><thead><tr><th>STT</th><th>Tài khoản</th><th>Nhân vật</th><th>User ID</th><th>Lượt nhận</th><th>Bánh bao từ gói</th><th>Ngày đủ điều kiện</th><th>Lượt vượt</th><th>Bánh bao vượt</th><th>Số dư hiện tại</th></tr></thead><tbody>${htmlRows}</tbody></table></div>
<p class="muted">Số dư hiện tại không phải số quà bug còn nguyên; người chơi có thể đã tiêu một phần.</p></section>
<section class="card"><h2>Hướng fix chuẩn</h2><ol><li>Giữ chính sách phía server theo ActivityShopConfig; không chỉ đổi ShopConfig thành limit=1.</li><li>Lưu ledger <code>userId + activityId + shopId + GMT8-dayKey</code>.</li><li>Khóa theo user và chống replay/concurrent; đúng một request trong ngày thành công.</li><li>Đồng bộ buyRecords về client khi login và đổi ngày.</li><li>Test same-day, concurrent, qua ngày, relog/restart và expiry trước khi triển khai.</li></ol></section>
<section class="card"><h2>Lưu ý xử lý lịch sử</h2><p>Chưa tự động trừ <b>${n(merged.totalExcessBaozi)}</b> bánh bao. Cần đóng lỗ hổng trước, giữ snapshot rồi duyệt chính sách xử lý riêng vì vật phẩm có thể đã được tiêu.</p></section>
</main></body></html>`;

for (const output of [outputMd, outputHtml]) fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(path.resolve(outputMd), md, 'utf8');
fs.writeFileSync(path.resolve(outputHtml), html, 'utf8');
console.log(JSON.stringify({ markdown: path.resolve(outputMd), html: path.resolve(outputHtml), rows: rows.length }, null, 2));
