# Kiểm kê Bánh Bao nhận vượt giới hạn gói miễn phí — 06/09/2026

**Xác nhận 19 nhân vật nhận vượt mức; tổng 231.860 Bánh Bao nhận dư.** Đã đối chiếu log riêng từng server, hai trường bộ đếm và sổ nhận hiện tại. Đây là xác nhận nhận quá hạn mức, không tự kết luận mọi người cố ý khai thác.

## 1. Tóm tắt công việc

Quét 837 hồ sơ không phải bot trên S1/S2 lúc 2026-09-06 21:41:40 UTC+7; loại 1.740 bot và kiểm không còn QA do các đợt câu cá tạo. Đối chiếu DB lại lúc 2026-09-06 22:11:42 UTC+7. Có 20 nhân vật từng nhận gói; 19 vượt mức và 1 nhận hợp lệ.

Gói 11001400 cấp 10 Bánh Bao (item4) mỗi lần, được nhận 1 lần/ngày. Đại hội mở từ 19:00 ngày06/09/2026 UTC+7; mọi lượt đối chiếu ở đây nằm trong cùng ngày game GMT+8, chưa qua mốc đổi ngày 23:00 giờ Việt Nam. Công thức nhận dư = (số lần đã nhận − 1) × 10.

| Server | Hồ sơ quét | Người đã nhận | Vượt mức | Tổng lần nhận | Tổng Bánh Bao cấp | Phần hợp lệ | Bánh Bao dư |
|---|---|---|---|---|---|---|---|
| S1 | 726 | 12 | 11 | 3.169 | 31.690 | 120 | 31.570 |
| S2 | 111 | 8 | 8 | 20.037 | 200.370 | 80 | 200.290 |
| Tổng | 837 | 20 | 19 | 23.206 | 232.060 | 200 | 231.860 |

### Danh sách đầy đủ nhận vượt mức

Tên nhân vật giữ nguyên đúng dữ liệu; các tên tự sinh HanhGia không bị coi là bot nếu hồ sơ không đánh dấu bot. Thời gian dưới đây là thời gian request nhận gói trong log, đã đổi từ GMT+8 sang UTC+7, không dùng lastBuyTime của shop chung làm thời điểm riêng của gói này.

| STT | Server | Nhân vật | Lần nhận | Vượt số lần | Bánh Bao nhận dư | Lượt đầu → lượt cuối (UTC+7) |
|---|---|---|---|---|---|---|
| 1 | S2 | Đại Đế | 19.723 | 19.722 | 197.220 | 19:09:36 → 21:23:16 |
| 2 | S1 | KawaiiNo1 | 2.965 | 2.964 | 29.640 | 19:39:41 → 21:23:40 |
| 3 | S2 | HG Quýt | 152 | 151 | 1.510 | 19:12:23 → 19:26:18 |
| 4 | S2 | HanhGia_1002_19ff1c354d_ | 88 | 87 | 870 | 21:02:35 → 21:03:15 |
| 5 | S1 | Lily | 49 | 48 | 480 | 19:07:20 → 19:07:55 |
| 6 | S1 | yeupevit | 42 | 41 | 410 | 20:08:24 → 20:08:56 |
| 7 | S1 | HanhGia_1001_a2e34ec5ce_ | 31 | 30 | 300 | 20:13:30 → 20:41:43 |
| 8 | S2 | HanhGia_1002_18d3c24427_ | 29 | 28 | 280 | 20:38:43 → 21:19:34 |
| 9 | S2 | Đế Thích | 23 | 22 | 220 | 19:46:42 → 19:46:56 |
| 10 | S1 | gc__2_0dc9 | 22 | 21 | 210 | 20:20:10 → 20:20:27 |
| 11 | S1 | HanhGia_1001_7b5ca796fe_ | 22 | 21 | 210 | 21:02:09 → 21:18:10 |
| 12 | S1 | nicky | 14 | 13 | 130 | 19:40:22 → 21:20:09 |
| 13 | S2 | HanhGia_1002_8726b5014f_ | 13 | 12 | 120 | 19:59:47 → 20:11:59 |
| 14 | S1 | MNGH99 | 9 | 8 | 80 | 20:13:17 → 20:13:37 |
| 15 | S1 | VươngLâm | 6 | 5 | 50 | 20:44:46 → 21:22:52 |
| 16 | S2 | OneHit | 6 | 5 | 50 | 19:55:54 → 20:01:34 |
| 17 | S1 | Vân Muội | 5 | 4 | 40 | 20:13:28 → 20:27:13 |
| 18 | S1 | Lazada | 3 | 2 | 20 | 19:32:40 → 19:32:47 |
| 19 | S2 | Tiny-BánhMì | 3 | 2 | 20 | 21:14:09 → 21:14:13 |

