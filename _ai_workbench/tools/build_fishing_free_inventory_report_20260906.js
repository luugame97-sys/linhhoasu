'use strict';
// Generate a read-only accounting report from saved DB and per-process log evidence.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(process.argv[2]),wb=path.resolve(__dirname,'..');
assert.equal(path.dirname(root),path.join(wb,'temp'));
assert(path.basename(root).startsWith('fishing_free_claim_audit_'));
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const raw=read('inventory-raw.json'),verified=read('inventory-verify.json');
const nf=new Intl.NumberFormat('vi-VN'),n=value=>nf.format(value),md=value=>String(value).replace(/\|/g,'\\|').replace(/[\r\n]/g,' ');
const local=stamp=>new Date(Date.parse(stamp)+7*3600000).toISOString().replace('T',' ').slice(0,19);
const logLocal=stamp=>local(stamp.replace(' ','T')+'+08:00');
const firstDay=Math.floor((Date.parse('2026-09-06T19:00:00+07:00')+8*3600000)/86400000);
assert.equal(Math.floor((Date.parse(verified.time)+8*3600000)/86400000),firstDay,'AUDIT_CROSSED_GAME_DAY_REEVALUATE_ALLOWANCE');
const logs={},profiles=[],serverTotals=[];
for(const sid of ['1001','1002']){
  const log=logs[sid]=read('log-evidence-'+sid+'.json');
  const rows=verified.data[sid];
  let total=0;
  for(const p of rows){
    assert(!/^(qafull_|qafshop_|qa_room_)/.test(p.userId),'QA_MUST_BE_EXCLUDED');
    assert.equal(p.shopCount,p.rechargeCount,'COUNTER_MISMATCH_'+p.playerId);
    assert(Number.isSafeInteger(p.shopCount)&&p.shopCount>0,'INVALID_PURCHASE_COUNT');
    const evidence=log.perUser[p.userId]?.matched?log.perUser[p.userId]:log.otherUsers?.[p.userId];
    assert(evidence,'MISSING_LOG_'+p.playerId);
    assert.equal(evidence.requestedQuantity,p.shopCount,'LOG_DB_QUANTITY_MISMATCH_'+p.playerId);
    assert.equal(evidence.matched,p.shopCount,'LOG_DB_REQUEST_MISMATCH_'+p.playerId);
    const excess=Math.max(0,p.shopCount-1);
    profiles.push({serverId:Number(sid),server:'S'+(Number(sid)-1000),name:p.name,userId:p.userId,playerId:p.playerId,
      recordedClaims:p.shopCount,allowedClaims:1,excessClaims:excess,totalGrantedBaozi:p.shopCount*10,excessBaozi:excess*10,
      currentBagBaozi:p.baozi,firstRequestLocal:logLocal(evidence.first),lastRequestLocal:logLocal(evidence.last),
      logRequests:evidence.matched,logQuantity:evidence.requestedQuantity,shopAndRechargeCountsMatch:true,
      status:excess>0?'confirmed_over_allowance_not_intent_attribution':'within_allowance'});
    total+=p.shopCount;
  }
  assert.equal(log.responses.successQuantity,total,'LOG_SERVER_TOTAL_MISMATCH_'+sid);
  assert.equal(log.responses.successBaozi,total*10,'LOG_SERVER_REWARD_MISMATCH_'+sid);
  assert.equal(log.responses.rejectedLines,0);
  const flagged=profiles.filter(p=>p.serverId===Number(sid)&&p.excessClaims>0);
  serverTotals.push({server:'S'+(Number(sid)-1000),serverId:Number(sid),scannedReal:raw.servers[sid].realProfilesScanned,claimingProfiles:rows.length,
    flaggedProfiles:flagged.length,recordedClaims:total,totalBaozi:total*10,allowedBaozi:rows.length*10,
    excessClaims:flagged.reduce((s,p)=>s+p.excessClaims,0),excessBaozi:flagged.reduce((s,p)=>s+p.excessBaozi,0)});
}
profiles.sort((a,b)=>b.excessBaozi-a.excessBaozi||a.serverId-b.serverId||a.name.localeCompare(b.name));
const flagged=profiles.filter(p=>p.excessClaims>0),legitimate=profiles.filter(p=>p.excessClaims===0);
const totals={scannedReal:serverTotals.reduce((s,r)=>s+r.scannedReal,0),claimingProfiles:profiles.length,flaggedProfiles:flagged.length,
 recordedClaims:profiles.reduce((s,p)=>s+p.recordedClaims,0),totalBaozi:profiles.reduce((s,p)=>s+p.totalGrantedBaozi,0),
 allowedBaozi:profiles.length*10,excessClaims:flagged.reduce((s,p)=>s+p.excessClaims,0),excessBaozi:flagged.reduce((s,p)=>s+p.excessBaozi,0)};
