# Báo cáo triển khai P1–P5 nhận thưởng và kích hoạt — 05/09/2026

## 1. Kết luận: đã triển khai phần kiểm chứng; chưa hoàn tất toàn bộ P1–P5

Đã triển khai **15 file** lên S1/S2, source local được áp dụng cùng các hunk và kiểm nội dung logic khớp. Sửa cấp sở hữu native cho 47 rương và phục hồi 150 đan thưởng tức thời: **197 ID đã phục hồi luồng server**. Bổ sung bảo vệ cho 90151 và placeholder Linh trục, không tự phát thưởng đoán. Không gọi 197 ID là đã hoàn tất mọi trường hợp native UI hoặc duplicate policy.

| Nhóm công việc | Trạng thái | Bằng chứng/việc còn thiếu |
|---|---|---|
| P1: cấp thưởng chung/native | Triển khai; contract + WS E2E đạt trong scope | 470 native asset, 940 lượt grant, 474 case rương. Bí bảo trùng chưa có quy tắc quy đổi gốc; giữ surplus trong unconvertedRewardCopies, chưa coi trùng là hoàn tất |
| P2: nạp/code/quyền lợi và recovery | Triển khai phần grant/recovery; hồi quy đạt | Mua 4 gói, code/mail/retry/relog S1 PASS; cash crash recovery là fixture, chưa upstream thanh toán thật; toàn bộ 694 gói/specialized entitlement chưa có E2E đầy đủ |
| P3: toàn bộ rương/đan | 150 đan phục hồi; 114 ID còn giữ an toàn | 111 random + 90021/90022 + option Linh trục của 90151 còn thiếu nguồn chuẩn |
| P4: dữ liệu lịch sử | Chỉ dry-run; CHƯA COMMIT | 2 người có 5 bản sao native ở túi thường, có record 4 gói; cần duyệt preview và đối chiếu receipt trước chuyển |
| P5: triển khai/nghiệm thu | S1/S2 deployed; WS S1 PASS; native visual BLOCKED | Native client ở trình duyệt tích hợp dừng 100% với Illegal invocation tại index.html:682; S2 chưa bypass lịch mở để QA |

## 2. Thay đổi đã thực hiện

- NativeItemRewardService: nhận diện Elf/Curios/Orb/Connect theo config, grant vào đúng collection. Elf lần đầu unlock; trùng dùng ElfConfig.piece của cùng ID, không nâng quality. Orb tăng subCount; Connect tăng count; không tự mặc/xuất chiến.
- Curios lần đầu unlock; bản sao dư không tự đổi tỷ lệ: bảo toàn trong other_attr_info.curiosInfo.unconvertedRewardCopies. Đây là trạng thái pending conversion, không phải phần thưởng đã dùng được hoàn toàn.
- RewardInfo.items được dùng để hiển thị đúng asset native theo client; RewardSync/mail loại body-ID khỏi delta túi để tránh nhận hai lần.
- Packet được đối chiếu receiver client: Elf 6001 {elfData}; Curios full init 5200; Orb 6401 {data}; Connect 6801 {connects}. Không thêm packet tự đoán như 5209.
- ItemPillService: cap chung -802/-804, config expPillDailyCount/energyPillDailyCount, bonus PrivilegeConfig + CuriosEcho + FashionBath; reset ngày theo lịch server như alchemy. Login/1200 trả useRecords; heartbeat chuyển ngày gửi refresh 1201.
- Phát exp/item4 của đan theo AssetsUseConfig.rewards; giữ 308 đan thuộc tính vĩnh viễn. EXP vẫn theo luật level/stage hiện hữu, chưa thay logic tiêu EXP khi lên cấp.
- Lỗi save item/activity/token làm session phải đọc lại state khi retry, không tiếp tục tin snapshot đã mutate.
- Cash callback lưu fulfillment receipt cùng player reward/entitlement; retry sau lỗi mail/Transaction chỉ finalize từ receipt, không grant lại. Mail phụ dùng eventKey idempotent; amount/user/product mismatch bị reject.
- Placeholder random_connect chưa có pool chuẩn được preflight trước consume của item/mail và resolver nạp. Các gói có loại placeholder này chưa thể hoàn tất mua; không coi chặn là đã sửa gameplay. Luồng callback đã-thu-tiền cho sản phẩm chưa hỗ trợ cần chính sách pending fulfillment riêng trước mở bán.

