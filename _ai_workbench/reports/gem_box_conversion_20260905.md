# Đã chuyển túi Hồn ngọc lỗi cho người chơi — 05/09/2026

## 1. Tóm tắt công việc

Theo yêu cầu người dùng, đã rà S1/S2 và chuyển **265 người chơi, 8.466 túi** từ item trung gian không dùng được sang rương dùng được cùng cấp, tỷ lệ **1:1**.

| Server | Người được chuyển | Túi cấp 1 | Túi cấp 5 | Tổng |
|---|---:|---:|---:|---:|
| S1 | 265 | 396 | 8.070 | 8.466 |
| S2 | 0 | 0 | 0 | 0 |

**nicky đã có `100081 ×3` và `100085 ×30`**, không còn `100091/100095`. Số lượng trước và sau giữ nguyên. Không mở rương, không random quà, không tự khảm hay đổi đội hình.

Việc xử lý người chơi khác cùng lỗi được thực hiện bằng chuyển trực tiếp toàn bộ số túi lỗi còn tồn kho. **Không gửi thêm thư bù cùng số lượng**, vì vừa đổi vừa gửi lại sẽ nhân đôi giá trị thưởng. Chưa bù cho giao dịch đã mất vật phẩm không có bằng chứng; phạm vi hoàn tất là tồn kho sáu ID trung gian.

## 2. File/thư mục đã thay đổi

- Dữ liệu production: `lhs_s1001.players`, đúng 265 document người thật có item lỗi. Không sửa người không có lỗi, không sửa bot, không thay source/config.
- Trong mỗi document: bỏ key `items.100091–100096` có tồn kho dương, cộng đúng lượng vào `items.100081–100086` tương ứng; thêm `gemBoxRepairLedger.gem-placeholder-to-usable-v1-20260905`.
- Không thay level, EXP, tiền, native gem đã sở hữu, task claim, mail, recharge, guild hoặc các field khác. Kiểm hash BSON của dữ liệu ngoài `items` và ledger trước/sau từng người.
- Tool: `_ai_workbench/tools/repair_gem_boxes_20260905.js`, `run_gem_box_conversion_20260905.py`, `verify_gem_conversion_20260905.py`.
- Evidence preview: `_ai_workbench/temp/gem_box_conversion_20260905_084925.json`.
- Evidence commit: `_ai_workbench/temp/gem_box_conversion_20260905_085020.json`.
- Hậu kiểm độc lập: `_ai_workbench/temp/gem_conversion_verified_20260905.json`.
- Báo cáo này có MD/HTML; session report đã cập nhật. Backup báo cáo cũ tại `_ai_workbench/backups/gem_conversion_reports_pre_20260905/`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi/rủi ro | Nguyên nhân | Xử lý | Chống lặp |
|---|---|---|---|
| Túi trùng tên nhưng không có nút dùng | `100091–100096` là type99, không có use config | Đổi sang `100081–100086`, cùng cấp, có useType102 | Validate type/icon/param/level trước commit |
| Inventory online ghi đè sửa DB | Session còn snapshot cũ | Chỉ dừng `lhs-s1001`, để flush; scan lại sau dừng rồi commit | Không dùng preview trước dừng làm số liệu commit |
| Chạy lại phát bù lần hai | Không có dấu giao dịch sửa | Ledger cùng atomic update; lần hai không chuyển thêm | Ledger + source hết + compare-and-swap |
| Thay đổi inventory bởi tác vụ khác | DB có writer ngoài game | CAS theo nguyên trạng `items` và ledger chưa tồn tại; conflict sẽ dừng | Không ghi đè toàn player |
| Rollback làm mất tiến trình mới | Restore full document sau khi chơi tiếp | Backup full preimage, nhưng không tự restore hàng loạt | Chỉ phục hồi sau đối chiếu field/ledger và khóa writer |
| Bù và đổi cùng một lỗi | Đếm hai lần giá trị item | Chỉ thay thế số item tồn kho, không phát mail bổ sung | Tách replacement khỏi compensation |

Không gặp conflict hay lỗi dữ liệu trong lượt chuyển. Self-test kiểm sáu cặp, count không hợp lệ/overflow và chạy lặp PASS.

