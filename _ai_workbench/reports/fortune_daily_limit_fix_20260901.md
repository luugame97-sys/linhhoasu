# Fix production: Gói Vận Thế miễn phí 1 lượt/ngày

## 1. Kết quả

- Đã triển khai production `103.116.105.154` cho Shop ID `11018000`.
- Mỗi người chỉ nhận được `Bánh bao ID 4 ×10` đúng một lần trong mỗi ngày GMT+8.
- Request lặp cùng ngày trả `DAILY_LIMIT_REACHED`, không phát quà và không tăng counter.
- Hai request đồng thời chỉ có một request thành công.
- Sau 00:00 GMT+8, lượt nhận được mở lại; F5, đăng nhập lại hoặc restart không bypass ledger.
- Không thu hồi hoặc trừ bánh bao lịch sử.

## 2. Source production

| File | SHA-256 sau deploy |
|---|---|
| `/linhhoasu/lhs/newServer/src/handlers/item.js` | `6176b6ea089ee5b3609318edf24d81ee4906dc86c62d99063477d4481a89c922` |
| `/linhhoasu/lhs/newServer/src/handlers/activity.js` | `ef1406ca7045138fe4c4a98b1973bdca16725f6ecd6c55d1593d5e9f98b8f482` |

Backup production:

- `/linhhoasu/_ai_workbench/backups/fortune_daily_limit_pre_20260901_085230/`

## 3. Cơ chế fix

- Policy phía server đọc `ActivityShopConfig[activityId][11018000]`: `limit=1`, `limitType=1`.
- Chỉ chấp nhận activity type 43 đang active và có Shop `11018000` trong `giftIds`.
- Ledger bền vững: `activityInfo.dailyShopClaims.<activityId>.11018000` gồm `dayKey`, `count`, `lastClaimAt`.
- Ngày được tính theo GMT+8.
- Khóa tuần tự theo `userId`; mỗi request nạp lại snapshot mới nhất từ Mongo trước khi kiểm tra.
- Save lỗi sẽ khôi phục session snapshot và không ghi ledger/quà nửa chừng.
- `activityInfo.datas[activityId].buyRecords[11018000]` được đồng bộ từ ledger để UI hiển thị đã hết lượt hoặc reset đúng ngày mới.

## 4. Backfill ngày triển khai

- Quét log ngay trước lúc dừng process, xác định 23 người đã nhận trong ngày GMT+8 hiện tại.
- Đã backfill 23/23 ledger thành `count=1`; hậu kiểm `bad=[]`.
- Không thay đổi số bánh bao hoặc tổng lượt lịch sử.

## 5. Kiểm thử

- Fixture daily-limit: PASS 38 checks.
- Regression guard gói trả phí: PASS 8 checks.
- Remote module syntax/load: PASS.
- `/ready`: HTTP 200, Mongo/Redis healthy.
- `/health`: HTTP 200.
- `lhs-s1001`: online, PID `17221`.
- Không restart dịch vụ khác:
  - `lhs-dist`: PID `30824` giữ nguyên.
  - `lhs-admin`: PID `30856` giữ nguyên.
  - `lhs-real-bots`: PID `24659` giữ nguyên.
- Không có `SyntaxError`, `ReferenceError` hoặc `Cannot find module` mới.

## 6. Sự cố preflight

- Lần chạy đầu dừng trước khi thay source/DB vì Python cũ không hỗ trợ `datetime.fromisoformat`.
- Source và DB vẫn nguyên; nhánh rollback thận trọng đã restart riêng `lhs-s1001` một lần dù chưa cần.
- Đã thay bằng `datetime.strptime`, sửa rollback để preflight lỗi không restart, xác minh hash/health rồi mới chạy checkpoint thành công.

## 7. Evidence

- Deploy evidence: `_ai_workbench/temp/fortune_package_audit/fortune_daily_limit_deploy_20260901_085230.json`.
- Post-deploy snapshot: `_ai_workbench/temp/phase2_recharge_prod_20260901_085341/`.
- Fixture: `_ai_workbench/tools/test_fortune_daily_limit.js`.
- Deploy/rollback tool: `_ai_workbench/tools/deploy_fortune_daily_limit_prod.py`.

