# Sửa nguồn nhiệm vụ phát túi Hồn ngọc không dùng được

## 1. Tóm tắt công việc

- Đã xác định nguồn có lỗi: TaskConfig10083 thưởng100091×3; task.claimTaskRewards gọi trực tiếp raid.addRewardToPlayer, nên bỏ qua router gemPack đã sửa. Type99 bị cộng vào items, không có nút Sử dụng.
- nicky S1 đã nhận nhiệm vụ10083 (status30), giữ100091×3 và100095×30. Kết quả phù hợp nguồn túi cấp1; chưa có ledger đủ để kết luận nguồn30túi cấp5.
- Đã sửa hai handler nhận thưởng nhiệm vụ, áp dụng cho toàn bộ placeholder100091–100096 cấp1–6. Phần thưởng mới vào Hồn ngọc native, không vào túi dưới dạng placeholder.
- Đã deploy đúng một file task.js lên S1/S2, backup và hash guard. Không sửa client và không thao tác nhân vật thật.

## 2. File/thư mục đã thay đổi

- Source chính: `linhhoasu/lhs/newServer/src/handlers/task.js`.
- Tools: `audit_gem_sources_20260905.py`, `check_gem_template_20260905.py`, `test_gem_task_source_20260905.js`, `deploy_gem_task_source_20260905.py`.
- Snapshot/audit/deploy evidence: `_ai_workbench/temp/gem_source_fix_20260905/`.
- Production backup: `/linhhoasu/_ai_workbench/backups/gem_task_20260905_084504/task.js.before`.
- Local backup: `_ai_workbench/backups/gem_task_pre_20260905/task.js`.
- Report MD/HTML này và session_report MD/HTML; backup báo cáo trước cập nhật tại `_ai_workbench/backups/gem_task_report_pre_20260905/`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Xử lý | Tránh lặp |
|---|---|---|---|
| Nhận100091×3 nhưng không dùng được | Nhiệm vụ đi qua hàm cộng túi cũ | Với gemPack, gọi RewardGrantService và đưa kết quả vào rewardInfo.gems | Test actual entrypoint, không chỉ router |
| Client không nhận Hồn ngọc mới | Phản hồi task chỉ có rewardInfo.items | Trả gems và push3900/3901 trước callback | Kiểm state và packet cùng lúc |
| Thưởng thành công trước save | Task dùng background save | Riêng claim có gem phải await save; lỗi thì invalidate session và không trả success | Test save-failure và replay |
| Test đếm tổng gem sai | ensureGemInfo có default3gem | So trước/sau retry, kiểm đúng3reward và UID | Không nhầm baseline với quà phát thêm |

## 4. Kỹ năng / kinh nghiệm mới

- Cùng một ID có thể đúng ở code/mail nhưng lỗi ở nhiệm vụ vì entrypoint không dùng router chung.
- Config có31 tham chiếu cấp phát gem placeholder: Task10083,6ShopConfig và Activity3/12. Không phải mọi tham chiếu đều đang hỏng: shop/activity đã có nhánh resolve; cần test theo luồng cụ thể.
- Hàm PlayerGrantService.applyGivePayloadToPlayer và raid.addRewardToPlayer vẫn có nhánh bag trực tiếp. Đã nhận diện rủi ro, nhưng không chuyển đổi rộng toàn bộ caller trong patch task này vì cần contract sync/delivery riêng.

## 5. Trạng thái hiện tại

- 12case =6cấp×2handler PASS; nhiệm vụ gốc10083 cấp đúng3Hồn ngọc cấp1; retry không grant thêm; save-failure không success.
- Staging production + fixture chạy source production sau deploy PASS; core714bảng PASS; Activity7 hồi quy PASS.
- Sau restart readyS1/S2 đạt200; cả6PM2process online; bot đang reconnect, virtual580,slot2466,×2,invalid0. Không restart dist/admin/DB.
- Audit trước sửa:265người thật S1 đang có placeholder; tổng100091×396 và100095×8070. S2 không thấy. Đây là tồn kho, không phải kết luận từng người mất quà hoặc đủ điều kiện repair.
- Không chuyển/bù tồn kho lịch sử. **3túi cấp1+30túi cấp5 của nicky vẫn giữ nguyên và chưa có nút dùng**. Patch này chặn phát sai từ nguồn nhiệm vụ cho lần nhận mới, không tự sửa dữ liệu cũ.
- Template mặc định `/linhhoasu/lhs/LHS-file/src/data/player_template.json` không tồn tại trên VPS hiện tại; chưa có bằng chứng30túi cấp5 được phát từ template.

## 6. Hướng dẫn người dùng test và việc tiếp theo

1. Trên nhân vật test chưa nhận nhiệm vụ10083, chụp danh sách Hồn ngọc trước khi nhận. Không reset nhiệm vụ người thật.
2. Nhận nhiệm vụ: phải thêm3Hồn ngọc cấp1 vào hệ Hồn ngọc, không xuất hiện3placeholder100091 trong túi. Popup phải có3Hồn ngọc.
3. Đóng/mở bảng, đăng nhập lại và kiểm số lượng. Nhận lại nhiệm vụ không được phát thêm.
4. Những túi cũ phải xử lý riêng. Có thể lập preview đổi1:1 từ100091–100096 sang100081–100086 (cùng cấp, có nút dùng) hoặc resolve thành gem; cần chốt cách và phạm vi trước khi thay inventory.
5. Truy nguồn lịch sử100095, kiểm các đường GM/direct give trước khi khẳng định không còn nguồn nào phát sai. Không gọi patch task là hoàn tất toàn bộ nguồn.