### Mã định danh để quản trị đối chiếu

Không dùng tên hiển thị làm khóa duy nhất khi xử lý: cần cả server và playerId/userId. Chỉ lưu ID nội bộ game; không thu thập mật khẩu, token, IP hoặc thông tin thanh toán.

| Server | Nhân vật | playerId | userId | Bánh Bao trong túi khi đối chiếu |
|---|---|---|---|---|
| S2 | Đại Đế | p_u_Wk_1002_a70f8d_1788608722458_1788608722458 | u_Wk_1002_a70f8d_1788608722458 | 476.521 |
| S1 | KawaiiNo1 | p_u_Wk_1001_669477_1788237596763_1788237596763 | u_Wk_1001_669477_1788237596763 | 92.821 |
| S2 | HG Quýt | p_u_Wk_1002_92a658_1788620017965_1788620017966 | u_Wk_1002_92a658_1788620017965 | 310.441 |
| S2 | HanhGia_1002_19ff1c354d_ | p_u_Wk_1002_074b89_1788681168463_1788681168464 | u_Wk_1002_074b89_1788681168463 | 27.145 |
| S1 | Lily | p_u_Wk_1001_c8d523_1788622729648_1788622729648 | u_Wk_1001_c8d523_1788622729648 | 18.106 |
| S1 | yeupevit | p_u_Wk_1001_b74d1f_1788183420669_1788183420669 | u_Wk_1001_b74d1f_1788183420669 | 132.253 |
| S1 | HanhGia_1001_a2e34ec5ce_ | p_u_Wk_1001_8e7cdd_1788541887809_1788541887810 | u_Wk_1001_8e7cdd_1788541887809 | 17.461 |
| S2 | HanhGia_1002_18d3c24427_ | p_u_Wk_1002_0c1847_1788616606327_1788616606328 | u_Wk_1002_0c1847_1788616606327 | 19.205 |
| S2 | Đế Thích | p_u_Wk_1002_1c51f4_1788612986545_1788612986546 | u_Wk_1002_1c51f4_1788612986545 | 294.957 |
| S1 | gc__2_0dc9 | p_u_Wk_1001_a0ebf6_1788050265446_1788050265447 | u_Wk_1001_a0ebf6_1788050265446 | 607.316 |
| S1 | HanhGia_1001_7b5ca796fe_ | p_u_Wk_1001_c2e45f_1788524963889_1788524963889 | u_Wk_1001_c2e45f_1788524963889 | 19.845 |
| S1 | nicky | p_u_Wk_1001_d7b1ec_1787996263464_1787996263465 | u_Wk_1001_d7b1ec_1787996263464 | 2.859 |
| S2 | HanhGia_1002_8726b5014f_ | p_u_Wk_1002_85c314_1788608804297_1788608804298 | u_Wk_1002_85c314_1788608804297 | 564.742 |
| S1 | MNGH99 | p_u_Wk_1001_af5f12_1788528268738_1788528268739 | u_Wk_1001_af5f12_1788528268738 | 20.653 |
| S1 | VươngLâm | p_u_Wk_1001_e0c020_1788057145675_1788057145675 | u_Wk_1001_e0c020_1788057145675 | 75.582 |
| S2 | OneHit | p_u_Wk_1002_ee4fa9_1788611422138_1788611422138 | u_Wk_1002_ee4fa9_1788611422138 | 2.780.029 |
| S1 | Vân Muội | p_u_Wk_1001_0c5e4d_1788567512351_1788567512351 | u_Wk_1001_0c5e4d_1788567512351 | 21.326 |
| S1 | Lazada | p_u_Wk_1001_d90580_1788129989390_1788129989391 | u_Wk_1001_d90580_1788129989390 | 276.041 |
| S2 | Tiny-BánhMì | p_u_Wk_1002_78750a_1788692434744_1788692434744 | u_Wk_1002_78750a_1788692434744 | 21.705 |

