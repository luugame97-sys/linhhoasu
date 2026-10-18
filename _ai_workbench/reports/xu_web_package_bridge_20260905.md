# Đánh giá nối Xu Web với mua gói trong game

## 1. Tóm tắt công việc

Có thể tích hợp mua gói trong game bằng Xu Web với tỷ lệ người dùng yêu cầu: **1 tệ = 1.000 Xu Web**. Phiên này chỉ kiểm tra và đề xuất, chưa triển khai bridge hoặc thay số dư.

## 2. Source đã đối chiếu và artifact

- Đã đọc trực tiếp production `/linhhoasu/webgame/gm/api/user_api.php` và `/linhhoasu/lhs/newServer/src/handlers/compat.js`.
- Xu Web: `account.ptb` ở SQL WebGM; mua Webshop khóa dòng ví rồi trừ Xu, gửi vật phẩm qua mail.
- Action `exchange_coins` hiện trả lỗi “Tính năng Xu Web đã tắt. Vui lòng dùng Webshop.” Không đồng nghĩa ví Xu không dùng được: mua Webshop vẫn có đường dùng ví.
- Game tag1230 hiện trừ item1001 theo priceR, hoặc item1002/1003 theo khu vực; không đọc trực tiếp ví SQL Xu Web trong handler này.
- Tool read-only: `_ai_workbench/tools/inspect_xu_game_bridge_20260905.py`.
- Snapshot: `_ai_workbench/temp/xu_game_bridge_20260905/`; không lấy config.php/credential hay xuất số dư người chơi.
- Không sửa source production, DB, quyền truy cập, lịch server hoặc mua thử gói.

## 3. Phương án và rủi ro

| Cách nối | Ưu điểm | Giới hạn |
|---|---|---|
| Đổi Xu Web sang token game1001 | Tận dụng tag1230, ít thay đổi phần mua gói | Hai ví, chuyển theo nhân vật/server; một số gói cash-only/chain không dùng token; chuyển thất bại cũng cần ledger |
| Mua gói trừ trực tiếp Xu Web | Người chơi không cần đổi tiền trước; đơn hàng gắn đúng payId/server/role | Cần bridge xác thực, order ledger SQL + game, recovery khi timeout |

**Đề xuất cách thứ hai:** thêm lựa chọn thanh toán Xu Web ở luồng mua gói. Không thay đường thanh toán cũ, không trừ cả Xu lẫn token cho cùng một đơn.

## 4. Contract triển khai đề xuất

1. Client gửi payId và số lượng; server xác thực account/role/server, hạn mức, entitlement và khả năng cấp đủ thưởng. Không tin client về giá hoặc số dư.
2. Tạo quote từ `PayConfig.priceR × 1.000 × số lượng`; dùng số nguyên Xu, kiểm overflow/phần lẻ, có thời hạn quote và phiên bản catalog.
3. Hiển thị xác nhận: tên gói, giá tệ, Xu phải trả, ví trước/sau, server và nhân vật nhận.
4. SQL khóa ví và lưu orderId/idempotencyKey bền vững cùng debit/reservation. Một request retry không được trừ lần hai.
5. Bridge nội bộ có xác thực gửi đúng orderId/payId/amount tệ/server/role đến backend. Dùng resolver và entitlement gói, không chỉ gửi mail/item hoặc cộng VIP cho có.
6. Reward, native ownership và entitlement phải được lưu cùng receipt phía game; sync đến session online và kiểm relog.
7. Timeout không rõ đã grant hay chưa: giữ trạng thái pending và query/reconcile theo orderId; không hoàn Xu ngay nếu có thể game đã cấp. Chỉ hoàn khi xác nhận đơn không thực hiện được; retry/recovery không được double grant/refund.
8. Không cộng lại Tích Donate khi tiêu Xu nếu lúc nạp ví đã tính; cách ghi tích nạp/VIP trong game cần chốt riêng theo giá tệ của gói, không lấy số Xu làm số tệ.
9. Giữ ví Xu theo account; luôn ràng buộc nhân vật nhận thuộc account và đúng S1/S2. Không truyền mật khẩu WebGM sang client hoặc endpoint không được xác thực.
10. Gói thiếu resolver/pool/reward/activation bị chặn **trước khi trừ Xu**. Những gói còn lỗi ở các báo cáo item không được coi là đã dùng được chỉ vì bridge thanh toán hoạt động.

Ví dụ: 6tệ→6.000Xu,68tệ→68.000Xu,128tệ→128.000Xu. Đổi tỷ lệ không có nghĩa được đổi giá catalog gói.

## 5. Trạng thái và kiểm tra

- Feasibility: có nền tảng walletSQL, native purchase resolver và receipt game để mở rộng.
- Chưa tồn tại bridge trừ trực tiếp Xu Web trong các đường đã đọc. Chưa khẳng định toàn bộ cổng thanh toán/route khác đã được audit.
- Chưa triển khai, chưa test debit/credit thật hoặc E2E. Không hứa toàn bộ694payId dùng được nếu family chưa có contract.
- Khi triển khai phải test: đủ/thiếu Xu, giá giả, sai role/server, double-click, hai session, crash giữa debit/grant, retry/refund, gói đã mua, daily/period, native ownership/entitlement, online/offline/relog.

## 6. Bước tiếp theo

Chốt hướng trừ Xu trực tiếp tại nút mua gói hay chuyển token; sau đó snapshot/backup, làm bridge và xác nhận đúng vài gói đại diện trước mở theo từng family. Phiên này chưa thực hiện các bước mutation đó.
