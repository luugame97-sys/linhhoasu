'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const WB=path.resolve(__dirname,'..'),REL=path.join(WB,'temp/reward_release_20260905');
const load=name=>JSON.parse(fs.readFileSync(path.join(REL,name),'utf8'));
const deployed=load('deploy_20260905_063510.json'),audit=load('production_final_fixture.json'),final=load('postdeploy_final.json'),contract=load('contract.json'),repair=load('repair_preview.json');
const blocked=audit.rows.filter(r=>r.status==='LOI_DA_XAC_NHAN');assert.equal(blocked.length,114);assert.equal(contract.nativeCases,474);
const rows=blocked.map(r=>({id:r.id,name:r.name,useType:r.useType,reason:r.id===90151?'Chọn Linh trục: placeholder chưa có pool gốc; giữ nguyên rương':r.useType===102?'Pool chưa xác minh; giữ nguyên rương':'Thiếu option gốc; giữ nguyên rương'}));
fs.writeFileSync(path.join(WB,'reports/reward_release_remaining_20260905.txt'),rows.map(r=>`${r.id}\t${r.name}\t${r.reason}`).join('\n')+'\n');
const md=[
'# Báo cáo triển khai P1–P5 nhận thưởng và kích hoạt — 05/09/2026','',
'## 1. Kết luận: đã triển khai phần kiểm chứng; chưa hoàn tất toàn bộ P1–P5','',
'Đã triển khai **15 file** lên S1/S2, source local được áp dụng cùng các hunk và kiểm nội dung logic khớp. Sửa cấp sở hữu native cho 47 rương và phục hồi 150 đan thưởng tức thời: **197 ID đã phục hồi luồng server**. Bổ sung bảo vệ cho 90151 và placeholder Linh trục, không tự phát thưởng đoán. Không gọi 197 ID là đã hoàn tất mọi trường hợp native UI hoặc duplicate policy.','',
'| Nhóm công việc | Trạng thái | Bằng chứng/việc còn thiếu |','|---|---|---|',
'| P1: cấp thưởng chung/native | Triển khai; contract + WS E2E đạt trong scope | 470 native asset, 940 lượt grant, 474 case rương. Bí bảo trùng chưa có quy tắc quy đổi gốc; giữ surplus trong unconvertedRewardCopies, chưa coi trùng là hoàn tất |',
'| P2: nạp/code/quyền lợi và recovery | Triển khai phần grant/recovery; hồi quy đạt | Mua 4 gói, code/mail/retry/relog S1 PASS; cash crash recovery là fixture, chưa upstream thanh toán thật; toàn bộ 694 gói/specialized entitlement chưa có E2E đầy đủ |',
'| P3: toàn bộ rương/đan | 150 đan phục hồi; 114 ID còn giữ an toàn | 111 random + 90021/90022 + option Linh trục của 90151 còn thiếu nguồn chuẩn |',
'| P4: dữ liệu lịch sử | Chỉ dry-run; CHƯA COMMIT | 2 người có 5 bản sao native ở túi thường, có record 4 gói; cần duyệt preview và đối chiếu receipt trước chuyển |',
'| P5: triển khai/nghiệm thu | S1/S2 deployed; WS S1 PASS; native visual BLOCKED | Native client ở trình duyệt tích hợp dừng 100% với Illegal invocation tại index.html:682; S2 chưa bypass lịch mở để QA |','',
'## 2. Thay đổi đã thực hiện','',
'- NativeItemRewardService: nhận diện Elf/Curios/Orb/Connect theo config, grant vào đúng collection. Elf lần đầu unlock; trùng dùng ElfConfig.piece của cùng ID, không nâng quality. Orb tăng subCount; Connect tăng count; không tự mặc/xuất chiến.',
'- Curios lần đầu unlock; bản sao dư không tự đổi tỷ lệ: bảo toàn trong other_attr_info.curiosInfo.unconvertedRewardCopies. Đây là trạng thái pending conversion, không phải phần thưởng đã dùng được hoàn toàn.',
'- RewardInfo.items được dùng để hiển thị đúng asset native theo client; RewardSync/mail loại body-ID khỏi delta túi để tránh nhận hai lần.',
'- Packet được đối chiếu receiver client: Elf 6001 {elfData}; Curios full init 5200; Orb 6401 {data}; Connect 6801 {connects}. Không thêm packet tự đoán như 5209.',
'- ItemPillService: cap chung -802/-804, config expPillDailyCount/energyPillDailyCount, bonus PrivilegeConfig + CuriosEcho + FashionBath; reset ngày theo lịch server như alchemy. Login/1200 trả useRecords; heartbeat chuyển ngày gửi refresh 1201.',
'- Phát exp/item4 của đan theo AssetsUseConfig.rewards; giữ 308 đan thuộc tính vĩnh viễn. EXP vẫn theo luật level/stage hiện hữu, chưa thay logic tiêu EXP khi lên cấp.',
'- Lỗi save item/activity/token làm session phải đọc lại state khi retry, không tiếp tục tin snapshot đã mutate.',
'- Cash callback lưu fulfillment receipt cùng player reward/entitlement; retry sau lỗi mail/Transaction chỉ finalize từ receipt, không grant lại. Mail phụ dùng eventKey idempotent; amount/user/product mismatch bị reject.',
'- Placeholder random_connect chưa có pool chuẩn được preflight trước consume của item/mail và resolver nạp. Các gói có loại placeholder này chưa thể hoàn tất mua; không coi chặn là đã sửa gameplay. Luồng callback đã-thu-tiền cho sản phẩm chưa hỗ trợ cần chính sách pending fulfillment riêng trước mở bán.','',
'## 3. Kiểm thử đã chạy','',
'| Kiểm tra | Kết quả |','|---|---|',
'| Native theo config | 470 ID × 2 route = 940 lượt; body-ID không nằm trong items |',
'| Toàn bộ case lỗi native trước đó | 474 case / 47 rương PASS đúng ownership và consume |',
'| Đan tức thời | 150/150; thưởng ×count, cap đổi ID, reset ngày, bonus thẻ/Bí bảo/áo tắm |',
'| Receiver native từ bundle client | 4 hàm thật chạy isolated VM PASS; không thay cho UI E2E |',
'| Cash crash/retry | Lỗi finalize Transaction và Mail, load player mới khi retry; 2 lần save/2 order/2 mail, không grant lại |',
'| Token/cash regression | 11 + 11 checks PASS |',
'| Activity7 | 58 assertions PASS; concurrent cash 8 checks PASS |',
'| Ngoại quan | 2.192 ID, 234 assertions PASS |',
'| Core | 714 bảng PASS |',
'| Production WS S1 | Mua 11000015/16/17/20, mở 90027/90202/90214, code+mail+retry, pill shared cap, DB/readback/relog PASS |',
'| Cleanup QA WS | player/code/mail remaining=0 |',
'| Native UI | Đã thử đăng nhập bằng account QA riêng, dừng ở 100%; chưa PASS |',
'| Cleanup QA UI | Account và player remaining=0; tab đã đóng |',
'| Full production fixture cuối | 940 row: 821 basic fixture, 114 fail-closed, 5 pending; không coi 821 là native-OK toàn bộ |','',
'Lưu ý hồi quy: Activity7 test cũ ban đầu phát sinh background save thiếu mock; đã thêm preload đúng PlayerService cho fixture và chạy lại sạch. Các câu kiểm đan dùng RoleLevelConfig.lv để tách grant khỏi luật EXP khi lên cấp; không dùng test đó làm bằng chứng đổi luật level.','',
'## 4. Native UI blocker và phạm vi chưa kiểm chứng','',
'Client log: TypeError: Illegal invocation tại prototype.send (index.html:682) → egret flush → sendCheckAccount. Lỗi xuất hiện trước khi vào game, không phải phản hồi mở rương. Đã xem source: _nativeSend được bind ở egret wrapper, nên chưa có đủ bằng chứng để đoán sửa receiver. Không thay wrapper/client hoặc điều tra input-freeze đang tạm dừng. Chỉ có Codex In-app Browser trong danh sách trình duyệt kết nối ở lượt thử này.',
'Các số PASS ở trên là contract/WS, không che native-visual failure. Cần test trên trình duyệt/client hoạt động hoặc xử lý riêng lỗi đăng nhập này trước khi nghiệm thu UI. Chưa tự bypass cảnh báo hay đăng nhập người thật.','',
'## 5. P4: preview chuyển dữ liệu nhận sai — chưa áp dụng','',
'Đọc cả bag, native ownership và purchase records. Hai subject S1 sau đều có record 11000015/16/17/20; toàn bộ ID dưới đây hiện chưa có trong collection native. Không xuất account/name/code.','',
'| Subject ẩn danh | Item túi | Native trước | Dự kiến sau khi duyệt |','|---|---|---|---|'];
for(const r of repair.databases.lhs_s1001.rows)for(const x of r.moves)md.push(`| ${r.subject} | ${x.id} ×${x.count} | ${x.currentlyOwned?'Đã có':'Chưa có'} | Bỏ đúng lượng túi và grant native tương ứng; lưu preimage + repairId |`);
md.push('',
'Chưa ghi DB người thật. Nếu duyệt chuyển, cần chặn ghi chồng từ session, backup preimage và commit idempotent; không reroll rương đã mất hoặc bù các giao dịch thiếu ledger. 100139 ×823 vẫn được giữ nguyên, không tự mở.','',
'## 6. ID chưa xử lý xong','',
'Danh sách 114 ID: [reward_release_remaining_20260905.txt](reward_release_remaining_20260905.txt). Rương 90151 chỉ option index 1 bị giữ, option 0 vẫn hoạt động. 111 random, 90021/90022 giữ nguyên. 93065/100803 vẫn gián tiếp bị ảnh hưởng qua rương con.',
'Nguồn đã kiểm: config production 714 bảng, scripts/_tables_dump, cây local-run2 và inventory hai archive server.zip/1server.zip. Chưa có bảng drop/pool xác suất chuẩn cho các rương này; không coi config tham chiếu phần thưởng đầu vào là bảng rơi hoàn chỉnh. Không tự chia đều xác suất, nâng quality hay chuyển mảnh thành thân.','',
'| ID | Tên | Việc còn thiếu |','|---:|---|---|');
for(const r of rows)md.push(`| ${r.id} | ${String(r.name).replace(/\|/g,'/')} | ${r.reason} |`);
md.push('',
'## 7. Deploy, backup và an toàn','',
`- Production backup: ${deployed.backup}. Có preimage của 13 file cũ; 2 service mới có rollback xóa đúng đường dẫn.`,
`- Staging đã kiểm: ${deployed.stage}. Không đụng dist/admin/DB process.`,
'- S1/S2 chung source: dừng cả hai, copy đúng file, khởi động S1 và QA rồi khởi động S2. Không rollback đã xảy ra trong deploy thành công.',
'- Postcheck hash 15/15 khớp, ready S1/S2 HTTP 200, PM2 6/6 online. Bot reconnect tăng dần sau restart; không báo 580/580 trước khi đủ.',
`- Health snapshot cuối: ${JSON.stringify(final.health)}.`,
'- Local source được áp dụng patch theo baseline production, không chép đè toàn cây; 15 file nội dung khớp candidate khi chuẩn hóa CRLF.',
'- Backup local source: _ai_workbench/backups/reward_release_local_pre_20260905/; production baseline candidate: _ai_workbench/temp/reward_release_20260905/baseline.json.',
'- Không sửa client/config bin, không restart Nginx/Mongo/Redis, không commit repair/bù người thật.','',
'## 8. File source thay đổi','',
'| File | SHA-256 production |','|---|---|');
for(const [file,hash]of Object.entries(deployed.installedHashes))md.push(`| ${file} | ${hash} |`);
md.push('',
'## 9. Lỗi triển khai/test và chống lặp','',
'| Lỗi | Nguyên nhân | Xử lý | Tránh lặp |','|---|---|---|---|',
'| VPS thiếu acorn | Dependency QA chỉ có local | Upload parser vào staging/tools, không cài vào app production | Kiểm runtime dependencies trước test |',
'| Trích client function bị kéo cả comma expression | parseExpressionAt trả SequenceExpression | Chọn FunctionExpression đầu tiên rồi kiểm node type | Không eval cả chuỗi minify |',
'| Test exp sai kỳ vọng | Fixture vượt ngưỡng level, RoleLevelConfig dùng lv | Kiểm dưới ngưỡng rồi giữ test logic level riêng | Không đổi logic game chỉ để test xanh |',
'| Cash regression lệch mã lỗi | Thêm mismatch guard trả mã mới cho amount | Giữ AMOUNT_MISMATCH contract | Test error contract trước deploy |',
'| Activity7 test phát sinh save timeout | Fixture chưa mock savePlayer | Preload stub memory và chạy lại | Fixture không kết nối DB |',
'| UI dừng 100% | Illegal invocation ở WebSocket wrapper | Ghi blocker, cleanup exact QA; chưa sửa client | Không gọi WS PASS là UI PASS |','',
'## 10. Bước tiếp theo để hoàn tất','',
'1. Duyệt preview 2 subject / 5 bản sao để chuyển đúng native, không bù trùng; hiện chưa sửa dữ liệu cũ.',
'2. Cung cấp/định vị bảng drop chuẩn cho 114 ID pending và quy tắc Curios duplicate; triển khai từng họ sau đủ contract.',
'3. Kiểm native UI trên trình duyệt/client hoạt động; mở khóa nghiệm thu S2 sau giờ mở, không bypass.',
'4. Khép kín toàn bộ 694 payId, specialized entitlement, quota code đồng thời đa process và paid callback pending fulfillment; các phần này chưa đủ acceptance để gọi P2 hoàn tất.',
'5. Reconcile cash receipt/log và cleanup retention có thiết kế; không xóa receipt chống trùng tùy tiện.','');
fs.writeFileSync(path.join(WB,'reports/reward_release_20260905.md'),md.join('\n'));
console.log(JSON.stringify({result:'PASS',deployedFiles:Object.keys(deployed.files).length,restoredNativeChestIds:47,restoredPills:150,remainingIds:114,repairApplied:false,nativeVisualPass:false}));