Tồn túi là tất cả nguồn quà/mua/login còn lại sau tiêu dùng, không thể coi là lượng Bánh Bao dư chưa sử dụng. Game hiện có logic đảm bảo tối thiểu 1.000 Bánh Bao lúc login và nhiều nguồn item4 khác; audit không thay đổi logic đó.

### Trường hợp nhận hợp lệ, không đưa vào danh sách vượt mức

- FangZi (S1), playerId p_u_Wk_1001_7a948e_1788008560635_1788008560636: 1 lần, 10 Bánh Bao, lúc 2026-09-06 21:52:59 UTC+7. Lần nhận xuất hiện sau bản sửa và sau snapshot đầu, giải thích vì sao log S1 có thêm 1 thành công so với 11 hồ sơ ban đầu. Không có nhận dư.

## 2. File/thư mục đã thay đổi

Chỉ tạo tool và báo cáo local, không sửa source/client/config hay dữ liệu production:

- `_ai_workbench/tools/audit_fishing_free_claims_20260906.py`: đọc Mongo với projection giới hạn, phân loại bot/QA và inventory log/runtime.
- `_ai_workbench/tools/audit_fishing_free_claim_logs_20260906.py`: đọc đoạn log theo thời gian/offset, băm dòng liên quan gói, tổng request/cấp quà theo server; không tải log nhiều GB về máy.
- `_ai_workbench/tools/verify_fishing_free_inventory_20260906.py`: đọc lại bộ đếm, kiểm hash/PM2/ready và template; không gọi loadPlayer hoặc savePlayer của game.
- `_ai_workbench/tools/build_fishing_free_inventory_report_20260906.js`: tính toán/đối soát có assertion, sinh JSON và MD; HTML dùng renderer báo cáo sẵn có.
- Evidence: `_ai_workbench/temp/fishing_free_claim_audit_20260906T144141Z/`. Backup session trước cập nhật: `_ai_workbench/backups/fishing_free_claim_audit_20260906T144141Z/`.
- Báo cáo `fishing_free_claim_inventory_20260906.md/.html`, session_report.md/.html và inventory-final.json. Không file/tool rác ở root hoặc global memory.

## 3. Lỗi đã gặp & giải pháp

| Vấn đề | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Hai bộ đếm UI và túi dễ bị hiểu nhầm | UI sau fix chỉ còn0/1; tồn túi lẫn nguồn khác | Dùng lịch sử shopInfo.buyRecords và rechargeInfo.records, đối chiếu log | Không tính nhận dư từ số túi hoặc current UI |
| Log combined thiếu một phần dòng S2 | File game chung không phải bản chứng cứ đầy đủ cho từng process; nguyên nhân thiếu chưa kết luận | Dùng PM2 out riêng của S1/S2; khớp toàn bộ request và tổng success | Không bù số liệu bằng đoán; giữ evidence thiếu để audit |
| S1 thêm một success so với snapshot ban đầu | Một người nhận lần đầu hợp lệ sau snapshot | Đọc lại đúng ID, tìm request/cấp quà, loại khỏi danh sách vượt | Dữ liệu live thay đổi không đồng nghĩa bug còn tồn tại |
| Result log không có userId | Logger cũ chỉ ghi user ở request | Đối soát request theo user + hai bộ đếm DB + tổng result theo server | Không gán result xen kẽ cho user bằng khoảng cách dòng |
| Script aggregate lỗi ngoặc trước khi chạy | Thiếu ngoặc trong pipeline JS nhúng | Sửa syntax, thêm node --check trước SSH | Parse trước query; không có DB mutation ở lần lỗi |
| Seek S1 đề nghị quét9,9GB bị chặn | Mẫu tìm ngày chỉ nhận06/09, file PM2 chứa ngày cũ | Cho tìm mọi ngày ở bước seek, giới hạn số byte sau đó | Giữ trần đọc, không bỏ guard để quét cả VPS |
| Tool báo cáo lỗi template string | Backtick Markdown trong template JS chưa escape | Dùng nối chuỗi tại phần đường dẫn, chạy lại kiểm syntax | Không ghi artifact/report khi tool còn lỗi parse |

Báo cáo/tool UTF-8; không phát hiện mojibake mới. Có thư mục temp rỗng của lần query syntax lỗi được giữ trong workbench, không xóa bừa hay ảnh hưởng cây dự án.