## 3. Kiểm thử đã chạy

| Kiểm tra | Kết quả |
|---|---|
| Native theo config | 470 ID × 2 route = 940 lượt; body-ID không nằm trong items |
| Toàn bộ case lỗi native trước đó | 474 case / 47 rương PASS đúng ownership và consume |
| Đan tức thời | 150/150; thưởng ×count, cap đổi ID, reset ngày, bonus thẻ/Bí bảo/áo tắm |
| Receiver native từ bundle client | 4 hàm thật chạy isolated VM PASS; không thay cho UI E2E |
| Cash crash/retry | Lỗi finalize Transaction và Mail, load player mới khi retry; 2 lần save/2 order/2 mail, không grant lại |
| Token/cash regression | 11 + 11 checks PASS |
| Activity7 | 58 assertions PASS; concurrent cash 8 checks PASS |
| Ngoại quan | 2.192 ID, 234 assertions PASS |
| Core | 714 bảng PASS |
| Production WS S1 | Mua 11000015/16/17/20, mở 90027/90202/90214, code+mail+retry, pill shared cap, DB/readback/relog PASS |
| Cleanup QA WS | player/code/mail remaining=0 |
| Native UI | Đã thử đăng nhập bằng account QA riêng, dừng ở 100%; chưa PASS |
| Cleanup QA UI | Account và player remaining=0; tab đã đóng |
| Full production fixture cuối | 940 row: 821 basic fixture, 114 fail-closed, 5 pending; không coi 821 là native-OK toàn bộ |

Lưu ý hồi quy: Activity7 test cũ ban đầu phát sinh background save thiếu mock; đã thêm preload đúng PlayerService cho fixture và chạy lại sạch. Các câu kiểm đan dùng RoleLevelConfig.lv để tách grant khỏi luật EXP khi lên cấp; không dùng test đó làm bằng chứng đổi luật level.

## 4. Native UI blocker và phạm vi chưa kiểm chứng

Client log: TypeError: Illegal invocation tại prototype.send (index.html:682) → egret flush → sendCheckAccount. Lỗi xuất hiện trước khi vào game, không phải phản hồi mở rương. Đã xem source: _nativeSend được bind ở egret wrapper, nên chưa có đủ bằng chứng để đoán sửa receiver. Không thay wrapper/client hoặc điều tra input-freeze đang tạm dừng. Chỉ có Codex In-app Browser trong danh sách trình duyệt kết nối ở lượt thử này.
Các số PASS ở trên là contract/WS, không che native-visual failure. Cần test trên trình duyệt/client hoạt động hoặc xử lý riêng lỗi đăng nhập này trước khi nghiệm thu UI. Chưa tự bypass cảnh báo hay đăng nhập người thật.

## 5. P4: preview chuyển dữ liệu nhận sai — chưa áp dụng

Đọc cả bag, native ownership và purchase records. Hai subject S1 sau đều có record 11000015/16/17/20; toàn bộ ID dưới đây hiện chưa có trong collection native. Không xuất account/name/code.

| Subject ẩn danh | Item túi | Native trước | Dự kiến sau khi duyệt |
|---|---|---|---|
| db9ea1d9a9dc3d45 | 9166 ×1 | Chưa có | Bỏ đúng lượng túi và grant native tương ứng; lưu preimage + repairId |
| db9ea1d9a9dc3d45 | 130601 ×1 | Chưa có | Bỏ đúng lượng túi và grant native tương ứng; lưu preimage + repairId |
| db9ea1d9a9dc3d45 | 156502 ×1 | Chưa có | Bỏ đúng lượng túi và grant native tương ứng; lưu preimage + repairId |
| db9ea1d9a9dc3d45 | 200414 ×1 | Chưa có | Bỏ đúng lượng túi và grant native tương ứng; lưu preimage + repairId |
| a4e820b25e4407de | 130601 ×1 | Chưa có | Bỏ đúng lượng túi và grant native tương ứng; lưu preimage + repairId |

