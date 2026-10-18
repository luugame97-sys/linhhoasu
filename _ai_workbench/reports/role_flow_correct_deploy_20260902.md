# Triển khai đúng luồng đăng ký và tạo nhân vật — 02/09/2026

## 1. Kết quả

Đã triển khai thành công trên VPS `103.116.105.154`.

Luồng thực tế:

1. `2818` — chỉ tạo account.
2. `2820` — tạo role nháp và auth token cho server được chọn.
3. WebSocket tag `1` — đăng nhập role nháp.
4. Client native mở `RoleCreateView` vì `roleInfo.kungfuId=0`.
5. Client gửi tag `3100` — lưu lựa chọn hệ/pháp tướng và vào game.

Không cần xây UI mới.

## 2. Thay đổi

- `src/handlers/serverList.js` và `serverList1.js`: protocol `2818` không tạo role khi payload chỉ có account/password (đúng payload của `RegistUI`); trả `needCreateRole: 1`. Nhánh có lựa chọn role rõ ràng vẫn gọi `createRole()`.
- `src/net/HTTPServer.js` và `HTTPServer1.js`: đăng ký web chỉ tạo account, trả `needCreateRole: true`; login có role hiện hữu vẫn cấp token, account chưa có role vẫn đi qua placeholder path của `2820`.
- `src/services/AccountService.js`: thêm tên fallback có entropy khi pool tên mặc định đã bị dùng hết, tránh `CREATE_ROLE_FAILED` do unique index `Player.name`.

## 3. Backup

- Backup trước triển khai thành công: `/linhhoasu/_ai_workbench/backups/role_flow_correct_pre_20260902_015924/`.
- Backup lần thử trước: `/linhhoasu/_ai_workbench/backups/role_flow_correct_pre_20260902_015753/`.

## 4. Kiểm thử

| Kiểm tra | Kết quả |
|---|---|
| Node syntax 5 file production | PASS |
| Core gameplay contract (714 bảng) | PASS |
| Unit contract `2818` account-only + explicit role | PASS |
| Collision fallback tên role | PASS (retry 2 lần) |
| Clone/staging trên VPS, ports 18082/19200 | PASS |
| E2E production `2818 → 2820 → WS tag 1 → 3100` | PASS |
| Web `/api/user/register` account-only | PASS, HTTP 201, roleCount 0, `needCreateRole=true` |
| Dọn account/player/mail/token QA | PASS, không còn account QA |
| `/ready` sau deploy | HTTP 200, Mongo/Redis OK |
| Theo dõi sau restart 20 giây | Process ổn định, không lỗi auth mới |
| Smoke account đã có role sau deploy | HTTP 200, roleCount 1, `needCreateRole=0`, token cấp thành công |

## 5. Runtime

- `lhs-s1001`: online, PID sau deploy `31284`, restart count `1325`.
- `lhs-dist`: PID `30824`, không restart.
- `lhs-admin`: PID `30856`, không restart.
- `lhs-real-bots`: PID `24659`, không restart.

## 6. Lưu ý

- Account mới: đăng ký → đăng nhập/chọn S1 → game tạo role nháp → client native mở màn hình chọn nhân vật → xác nhận để gửi `3100`.
- `RoleCreateView` hiện không có ô nhập tên tự do; tên hiển thị được sinh từ pool chuẩn. Nếu cần người chơi tự gõ tên, đó là yêu cầu UI riêng.
- Không cần xóa hay sửa account/role cũ.

## 7. Xác minh client native

- Bundle `main.min_a6195824.js` có đầy đủ `RegistUI`, `RegisterAccount` → `2818`, `AccountUserLogin` → `2820`, `RoleCreateView`, nhánh `roleInfo.kungfuId=0` mở role view và `sendKungfuSwitch` → `Rpc(3100)`.
- Contract scan client: 5/5 điều kiện PASS; không cần thay đổi binary/client.