## 4. Kỹ năng / kinh nghiệm mới

- Mapping rõ sáu cấp: 100091→100081, 100092→100082, 100093→100083, 100094→100084, 100095→100085, 100096→100086.
- Mỗi player được ghi **preimage EJSON bảo toàn BSON, flush/fsync trước update**; atomic Mongo update đồng thời $inc target, $unset source và $set ledger.
- So sánh item không liên quan và dữ liệu ngoài inventory/ledger sau từng update; không dùng tổng số item đơn thuần để kết luận bảo toàn.
- Nếu source item xuất hiện lại trên player đã repair, script không tự đổi lần hai mà báo `SOURCE_REAPPEARED_AFTER_REPAIR` để truy luồng phát còn lỗi.

## 5. Trạng thái hiện tại và xác minh

- Commit S1: 265/265 người thành công, 8.466/8.466 túi, invalid/conflict0.
- Sau commit: số người còn item trung gian thuộc sáu cấp =0 ở cả S1/S2.
- Chạy **commit lần hai**: convertedPlayers0, convertedUnits0, remainingPlayers0. Ledger265 người giữ nguyên.
- Sau restart S1: rà lại còn0 người giữ placeholder; ledger265 tồn tại. S2 không sửa hoặc restart.
- Hậu kiểm riêng nicky: `100081=3`, `100085=30`; ledger lưu from/to/count chính xác. Không còn100091/100095.
- Backup production: `/linhhoasu/_ai_workbench/backups/gem_box_conversion_20260905_085020/` có **265 preimage +265 file xác minh**, quyền thư mục700/file600. Danh sách SHA-256 từng file nằm trong evidence hậu kiểm; không đính kèm dữ liệu cá nhân vào báo cáo.
- Ready S1/S2 HTTP200; sáu process PM2 online. PID S2/dist/admin/bot workers giữ nguyên; chỉ S1 restart. Hậu kiểm08:51:48UTC ghi bot S1 đang reconnect300/580, S2 đủ580, virtual580, quái2.466slot,×2,invalid0. Không gọi bot S1 đủ580 trước khi xác minh.
- Không gửi thư bù hoặc phát thêm item ngoài phép thay thế. Không xử lý ngoài họ hồn ngọc (ví dụ5bản sao native của preview cũ khác loại).
- Không kiểm nghiệm UI trên nhân vật người dùng. Người dùng tự thử theo hướng dẫn dưới đây.

## 6. Hướng dẫn test và bước tiếp theo

1. **Đăng nhập lại game** để tải túi mới sau bảo trì S1.
2. nicky kiểm có3“Hồn ngọc cấp1 ngẫu nhiên” ID100081 và30“Hồn ngọc cấp5 ngẫu nhiên” ID100085. Popup nay phải có nút Sử dụng.
3. Dùng1túi cấp1: túi còn2, hệ Hồn ngọc thêm1viên cấp1. Dùng1túi cấp5: túi còn29, hệ Hồn ngọc thêm1viên cấp5. Không bắt buộc thử cả hai nếu muốn giữ item.
4. Đóng/mở bảng, relog để kiểm bảo toàn. Dừng test và gửi ảnh+giờ nếu túi bị trừ mà thiếu thưởng.
5. Nếu người chơi khác xuất hiện lại túi không dùng được, gửi ID/tên và nguồn nhận. Sửa nguồn mới trước, không tự bù lặp theo số lượng lịch sử.
6. Với người đã mất đồ cần bù riêng: cần receipt/source/time xác thực và trừ các khoản đã chuyển/đã nhận để chống trùng. Chưa có case mất đồ được chứng minh trong đợt này.

### Phục hồi khi cần

Giữ backup server nêu trên; không dùng restore cả DB. Khi có yêu cầu rollback, dừng process game bị ảnh hưởng, đọc ledger và postcondition của đúng player. Nếu target count hoặc dữ liệu liên quan đã thay đổi vì người chơi dùng rương, không khôi phục preimage mù. Đối chiếu giao dịch phát sinh rồi chỉ đảo đúng delta chưa bị sử dụng. Phiên này không cần rollback.