Chưa ghi DB người thật. Nếu duyệt chuyển, cần chặn ghi chồng từ session, backup preimage và commit idempotent; không reroll rương đã mất hoặc bù các giao dịch thiếu ledger. 100139 ×823 vẫn được giữ nguyên, không tự mở.

## 6. ID chưa xử lý xong

Danh sách 114 ID: [reward_release_remaining_20260905.txt](reward_release_remaining_20260905.txt). Rương 90151 chỉ option index 1 bị giữ, option 0 vẫn hoạt động. 111 random, 90021/90022 giữ nguyên. 93065/100803 vẫn gián tiếp bị ảnh hưởng qua rương con.
Nguồn đã kiểm: config production 714 bảng, scripts/_tables_dump, cây local-run2 và inventory hai archive server.zip/1server.zip. Chưa có bảng drop/pool xác suất chuẩn cho các rương này; không coi config tham chiếu phần thưởng đầu vào là bảng rơi hoàn chỉnh. Không tự chia đều xác suất, nâng quality hay chuyển mảnh thành thân.

| ID | Tên | Việc còn thiếu |
|---:|---|---|
| 412 | Hộp quà tuyển chọn Tuyết Bảo | Pool chưa xác minh; giữ nguyên rương |
| 413 | Hộp quà tuyển chọn Tuyết Bảo | Pool chưa xác minh; giữ nguyên rương |
| 90021 | Tự chọn Mảnh tinh linh Ưu tú | Thiếu option gốc; giữ nguyên rương |
| 90022 | Tự chọn Mảnh yêu tinh tinh xảo | Thiếu option gốc; giữ nguyên rương |
| 90151 | Tự chọn hồn ngọc linh trục | Chọn Linh trục: placeholder chưa có pool gốc; giữ nguyên rương |
| 94301 | Túi Phúc Thiên Cơ | Pool chưa xác minh; giữ nguyên rương |
| 94401 | Cẩm nang Nghê Thường | Pool chưa xác minh; giữ nguyên rương |
| 94416 | Túi Phúc Trăng tròn | Pool chưa xác minh; giữ nguyên rương |
| 94418 | Hộp quà phá kén·Nguyên Bảo | Pool chưa xác minh; giữ nguyên rương |
| 94419 | Hộp quà phá kén·Đùi Gà | Pool chưa xác minh; giữ nguyên rương |
| 94420 | Hộp quà Phá Kiển · Phù Tốc Độ | Pool chưa xác minh; giữ nguyên rương |
| 94421 | Hộp quà Phá Kén · Baozi | Pool chưa xác minh; giữ nguyên rương |
| 94422 | Hộp quà Phá Kién - Tiền bạc | Pool chưa xác minh; giữ nguyên rương |
| 94515 | Dịch Lôi kiếp song phẩm ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 94701 | Túi phúc Thu Ý Nồng | Pool chưa xác minh; giữ nguyên rương |
| 94702 | Biểu cảm Công Tử | Pool chưa xác minh; giữ nguyên rương |
| 94703 | Túi phúc Nguyên Tuế mãn | Pool chưa xác minh; giữ nguyên rương |
| 94704 | Biểu cảm rắn nhỏ | Pool chưa xác minh; giữ nguyên rương |
| 94705 | Túi Phúc Chúc Xuân | Pool chưa xác minh; giữ nguyên rương |
| 94706 | Túi Phúc Hoa Mệnh | Pool chưa xác minh; giữ nguyên rương |
| 94707 | Biểu cảm Pháp Hải | Pool chưa xác minh; giữ nguyên rương |
| 94708 | Chăm chỉ luyện túi phúc | Pool chưa xác minh; giữ nguyên rương |
| 94709 | Thiên Diễn Bảo Sảo | Pool chưa xác minh; giữ nguyên rương |
| 94711 | Tông tình gia lễ | Pool chưa xác minh; giữ nguyên rương |
| 94712 | Biểu cảm Bát Giới | Pool chưa xác minh; giữ nguyên rương |
| 94713 | Hộp quà kỷ niệm | Pool chưa xác minh; giữ nguyên rương |
| 94715 | Hộp quà Thu Ái | Pool chưa xác minh; giữ nguyên rương |
| 94716 | Biểu cảm Chồn Tuyết | Pool chưa xác minh; giữ nguyên rương |
| 94718 | Khánh lễ Nguyên Chính | Pool chưa xác minh; giữ nguyên rương |
| 94719 | Huyền Cơ Bảo Sao | Pool chưa xác minh; giữ nguyên rương |
| 94720 | Biểu cảm tiểu mã | Pool chưa xác minh; giữ nguyên rương |
| 94721 | Đại lễ năm mới | Pool chưa xác minh; giữ nguyên rương |
| 94722 | Biểu cảm Bà ngoại | Pool chưa xác minh; giữ nguyên rương |
| 94724 | Quà ấm Thanh Dương | Pool chưa xác minh; giữ nguyên rương |
| 94725 | Bạc Tố Ngân Bảo Sào | Pool chưa xác minh; giữ nguyên rương |
| 94726 | Mộc Lan đoan lễ | Pool chưa xác minh; giữ nguyên rương |
| 94727 | Biểu cảm Cửu U Tước | Pool chưa xác minh; giữ nguyên rương |
| 94729 | Hộp quà kỷ niệm 2 năm | Pool chưa xác minh; giữ nguyên rương |
| 94801 | Rương quyết đấu Bang hội | Pool chưa xác minh; giữ nguyên rương |
| 94802 | Hộp Khởi Nguyên Thần Văn | Pool chưa xác minh; giữ nguyên rương |
| 94821 | Kho báu Vùng biển tham lam | Pool chưa xác minh; giữ nguyên rương |
| 94822 | Kho báu Nộ Hải hải vực | Pool chưa xác minh; giữ nguyên rương |
| 94823 | Kho báu vùng biển Trí Vọng | Pool chưa xác minh; giữ nguyên rương |
| 94824 | Kho báu hải vực ngạo mạn | Pool chưa xác minh; giữ nguyên rương |
| 94825 | Kho báu vùng biển Nghi Cụ | Pool chưa xác minh; giữ nguyên rương |
| 94902 | Mảnh Long Châu ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 94904 | Mảnh Thần Nông ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 94908 | Mảnh tiên thực ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 94911 | Mảnh mài ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 94923 | Mảnh bắt ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 94926 | Mảnh luyện đạo ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 94929 | Mảnh Thiền luyện ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 94932 | Mảnh tu luyện bếp ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 94935 | Mảnh đan luyện ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 94938 | Ngẫu nhiên nhận mảnh cỏ | Pool chưa xác minh; giữ nguyên rương |
| 94941 | Mảnh phong thình ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100019 | Xích Viêm Tường Long | Pool chưa xác minh; giữ nguyên rương |
| 100020 | Mảnh yêu linh ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100021 | Mảnh yêu linh ưu tú | Pool chưa xác minh; giữ nguyên rương |
| 100022 | Mảnh tinh linh Tinh xảo | Pool chưa xác minh; giữ nguyên rương |
| 100023 | Mảnh yêu tinh Hiếm | Pool chưa xác minh; giữ nguyên rương |
| 100024 | Mảnh tinh linh Sử Thi | Pool chưa xác minh; giữ nguyên rương |
| 100025 | Mảnh yêu linh Truyền Thuyết | Pool chưa xác minh; giữ nguyên rương |
| 100026 | Mảnh Yêu linh cao cấp ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100030 | Yêu linh ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100031 | Yêu linh Ưu tú ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100032 | Ngẫu nhiên Tinh linh tinh xảo | Pool chưa xác minh; giữ nguyên rương |
| 100033 | Yêu linh hiếm ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100034 | Yêu linh sử thi ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100035 | Yêu linh Truyền Thuyết ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100036 | Yêu linh cao cấp ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100040 | Thần binh ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100060 | Thần binh đồng hành ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100061 | Thần binh đồng hành hiếm ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100062 | Thần binh đồng hành Sử Thi ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100063 | Ngẫu nhiên Thần binh đồng hành Truyền Thuyết | Pool chưa xác minh; giữ nguyên rương |
| 100139 | Mảnh huyết mạch ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100160 | Mảnh bí bảo ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100170 | Bí bảo Đồng ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100171 | Mảnh bí bảo đồng tinh xảo ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100172 | Bí bảo đồng hiếm ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100173 | Bí bảo Đồng Sử Thi ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100174 | Bí bảo Truyền Thuyết ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100185 | Mảnh bí bảo Đồng ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100190 | Mảnh bí bảo hải trân ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100200 | Bí bảo hải trân ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100201 | Bí bảo hải trân phẩm chất Hiếm ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100202 | Bí bảo hải trân quý hiếm ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100203 | Bí bảo hải trân sử thi ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100230 | Bí bảo ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100231 | Bí bảo tinh xảo ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100232 | Bí bảo hiếm ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100233 | Bí bảo Sử Thi ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100250 | Bí bảo ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100251 | Bí bảo tinh xảo ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100252 | Bí bảo hiếm ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100253 | Bí bảo Sử Thi ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100501 | Thần văn Hiếm ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100502 | Thần văn Sử Thi ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100503 | Ngẫu nhiên Thần văn Truyền Thuyết | Pool chưa xác minh; giữ nguyên rương |
| 100641 | Tài nguyên ngẫu nhiên 30 phút | Pool chưa xác minh; giữ nguyên rương |
| 100642 | Tài nguyên ngẫu nhiên 2 giờ | Pool chưa xác minh; giữ nguyên rương |
| 100643 | 8 giờ tài nguyên ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100701 | Ngẫu nhiên 1 cấp Linh Trục | Pool chưa xác minh; giữ nguyên rương |
| 100702 | Tinh trục cấp 2 ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100703 | Trục linh cấp 3 ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100704 | Linh Xu cấp 4 ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100705 | Tinh linh 5 cấp ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100706 | Linh trục cấp 6 ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100707 | Linh trục cấp 7 ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100708 | Linh trục 8 cấp ngẫu nhiên | Pool chưa xác minh; giữ nguyên rương |
| 100709 | Ngẫu nhiên linh trục cấp 9 | Pool chưa xác minh; giữ nguyên rương |
| 101000 | Rương tiêu diệt Yêu Tôn tầng 1 | Pool chưa xác minh; giữ nguyên rương |
| 101310 | Cẩm nang phòng thủ tranh phong | Pool chưa xác minh; giữ nguyên rương |