## 4. Kỹ năng / kinh nghiệm mới

- Hai counter được ghi cùng lần cập nhật nên không gọi chúng là hai bằng chứng độc lập; log request và tổng cấp quà là đối chiếu bổ sung.
- Không cộng log combined với log PM2 vì có nhiều dòng trùng cùng hành động. Kết quả chính chỉ dùng file PM2 riêng của từng server.
- lastBuyTime thuộc mọi gói shop, có thể sau hotfix dù lượt nhận miễn phí đã dừng. Phải lấy thời gian từ đúng log gói11001400.
- Khối lượng nhận cực lớn là dấu hiệu cần ưu tiên rà soát, không tự chứng minh dùng bot/tool, danh tính chủ tài khoản hoặc ý định của từng người.

## 5. Trạng thái hiện tại

- 19/19 nhân vật vượt mức: shopCount = rechargeCount = tổng count request trong PM2 đúng server. Tổng Bánh Bao cấp trong result server khớp tổng counter ×10.
- S1 log: 3.169 success, 31.690 Bánh Bao. S2: 20.037 success, 200.370 Bánh Bao. Đã trừ 200 hợp lệ của 20 người khi tính dư.
- Giữ nguyên 19 bộ đếm vượt mức từ snapshot đầu tới lần kiểm lại. Chỉ thêm 1 nhận lần đầu hợp lệ. Hậu kiểm 2026-09-06 22:11:42 UTC+7: 164 hash đúng, PM2 không đổi, ready 8080/8083 đều200.
- Mongo hiện standalone, không có oplog; template player theo đường runtime không tồn tại nên fallback rỗng, không có counter11001400 template cần trừ. Không đọc/restore backup DB diện rộng.
- Chưa truy vết Bánh Bao dư đã tiêu ở đâu hoặc còn bao nhiêu, chưa kết luận ý định của tất cả người trong danh sách. Không thu hồi, khóa tài khoản, reset, bù, gửi thư hoặc restart dịch vụ.

### Chứng cứ và khả năng kiểm lại

[Bảng JSON đầy đủ](../temp/fishing_free_claim_audit_20260906T144141Z/inventory-final.json) · [Snapshot DB](../temp/fishing_free_claim_audit_20260906T144141Z/inventory-raw.json) · [Đối chiếu DB/hash](../temp/fishing_free_claim_audit_20260906T144141Z/inventory-verify.json) · [Log S1](../temp/fishing_free_claim_audit_20260906T144141Z/log-evidence-1001.json) · [Log S2](../temp/fishing_free_claim_audit_20260906T144141Z/log-evidence-1002.json).

| Artifact | SHA-256 snapshot local |
|---|---|
| inventory-raw.json | 6a831cd8132e828e2098b4c1bab5c876307ffcaff4517636a147f8a7c5694e01 |
| inventory-verify.json | f91417ea813b7efbfcb9ca96fff86ac93f2978534bb8a17d89ff0da0bcee312a |
| log-evidence.json | e27e5df024216b9ec46e1556ca8c7f0a61b286d8e3d0a8b2573aee8f66bde11f |
| log-evidence-1001.json | 312f6baed06ce8635f226b034ae27f01ce05a5f1fc62e20089583c381b7edc5a |
| log-evidence-1002.json | 789c6f2556f00b30a824132b8e4076fab082b9a509f5645e6c46f7d6f4f31275 |

Log đọc trong khoảng từ18:55 UTC+7 ngày06/09 đến snapshot hiện có, dùng seek timestamp và lookback1MiB; không gọi đó là audit toàn lịch sử. Chỉ xuất số liệu/dòng của gói đang kiểm, không lộ credential hoặc tải toàn bộ log.

## 6. Bước tiếp theo

1. Chủ dự án có thể xem bảng này để quyết định có cần xử lý nhận dư hay không. Phiên này chỉ kiểm kê, không tự áp hình phạt hoặc thu hồi.
2. Nếu yêu cầu thu hồi, phải chốt rõ ID/phạm vi/cách tính, chụp snapshot mới và giữ giao dịch nguyên tử, đối soát trước/sau; không lấy tồn túi làm số cần thu hồi.
3. Giữ nguyên evidence mốc này. Audit ngày khác phải trừ số ngày hợp lệ tương ứng, không tái dùng công thức trừ một lần cho toàn lịch sử.