assert.equal(totals.totalBaozi-totals.allowedBaozi,totals.excessBaozi);
const evidenceFiles=['inventory-raw.json','inventory-verify.json','log-evidence.json','log-evidence-1001.json','log-evidence-1002.json'];
const manifest=evidenceFiles.map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')}));
const data={result:'VERIFIED_ACCOUNTING',scope:{packageId:11001400,rewardItem:4,rewardPerClaim:10,gameDay:'2026-09-06 GMT+8',dbSnapshot:raw.readAt,verifiedAt:verified.time},totals,serverTotals,profiles,
 limits:['Counts confirm over-allowance receipt, not intentional exploit or account ownership.',
 'Current bag combines many sources and spending, and is not the remaining portion of this excess.',
 'Result log has no userId; verification uses per-user requests + two persisted counters + full server success totals, not adjacency pairing.',
 'No per-item spend provenance or Mongo oplog; cannot trace where excess was spent.'],
 evidence:manifest,productionWrites:0,compensation:false,rollback:false,confiscation:false,accountBan:false};
fs.writeFileSync(path.join(root,'inventory-final.json'),JSON.stringify(data,null,2)+'\n');
const report='fishing_free_claim_inventory_20260906';
const relative='../temp/'+path.basename(root)+'/';
const lines=[
'# Kiểm kê Bánh Bao nhận vượt giới hạn gói miễn phí — 06/09/2026',
'',
`**Xác nhận ${n(totals.flaggedProfiles)} nhân vật nhận vượt mức; tổng ${n(totals.excessBaozi)} Bánh Bao nhận dư.** Đã đối chiếu log riêng từng server, hai trường bộ đếm và sổ nhận hiện tại. Đây là xác nhận nhận quá hạn mức, không tự kết luận mọi người cố ý khai thác.`,
'',
'## 1. Tóm tắt công việc',
'',
`Quét ${n(totals.scannedReal)} hồ sơ không phải bot trên S1/S2 lúc ${local(raw.readAt)} UTC+7; loại ${n(Object.values(raw.servers).reduce((s,r)=>s+r.excludedBots,0))} bot và kiểm không còn QA do các đợt câu cá tạo. Đối chiếu DB lại lúc ${local(verified.time)} UTC+7. Có ${profiles.length} nhân vật từng nhận gói; ${flagged.length} vượt mức và ${legitimate.length} nhận hợp lệ.`,
'',
'Gói 11001400 cấp 10 Bánh Bao (item4) mỗi lần, được nhận 1 lần/ngày. Đại hội mở từ 19:00 ngày06/09/2026 UTC+7; mọi lượt đối chiếu ở đây nằm trong cùng ngày game GMT+8, chưa qua mốc đổi ngày 23:00 giờ Việt Nam. Công thức nhận dư = (số lần đã nhận − 1) × 10.',
'',
'| Server | Hồ sơ quét | Người đã nhận | Vượt mức | Tổng lần nhận | Tổng Bánh Bao cấp | Phần hợp lệ | Bánh Bao dư |',
'|---|---|---|---|---|---|---|---|',
...serverTotals.map(r=>`| ${r.server} | ${n(r.scannedReal)} | ${r.claimingProfiles} | ${r.flaggedProfiles} | ${n(r.recordedClaims)} | ${n(r.totalBaozi)} | ${n(r.allowedBaozi)} | ${n(r.excessBaozi)} |`),
`| Tổng | ${n(totals.scannedReal)} | ${profiles.length} | ${flagged.length} | ${n(totals.recordedClaims)} | ${n(totals.totalBaozi)} | ${n(totals.allowedBaozi)} | ${n(totals.excessBaozi)} |`,
'',
'### Danh sách đầy đủ nhận vượt mức',
'',
'Tên nhân vật giữ nguyên đúng dữ liệu; các tên tự sinh HanhGia không bị coi là bot nếu hồ sơ không đánh dấu bot. Thời gian dưới đây là thời gian request nhận gói trong log, đã đổi từ GMT+8 sang UTC+7, không dùng lastBuyTime của shop chung làm thời điểm riêng của gói này.',
'',
'| STT | Server | Nhân vật | Lần nhận | Vượt số lần | Bánh Bao nhận dư | Lượt đầu → lượt cuối (UTC+7) |',
'|---|---|---|---|---|---|---|',
...flagged.map((p,i)=>`| ${i+1} | ${p.server} | ${md(p.name)} | ${n(p.recordedClaims)} | ${n(p.excessClaims)} | ${n(p.excessBaozi)} | ${p.firstRequestLocal.slice(11)} → ${p.lastRequestLocal.slice(11)} |`),
'',
'### Mã định danh để quản trị đối chiếu',
'',
'Không dùng tên hiển thị làm khóa duy nhất khi xử lý: cần cả server và playerId/userId. Chỉ lưu ID nội bộ game; không thu thập mật khẩu, token, IP hoặc thông tin thanh toán.',
'',
'| Server | Nhân vật | playerId | userId | Bánh Bao trong túi khi đối chiếu |',
'|---|---|---|---|---|',
...flagged.map(p=>`| ${p.server} | ${md(p.name)} | ${md(p.playerId)} | ${md(p.userId)} | ${n(p.currentBagBaozi)} |`),
'',
'Tồn túi là tất cả nguồn quà/mua/login còn lại sau tiêu dùng, không thể coi là lượng Bánh Bao dư chưa sử dụng. Game hiện có logic đảm bảo tối thiểu 1.000 Bánh Bao lúc login và nhiều nguồn item4 khác; audit không thay đổi logic đó.',
'',
'### Trường hợp nhận hợp lệ, không đưa vào danh sách vượt mức',
'',
...legitimate.map(p=>`- ${md(p.name)} (${p.server}), playerId ${p.playerId}: ${p.recordedClaims} lần, ${p.totalGrantedBaozi} Bánh Bao, lúc ${p.firstRequestLocal} UTC+7. Lần nhận xuất hiện sau bản sửa và sau snapshot đầu, giải thích vì sao log S1 có thêm 1 thành công so với 11 hồ sơ ban đầu. Không có nhận dư.`),
'',
'## 2. File/thư mục đã thay đổi',
'',
'Chỉ tạo tool và báo cáo local, không sửa source/client/config hay dữ liệu production:',
'',
'- `_ai_workbench/tools/audit_fishing_free_claims_20260906.py`: đọc Mongo với projection giới hạn, phân loại bot/QA và inventory log/runtime.',
'- `_ai_workbench/tools/audit_fishing_free_claim_logs_20260906.py`: đọc đoạn log theo thời gian/offset, băm dòng liên quan gói, tổng request/cấp quà theo server; không tải log nhiều GB về máy.',
'- `_ai_workbench/tools/verify_fishing_free_inventory_20260906.py`: đọc lại bộ đếm, kiểm hash/PM2/ready và template; không gọi loadPlayer hoặc savePlayer của game.',
'- `_ai_workbench/tools/build_fishing_free_inventory_report_20260906.js`: tính toán/đối soát có assertion, sinh JSON và MD; HTML dùng renderer báo cáo sẵn có.',
'- Evidence: `_ai_workbench/temp/'+path.basename(root)+'/`. Backup session trước cập nhật: `_ai_workbench/backups/'+path.basename(root)+'/`.',
'- Báo cáo `'+report+'.md/.html`, session_report.md/.html và inventory-final.json. Không file/tool rác ở root hoặc global memory.',
'',
'## 3. Lỗi đã gặp & giải pháp',
'',
'| Vấn đề | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |',
'|---|---|---|---|',
'| Hai bộ đếm UI và túi dễ bị hiểu nhầm | UI sau fix chỉ còn0/1; tồn túi lẫn nguồn khác | Dùng lịch sử shopInfo.buyRecords và rechargeInfo.records, đối chiếu log | Không tính nhận dư từ số túi hoặc current UI |',
'| Log combined thiếu một phần dòng S2 | File game chung không phải bản chứng cứ đầy đủ cho từng process; nguyên nhân thiếu chưa kết luận | Dùng PM2 out riêng của S1/S2; khớp toàn bộ request và tổng success | Không bù số liệu bằng đoán; giữ evidence thiếu để audit |',
'| S1 thêm một success so với snapshot ban đầu | Một người nhận lần đầu hợp lệ sau snapshot | Đọc lại đúng ID, tìm request/cấp quà, loại khỏi danh sách vượt | Dữ liệu live thay đổi không đồng nghĩa bug còn tồn tại |',
'| Result log không có userId | Logger cũ chỉ ghi user ở request | Đối soát request theo user + hai bộ đếm DB + tổng result theo server | Không gán result xen kẽ cho user bằng khoảng cách dòng |',
'| Script aggregate lỗi ngoặc trước khi chạy | Thiếu ngoặc trong pipeline JS nhúng | Sửa syntax, thêm node --check trước SSH | Parse trước query; không có DB mutation ở lần lỗi |',
'| Seek S1 đề nghị quét9,9GB bị chặn | Mẫu tìm ngày chỉ nhận06/09, file PM2 chứa ngày cũ | Cho tìm mọi ngày ở bước seek, giới hạn số byte sau đó | Giữ trần đọc, không bỏ guard để quét cả VPS |',
'| Tool báo cáo lỗi template string | Backtick Markdown trong template JS chưa escape | Dùng nối chuỗi tại phần đường dẫn, chạy lại kiểm syntax | Không ghi artifact/report khi tool còn lỗi parse |',
'',
'Báo cáo/tool UTF-8; không phát hiện mojibake mới. Có thư mục temp rỗng của lần query syntax lỗi được giữ trong workbench, không xóa bừa hay ảnh hưởng cây dự án.',
'',
'## 4. Kỹ năng / kinh nghiệm mới',
'',
'- Hai counter được ghi cùng lần cập nhật nên không gọi chúng là hai bằng chứng độc lập; log request và tổng cấp quà là đối chiếu bổ sung.',
'- Không cộng log combined với log PM2 vì có nhiều dòng trùng cùng hành động. Kết quả chính chỉ dùng file PM2 riêng của từng server.',
'- lastBuyTime thuộc mọi gói shop, có thể sau hotfix dù lượt nhận miễn phí đã dừng. Phải lấy thời gian từ đúng log gói11001400.',
'- Khối lượng nhận cực lớn là dấu hiệu cần ưu tiên rà soát, không tự chứng minh dùng bot/tool, danh tính chủ tài khoản hoặc ý định của từng người.',
'',
'## 5. Trạng thái hiện tại',
'',
`- ${flagged.length}/${flagged.length} nhân vật vượt mức: shopCount = rechargeCount = tổng count request trong PM2 đúng server. Tổng Bánh Bao cấp trong result server khớp tổng counter ×10.`,
`- S1 log: ${n(logs['1001'].responses.successQuantity)} success, ${n(logs['1001'].responses.successBaozi)} Bánh Bao. S2: ${n(logs['1002'].responses.successQuantity)} success, ${n(logs['1002'].responses.successBaozi)} Bánh Bao. Đã trừ ${n(totals.allowedBaozi)} hợp lệ của ${profiles.length} người khi tính dư.`,
`- Giữ nguyên ${flagged.length} bộ đếm vượt mức từ snapshot đầu tới lần kiểm lại. Chỉ thêm ${legitimate.length} nhận lần đầu hợp lệ. Hậu kiểm ${local(verified.time)} UTC+7: ${verified.hashCount} hash đúng, PM2 không đổi, ready 8080/8083 đều200.`,
'- Mongo hiện standalone, không có oplog; template player theo đường runtime không tồn tại nên fallback rỗng, không có counter11001400 template cần trừ. Không đọc/restore backup DB diện rộng.',
'- Chưa truy vết Bánh Bao dư đã tiêu ở đâu hoặc còn bao nhiêu, chưa kết luận ý định của tất cả người trong danh sách. Không thu hồi, khóa tài khoản, reset, bù, gửi thư hoặc restart dịch vụ.',
'',
'### Chứng cứ và khả năng kiểm lại',
'',
`[Bảng JSON đầy đủ](${relative}inventory-final.json) · [Snapshot DB](${relative}inventory-raw.json) · [Đối chiếu DB/hash](${relative}inventory-verify.json) · [Log S1](${relative}log-evidence-1001.json) · [Log S2](${relative}log-evidence-1002.json).`,
'',
'| Artifact | SHA-256 snapshot local |',
'|---|---|',
...manifest.map(m=>`| ${m.file} | ${m.sha256} |`),
'',
'Log đọc trong khoảng từ18:55 UTC+7 ngày06/09 đến snapshot hiện có, dùng seek timestamp và lookback1MiB; không gọi đó là audit toàn lịch sử. Chỉ xuất số liệu/dòng của gói đang kiểm, không lộ credential hoặc tải toàn bộ log.',
'',
'## 6. Bước tiếp theo',
'',
'1. Chủ dự án có thể xem bảng này để quyết định có cần xử lý nhận dư hay không. Phiên này chỉ kiểm kê, không tự áp hình phạt hoặc thu hồi.',
'2. Nếu yêu cầu thu hồi, phải chốt rõ ID/phạm vi/cách tính, chụp snapshot mới và giữ giao dịch nguyên tử, đối soát trước/sau; không lấy tồn túi làm số cần thu hồi.',
'3. Giữ nguyên evidence mốc này. Audit ngày khác phải trừ số ngày hợp lệ tương ứng, không tái dùng công thức trừ một lần cho toàn lịch sử.',
''
];
fs.writeFileSync(path.join(wb,'reports',report+'.md'),lines.join('\n'));
console.log(JSON.stringify({result:data.result,totals,serverTotals,legitimate:legitimate.map(p=>({name:p.name,server:p.server,claims:p.recordedClaims})),report:report+'.md'}));