## 7. Deploy, backup và an toàn

- Production backup: /linhhoasu/_ai_workbench/backups/reward_release_20260905_063510. Có preimage của 13 file cũ; 2 service mới có rollback xóa đúng đường dẫn.
- Staging đã kiểm: /linhhoasu/_ai_workbench/temp/reward_release_20260905_063510. Không đụng dist/admin/DB process.
- S1/S2 chung source: dừng cả hai, copy đúng file, khởi động S1 và QA rồi khởi động S2. Không rollback đã xảy ra trong deploy thành công.
- Postcheck hash 15/15 khớp, ready S1/S2 HTTP 200, PM2 6/6 online. Bot reconnect tăng dần sau restart; không báo 580/580 trước khi đủ.
- Health snapshot cuối: [{"status":"ok","real":580,"virtual":580,"totalSlots":2466,"multiplier":2,"invalid":0},{"status":"ok","real":580,"virtual":580,"totalSlots":2466,"multiplier":2,"invalid":0}].
- Local source được áp dụng patch theo baseline production, không chép đè toàn cây; 15 file nội dung khớp candidate khi chuẩn hóa CRLF.
- Backup local source: _ai_workbench/backups/reward_release_local_pre_20260905/; production baseline candidate: _ai_workbench/temp/reward_release_20260905/baseline.json.
- Không sửa client/config bin, không restart Nginx/Mongo/Redis, không commit repair/bù người thật.

