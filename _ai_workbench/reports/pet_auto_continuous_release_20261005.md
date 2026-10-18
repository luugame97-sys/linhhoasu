# Tự động Tinh Linh liên tục / mở nút / gói mua không giới hạn — 05/10/2026

## Kết quả

- Đã triển khai S1–S7. Nút và panel tự động mở cùng bàn Tinh Linh (system206, nhiệm vụ10109); bỏ điều kiện server57 ngày của system229. Không có điều kiện VIP/nạp ở gate cũ.
- Auto thường chuyển sang chu kỳ server3314: mở tối đa8 trứng24/25 đang sở hữu, ghép các cặp đủ phí theo phẩm mục tiêu, tự gộp EXP, lưu xác nhận rồi mới chạy chu kỳ kế tiếp. Ghép nhanh giữ chức năng xử lý pet đang có. Không tự mua trứng hoặc dùng trứng26.
- Không còn dừng do listener tạm ẩn ứng dụng. Có mã lượt chạy, không để callback cũ nối tiếp/dừng lượt mới; hủy/đóng bàn dừng vòng tiếp theo. Giao dịch đã được server nhận vẫn chốt trong phạm vi một lô. Retry1/2/4/5giây giữ nguyên intent, receipt chống trừ đồ lần hai.
- Tự dừng khi hết hành động hợp lệ: hết trứng/nguyên liệu dùng được, hoặc bàn đầy không còn cặp đủ điều kiện; giữ khóa/xuất chiến/Hồn Thú/cấp>1/phẩm mục tiêu, giữ EXP vượt trần.
- Đồng bộ thời gian hồi trứng và reset số trứng24 ảo sau ACK xác nhận. Client cũ cộng số trứng hồi phục vào GetItemCount nhưng1202 không cập nhật timeRecords; đó là một nguyên nhân hiện trứng nhưng server từ chối mở.
- Gói ngày4000004 và tuần4000103: limit=0,limitType=0; giữ tag301/302, giá/quà/payId và xác thực đơn mua. Gói khác không đổi. Mỗi giao dịch vẫn qua kiểm tra giá và chống nhận quà trùng.

## Nguyên nhân

- Live SystemConfig229 có condition type5/value57/cond4 và openDay57. Chỉ bật visible không đủ vì panel.openCheck cũng kiểm229.
- Native auto dừng khi APPLICATION_ON_PAUSE, cặp EXP đầu vượt trần hoặc nhóm đầu thiếu phí. Callback không có token lượt: RAM thực thi callback native xác nhận hủy rồi chạy lại vẫn gửi request mở trứng thứ3 từ lượt cũ.
- V3 dùng quyết định/trạng thái server thay vì vòng3300/3302/3311 phụ thuộc số lượng item client và animation/callback cũ.

## Kiểm chứng

- Local và VPS candidate/installed: **24 nhóm server +42 kiểm tra client +7 nhóm gói mua +4 nhóm access PASS**. Bao gồm lô8/mở liên tục/hết stock/bàn đầy, retry/receipt/save-fault, callback muộn, hủy/chạy lại, pause, EXP, trứng ảo, giá/quà và gói khác giữ giới hạn. Gameplay/payment QA là RAM-only; không gửi đơn mua/callback hoặc chạy auto thử trên player thật.
- Hash6 file installed đúng candidate. 7/7 readiness statusok, Mongo/Redis true. Game/addon/WebGM publicHTTP200; addon hash đúng, HTML đúng phần quản lý sau bỏ beacon Cloudflare.
- Runtime consumer đã kiểm live: /api→S1:8080 và /ws[-sN]→7game node; XtPay/internal/admin recharge callback dùng handler/resolver trong game process đã restart. Admin gateway/dist/bots không nạp policy ShopConfig này nên không cần restart thêm; PID/trạng thái/uptime giữ nguyên.
- Giữ nguyên tab theo yêu cầu trước đó của người dùng đang chơi; không nghiệm thu UI/độ mượt hay mua/ghép E2E trên tài khoản thật. Người dùng cần tải lại trang để nhận addonv3.

## Files / rollback

- Source chính: pet.js, ConfigService.js, config/petAutoAccess.js, config/petPackageUnlimited.js, js/lhs-pet-grid48-v1.js, index.html. Candidate ConfigService/index xây từ preimage live, giữ overlay gemLevel10Choice và các sửa đổi khác.
- Backup/CAS: `/linhhoasu/_ai_workbench/backups/pet_grid48_20261005_154504`; stage `/linhhoasu/_ai_workbench/temp/pet_grid48_20261005_154504`.
- Receipts/tests: `_ai_workbench/temp/pet_auto_continuous_20261005/`; runner `_ai_workbench/tools/release_pet_auto_continuous_20261005.py`. Audit consumer `_ai_workbench/tools/audit_pet_package_consumers_20261005.py`.
- Rollback các file cũ theo preimage/hash CAS, restart7 node tuần tự/readiness. Module mới có thể để lại khi không còn được apply; không hạ capacity48 hoặc xóa/di chuyển pet. Không sửa ledger/đơn thanh toán.
- Client: `https://linhhoasu.lol/index.html?v=20261005_pet_auto_continuous_v3`.
