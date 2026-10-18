'use strict';

const fs = require('fs');
const path = require('path');

const [configReport, runtimeReport, outMd] = process.argv.slice(2);
if (!configReport || !runtimeReport || !outMd) {
  console.error('usage: node summarize_recharge_audit.js config.json runtime.json output.md');
  process.exit(2);
}

const cfg = JSON.parse(fs.readFileSync(configReport, 'utf8'));
const runtimeWrapper = JSON.parse(fs.readFileSync(runtimeReport, 'utf8'));
const runtime = runtimeWrapper.mongo || {};
const s1 = (runtime.databases || []).find((x) => x.db === 'lhs_s1001') || {};
const state = s1.packageState || {};
const packs = (cfg.server && cfg.server.packages) || [];
const byId = new Map(packs.map((x) => [Number(x.payId), x]));

const ignoredFirst = packs.filter((x) => x.rewardCounts && x.rewardCounts.first > 0).map((x) => Number(x.payId));
const ignoredSub = packs.filter((x) => x.rewardCounts && x.rewardCounts.subsequent > 0).map((x) => Number(x.payId));
const ignoredExtra = packs.filter((x) => x.rewardCounts && x.rewardCounts.extra > 0).map((x) => Number(x.payId));
const omittedIds = Array.from(new Set([...ignoredFirst, ...ignoredSub, ...ignoredExtra])).sort((a, b) => a - b);
const firstChargeIds = packs.filter((x) => Number(x.selectedShopType) === 14).map((x) => Number(x.payId)).sort((a,b)=>a-b);
const firstChargeWithDeclaredFirst = firstChargeIds.filter((id) => (byId.get(id).rewardCounts.first || 0) > 0);
const firstChargeEmpty = firstChargeIds.filter((id) => {
  const p = byId.get(id);
  return !p.hasAnyReward;
});

function ranges(ids) {
  const sorted = Array.from(new Set(ids)).sort((a,b)=>a-b);
  if (!sorted.length) return '—';
  const out=[]; let start=sorted[0], prev=sorted[0];
  for (let i=1;i<=sorted.length;i++) {
    const x=sorted[i];
    if (x === prev+1) { prev=x; continue; }
    out.push(start===prev?String(start):`${start}–${prev}`);
    start=x; prev=x;
  }
  return out.join(', ');
}

function rewardList(rows) {
  return (rows || []).map((x) => `${x.id}×${x.count}`).join(', ') || '—';
}

function pkgRow(id) {
  const x=byId.get(id);
  return `| ${id} | ${x ? x.priceR : ''} | ${x ? rewardList(x.rewards) : '—'} | ${x ? rewardList(x.extraRewards) : '—'} | ${x ? rewardList(x.firstRewards) : '—'} | ${x ? rewardList(x.subsequentRewards) : '—'} |`;
}