## 8. File source thay đổi

| File | SHA-256 production |
|---|---|
| src/handlers/activity.js | 33e63f8f259dc6b58ac4a0cc3fb3aa5c384230a2d2623d07227b15b777ca7536 |
| src/handlers/artifact.js | 790d9d5c2e7f7d97bb68274b31454a82d3398834c021c28f79f963e18a08f7e8 |
| src/handlers/basic.js | ad753ff0daaf2033ad7f8b7a86302c65fd0c85eeb5f1e96d93984b07dc9f3001 |
| src/handlers/compat.js | 1281a70597613cb05f5ad3fa18eb6d1c4298a3016744f3785100c40b24ab6cfe |
| src/handlers/curios.js | cca0e2dfe124b34183ee3b07e48401498c3d204fc6bac8e76d8631cfb47d5753 |
| src/handlers/elf.js | 11180bfd882a7c8047352c4d321897cbd5137c932cc37abb322b9134874602c8 |
| src/handlers/item.js | effea17b9201aaa00aeb8b90101ecd1e00266e9643b191b04f0172f4711c7abf |
| src/handlers/mail.js | e1ec936b73a7fcd6c284efed59b7f8b5f7134c01e068e4a0685bdf7d85cc6ab2 |
| src/handlers/recharge.js | 43c3fc0eb114d688aea1f64edaa159a0c047c1fb70c1a86be565602864e51ae5 |
| src/handlers/valhalla-formation.js | 9f0186a6d1602b40b51987258af8868bfec62c28aa879f755e2f5849ad9a6590 |
| src/services/ItemPillService.js | 3690e7f35a80ff6225dd5d4a749fe54c51adc2f90e937c6026165cc7905204dc |
| src/services/NativeItemRewardService.js | 12ef3f83e4e26cf0e3b0ec4d79330b3ee832e8fb5a139c51997b5de328bfdf3a |
| src/services/RechargeRewardResolver.js | 8ef5e74a014f9858a590b2580ebac946064246d199d99988d33e9ae14365de9f |
| src/services/RewardGrantService.js | f25929821bbc643d358b8d5f398b1d0f67113439249895e5a58ba91f38d3b6e6 |
| src/services/RewardSync.js | c9e327f4caf68b69764c39c796874a6db8c8eca3403dfe6550a99262c2247dcd |

## 9. Lỗi triển khai/test và chống lặp

| Lỗi | Nguyên nhân | Xử lý | Tránh lặp |
|---|---|---|---|
| VPS thiếu acorn | Dependency QA chỉ có local | Upload parser vào staging/tools, không cài vào app production | Kiểm runtime dependencies trước test |
| Trích client function bị kéo cả comma expression | parseExpressionAt trả SequenceExpression | Chọn FunctionExpression đầu tiên rồi kiểm node type | Không eval cả chuỗi minify |
| Test exp sai kỳ vọng | Fixture vượt ngưỡng level, RoleLevelConfig dùng lv | Kiểm dưới ngưỡng rồi giữ test logic level riêng | Không đổi logic game chỉ để test xanh |
| Cash regression lệch mã lỗi | Thêm mismatch guard trả mã mới cho amount | Giữ AMOUNT_MISMATCH contract | Test error contract trước deploy |
| Activity7 test phát sinh save timeout | Fixture chưa mock savePlayer | Preload stub memory và chạy lại | Fixture không kết nối DB |
| UI dừng 100% | Illegal invocation ở WebSocket wrapper | Ghi blocker, cleanup exact QA; chưa sửa client | Không gọi WS PASS là UI PASS |

## 10. Bước tiếp theo để hoàn tất

1. Duyệt preview 2 subject / 5 bản sao để chuyển đúng native, không bù trùng; hiện chưa sửa dữ liệu cũ.
2. Cung cấp/định vị bảng drop chuẩn cho 114 ID pending và quy tắc Curios duplicate; triển khai từng họ sau đủ contract.
3. Kiểm native UI trên trình duyệt/client hoạt động; mở khóa nghiệm thu S2 sau giờ mở, không bypass.
4. Khép kín toàn bộ 694 payId, specialized entitlement, quota code đồng thời đa process và paid callback pending fulfillment; các phần này chưa đủ acceptance để gọi P2 hoàn tất.
5. Reconcile cash receipt/log và cleanup retention có thiết kế; không xóa receipt chống trùng tùy tiện.