const a9 = state.activity9Targets || {};
const month = state.monthCardTargets || {};
const recordDetails = state.recordDetails || {};
const exposedOmitted = omittedIds.map((id) => ({id, ...(recordDetails[String(id)] || {players:0,countSum:0,maxCount:0,duplicatePlayers:0})}));
const exposedOmittedNonzero = exposedOmitted.filter((x) => Number(x.players) > 0);
const lines=[];
lines.push('# Báo cáo kiểm kê toàn bộ gói nạp/tệ production');
lines.push('');
lines.push(`- Thời điểm chụp dữ liệu: ${runtimeWrapper.generatedAt || runtime.generatedAt || ''}`);
lines.push('- Phạm vi: production `103.116.105.154`, chỉ đọc; không mua thử, không sửa DB/source/config và không restart.');
lines.push(`- Server/client config: **${cfg.server.meta.tableCount}/${cfg.client.meta.tableCount} bảng**, PayConfig **${cfg.server.counts.payConfig}** mã, ShopConfig **${cfg.server.counts.shopConfig}** dòng.`);
lines.push(`- Đối chiếu gói server/client: **${cfg.comparison.packageDiffCount} mã lệch**. Có ${cfg.comparison.tableDiffCount} bảng binary khác nhưng không thuộc PayConfig/ShopConfig/Activity9/Privilege.`);
lines.push('');
lines.push('## Kết luận ưu tiên');
lines.push('');
lines.push('1. **P0 – callback tiền thật đang không có catalog phát quà hoạt động.** Mongo `rechargeproductconfigs=0`; `PayConfig` không có trường `diamond/attachments`, nên `RechargeConfigService` dựng mọi gói built-in với `diamond=0`, `attachments=[]`. Callback nội bộ nếu được dùng sẽ ghi nạp/kích hoạt nhưng không cấp quà theo ShopConfig. Hiện `transactions=0`, WebGM `recharge_orders=0` và XTPay chưa cấu hình, nên chưa có order/player lịch sử nào xác nhận bị mất quà qua callback này.');
lines.push(`2. **P0 – đường mua bằng tệ/token tag 1230 bỏ quà khai báo.** Handler chỉ dùng \`ShopConfig.rewards\`; bỏ qua \`extraRewards\`, \`firstRewards\`, \`subsequentRewards\`. Có **${omittedIds.length} mã** có ít nhất một trường bị bỏ, gồm: ${ranges(omittedIds)}.`);
lines.push(`3. **P0 – nhóm nạp lần đầu type 14 sai contract.** Có **${firstChargeIds.length} mã**; ${firstChargeWithDeclaredFirst.length} mã có quà \`firstRewards\` nhưng server trả fallback cố định ID 1×60, ${firstChargeEmpty.length} mã hoàn toàn không có reward list cũng vẫn trả ID 1×60. Các mã có quà lần đầu khai báo: ${ranges(firstChargeWithDeclaredFirst)}.`);
lines.push('4. **P0 – nhận quà ngày thẻ tháng chưa đúng client/config.** Server cấp cố định ID 1×50 cho mọi thẻ, không kiểm thẻ còn hiệu lực và không đọc `ShopConfig.rewards/extraRewards`; client đang hiển thị các quà riêng cho từng loại thẻ.');
lines.push('5. **Tiên duyên 10501 hiện đã đồng nhất với record production.** 2 player đã mua đều có Activity 9001 và `recordList[10501]`; không còn mismatch. 10502 chưa có người mua.');
lines.push('');
lines.push('## Mã có trường quà đang bị server bỏ');
lines.push('');
lines.push(`- Có \`extraRewards\`: ${ignoredExtra.length} mã — ${ranges(ignoredExtra)}.`);
lines.push(`- Có \`firstRewards\`: ${ignoredFirst.length} mã — ${ranges(ignoredFirst)}.`);
lines.push(`- Có \`subsequentRewards\`: ${ignoredSub.length} mã — ${ranges(ignoredSub)}.`);
lines.push('');
lines.push('| Pay ID | Giá R | rewards hiện được đọc | extra bị bỏ | first bị bỏ | subsequent bị bỏ |');
lines.push('|---:|---:|---|---|---|---|');
for (const id of omittedIds) lines.push(pkgRow(id));
lines.push('');
lines.push('## Thẻ tháng/đặc quyền');
lines.push('');
lines.push('| ID | Player có record mua | Player đã kích hoạt thời hạn | Có record nhận ngày | Lệch |');
lines.push('|---:|---:|---:|---:|---|');
for (const id of [11000001,11000002,11000007,11000008,11000009,11000012]) {
  const x=month[String(id)] || {};
  const mismatch=[];
  if (x.recordNoActive) mismatch.push(`${x.recordNoActive} mua nhưng chưa active`);
  if (x.activeNoRecord) mismatch.push(`${x.activeNoRecord} active không có record mua`);
  if (x.activeNoClaimRecord) mismatch.push(`${x.activeNoClaimRecord} chưa từng nhận ngày`);
  lines.push(`| ${id} | ${x.recordPlayers||0} | ${x.activePlayers||0} | ${x.claimRecordPlayers||0} | ${mismatch.join('; ')||'Không lệch kích hoạt'} |`);
}
lines.push('');
lines.push('- Có 79 record thẻ trên 38 player (một player có thể sở hữu nhiều loại); 0 record mua mà thiếu thời hạn kích hoạt.');
lines.push('- Riêng `11000002`: 36 player active, 35 player có `monthCardRecords`; 1 player chưa từng nhận quà ngày. Đây có thể là trạng thái hợp lệ chưa claim, không phải lỗi kích hoạt.');
lines.push('- `11000008` có trong `PrivilegeConfig`/ShopConfig nhưng client `MonthIdList` và server `KNOWN_MONTH_CARD_IDS` không bao gồm; DB cũng chưa có người mua. Cần xác định đây là gói legacy hay gói phải hỗ trợ trước khi mở bán.');
lines.push('');
lines.push('### Dấu vết mua trong 20 mã lỗi contract');
lines.push('');
lines.push('| Pay ID | Player có record | Tổng lượt mua ghi nhận | Mua tối đa/player |');
lines.push('|---:|---:|---:|---:|');
for (const x of exposedOmittedNonzero) lines.push(`| ${x.id} | ${x.players} | ${x.countSum} | ${x.maxCount} |`);
lines.push('');
lines.push('- Chỉ 5/20 mã lỗi contract đang có dấu vết mua trong DB; đó là 5 thẻ đặc quyền ở bảng trên. Tổng cộng 90 lượt trên 38 player duy nhất (người chơi có thể mua nhiều loại và mua lặp).');
lines.push('- 15 mã còn lại, gồm toàn bộ nhóm type 14 và `11000008`, `11026000`, có 0 record mua trong snapshot hiện tại.');
lines.push('- 38 player là **phạm vi cần kiểm tra/bù tiềm năng**, chưa thể khẳng định mỗi người thiếu chính xác món nào vì server không lưu reward snapshot và không có order ledger; lịch sử có thể đã chạy phiên bản handler khác.');
lines.push('');
lines.push('## Tiên duyên');
lines.push('');
lines.push('| Pay ID | Player có record | Player active | Mua nhưng chưa active | Active không có mua |');
lines.push('|---:|---:|---:|---:|---:|');
for (const id of ['10501','10502']) {
  const x=a9[id]||{};
  lines.push(`| ${id} | ${x.recordPlayers||0} | ${x.activatedPlayers||0} | ${x.recordNoActivityPlayers||0} | ${x.activityNoRecordPlayers||0} |`);
}
lines.push('');
lines.push('## Ledger, mail và phạm vi người chơi bị ảnh hưởng');
lines.push('');
lines.push('- Mongo `lhs_s1001`: 795 player; 151 player có `rechargeInfo.records`; không record malformed hoặc trùng ID trong cùng player.');
lines.push('- Mongo game: `transactions=0`, `rechargeproductconfigs=0`; Mongo dist: `transactions=0`, `rechargeorders=0`.');
lines.push('- MySQL WebGM: `recharge_orders=0`; SePay có 20 dòng nhưng toàn bộ là `topup_xu`, không có product/pay ID game để nối về từng gói.');
lines.push('- Mail game: 519 tổng; 26 mail giống recharge đều là `webgm_recharge`, 26/26 có attachment và đã claim; không có mail phát gói nạp riêng.');
lines.push(`- Log có 1.635 request tag 1230, nhưng log hiện không lưu ID gói, kết quả và delta quà. Vì vậy **không thể xác định danh sách player/order bị thiếu quà cho ${omittedIds.length} mã từ log hiện có**. Có bằng chứng contract code chắc chắn, nhưng không có ledger lịch sử đủ an toàn để tự bù.`);
lines.push('');
lines.push('## Phương án sửa đề xuất');
lines.push('');
lines.push('1. Tạo một `RechargeRewardResolver` server-authoritative dùng chung cho token và cash callback: chọn đúng ShopConfig row theo payId/privilege; quyết định `firstRewards` hoặc `subsequentRewards`; cộng `rewards` + `extraRewards`; không dùng fallback ID 1×60.');
lines.push('2. Với callback tiền thật, hoặc seed `RechargeProductConfig` đủ 694 mã từ catalog đã kiểm duyệt, hoặc bỏ dependency `diamond/attachments` custom và dùng resolver trên. Mỗi callback phải ghi transaction có productId, reward snapshot và activation snapshot.');
lines.push('3. Thẻ tháng: handler 1211 phải xác minh ID hợp lệ + thời hạn còn active + chưa nhận trong ngày; lấy quà ngày đúng contract đã xác định, không cấp cố định ID 1×50.');
lines.push('4. Giữ Tiên duyên theo helper hiện có; thêm regression cho 10501/10502, không trộn fallback generic.');
lines.push('5. Trước deploy: fixture toàn bộ 694 PayConfig, test đại diện từng ShopConfig.type, first/subsequent, 6 thẻ privilege, retry/relog/restart. Chỉ bù khi có order/provider ledger có productId và reward snapshot; không suy từ `rechargeInfo.records` chung.');
lines.push('');
lines.push('## Artifact bằng chứng');
lines.push('');
lines.push(`- Config report: \`${path.resolve(configReport)}\``);
lines.push(`- Runtime aggregate: \`${path.resolve(runtimeReport)}\``);
lines.push('- Source production snapshot đã đối chiếu: `handlers/recharge.js`, `handlers/compat.js`, `handlers/commerce-compat.js`, `services/RechargeConfigService.js`, `services/RechargeBenefitService.js`.');

fs.mkdirSync(path.dirname(path.resolve(outMd)), {recursive:true});
fs.writeFileSync(path.resolve(outMd), lines.join('\n')+'\n', 'utf8');
console.log(JSON.stringify({output:path.resolve(outMd), omittedIds, firstChargeIds:firstChargeIds.length, activity9:a9, monthCards:month}, null, 2));
