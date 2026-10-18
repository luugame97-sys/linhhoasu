# Kế hoạch gia cố xác thực Linh Họa Sư

Ngày audit/triển khai: 31/08/2026  
Trạng thái: lớp strict cốt lõi đã triển khai production; tính năng quên mật khẩu được người dùng hoãn lại.

## 0. Cập nhật sau triển khai

Đã hoàn thành:

- Bỏ fallback sai mật khẩu ở `3074`, `2820`, tạo/chọn/xóa role.
- Human WebSocket bắt buộc token, đối chiếu account/user/server và `authVersion`; thất bại đóng socket code 1008.
- Thêm `authVersion`, `passwordChangedAt`, token index theo account, revoke theo account và TTL 3.600 giây.
- Migrate 172 account hiện có sang `authVersion=1`.
- Thu hồi 2.046 auth token cũ trước cutover.
- Bật `USER_CLIENT_VALIDATION_ENABLED=1`, `SDK_AUTH_PASSWORD_STRICT=1`, `ALLOW_AUTO_REGISTER=0`.
- Reset admin đổi từ `123456` sang mật khẩu ngẫu nhiên mạnh, không ghi plaintext vào audit detail; ban account thu hồi token.
- Chỉ restart `lhs-s1001`; bot/distributor/admin giữ PID.

Nghiệm thu live:

- Sai password: 3074/2820 bị từ chối, không token, `lastLoginTime` không đổi.
- WS thiếu token, token chéo account và token chéo server: bị từ chối, close 1008.
- Đúng password: 2820 → recent server bằng session token → WS → load role PASS.
- WebGM login/role lookup PASS; 580 bot ảo + 290 bot thật hoạt động, chat failure 0; `/ready` 200.
- Token mới đều có đủ identity + `authVersion`, TTL tối đa dưới 3.600 giây; không in token trong audit.

Còn lại sau yêu cầu “quên mật khẩu để sau”:

- Chưa có self-service quên mật khẩu/liên kết SĐT.
- Chưa thêm rate limit Redis theo IP + account.
- Chưa thu hẹp CORS/WS origin vì cần audit Android WebView/H5 origin trước để tránh chặn client thật.

## 1. Kết luận hiện trạng

Lỗi đã được tái hiện có kiểm soát trên production:

- HTTP BinJson `cmd 3074`, `pageId=-1`: mật khẩu sai vẫn trả danh sách server và thông tin role nếu account tồn tại.
- HTTP BinJson `cmd 2820`: mật khẩu sai vẫn trả đăng nhập thành công, `userId` và một auth token mới nếu account tồn tại.
- Public JSON `/api/user/login`: kiểm tra bcrypt đúng và trả `401 AUTH_FAILED`. WebGM đang dùng đường này nên an toàn hơn client game.

Các lỗ hổng xác nhận từ source production:

1. `serverList.handleGetServerDetail()` fallback từ `authAccount()` sang `findAccount()` khi `SDK_AUTH_PASSWORD_STRICT != 1`.
2. `serverList.handleSDKAuth()` fallback theo account khi `ALLOW_AUTO_REGISTER=1` và password không strict.
3. `AccountService.createRole()`, `setActiveRole()`, `deleteRole()` tự fallback sang `findAccount()` dù mật khẩu sai.
4. WebSocket `tag 1` chấp nhận `platformuid/userId` khi không có auth session; nếu biết UID có thể tải player tương ứng.
5. `AuthSessionService` dùng TTL mặc định 86.400 giây, không có `authVersion`, không thu hồi toàn bộ token theo account khi đổi/reset mật khẩu.
6. Public user login và BinJson login chưa có rate limit theo IP + account.
7. Endpoint admin reset password đang dùng chuỗi mặc định yếu `123456`, trả plaintext trong response và đưa plaintext vào audit detail.
8. `runtimeConfig.isOriginAllowed()` và `isWsOriginAllowed()` đang trả `true` vô điều kiện; `CORS_ALLOWED_ORIGINS=*` không thực sự giới hạn origin.

Số liệu snapshot:

- 171 account active; 154 account từng login, 17 chưa từng login, 63 account tạo trong 24 giờ.
- 85 account đã xác thực đúng mật khẩu và đồng bộ vào WebGM.
- 2.033 auth-session Redis còn hiệu lực tại thời điểm audit; TTL hiện là 24 giờ.
- Trong log ngày 31/08: `cmd 2820` xuất hiện 1.057 lần, `cmd 3074` 47 lần; `cmd 2818/2819` không xuất hiện.
- Redis có 297 gameplay session key; phần lớn là bot thật đang chạy.

Probe chẩn đoán đã được dọn sạch: token sinh ra khi tái hiện đã bị thu hồi và `lastLoginTime` của account test đã được khôi phục đúng giá trị trước probe.

## 2. Mục tiêu bắt buộc

- Account sai mật khẩu không nhận được server/role/userId/token.
- Human WebSocket không có token hợp lệ không thể tải player.
- Token chỉ dùng cho đúng `accountId + roleId + userId + serverId`.
- Tạo/chọn/xóa role luôn cần mật khẩu đúng hoặc session đã xác thực đúng.
- Reset/đổi mật khẩu thu hồi toàn bộ session của account.
- Bot managed tiếp tục hoạt động bằng đường xác thực riêng; không mở fallback cho human.
- WebGM và game dùng cùng `AccountService.authAccount()` và cùng quy tắc mật khẩu.
- Không khóa hàng loạt người chơi mà chưa có đường phục hồi mật khẩu.

## 3. Thiết kế bản vá

### 3.1. Chế độ rollout

Thêm biến duy nhất:

```text
AUTH_ENFORCEMENT_MODE=audit|strict
```

- `audit`: giữ hành vi hiện tại nhưng ghi `AUTH_WOULD_DENY` khi mật khẩu/token không hợp lệ; không ghi account/password/token nguyên văn.
- `strict`: từ chối mọi fallback human.

Không dùng nhiều biến rời rạc làm nguồn quyết định. `USER_CLIENT_VALIDATION_ENABLED`, `SDK_AUTH_PASSWORD_STRICT`, `ALLOW_AUTO_REGISTER` chỉ còn tương thích cũ và được kiểm tra startup để tránh cấu hình mâu thuẫn.

### 3.2. Sửa HTTP login

`serverList.js` và `serverList1.js`:

- `3074 pageId=-1`: chỉ trả recent server khi `authAccount(account, password)` thành công; sai mật khẩu trả `servers=[]`, không lộ role/userId.
- `2820`: bỏ fallback `findAccount`; sai mật khẩu trả `ret=-1`, `code=AUTH_FAILED`, không tạo token, không gọi `markRoleLogin`.
- `ALLOW_AUTO_REGISTER=0` cho login. Đăng ký chỉ chạy qua `2821` hoặc `/api/user/register`, không tạo account ngầm trong login.
- Chuẩn hóa lỗi tiếng Việt ở client/WebGM nhưng giữ code máy đọc ổn định.

### 3.3. Khóa thao tác role

`AccountService.js`:

- Bỏ fallback `findAccount()` trong `createRole`, `setActiveRole`, `deleteRole`.
- API nhận một trong hai bằng chứng:
  - mật khẩu đúng qua `authAccount`, hoặc
  - auth session hợp lệ có `accountId/serverId` khớp và quyền thao tác role.
- `2818/2819` trả `AUTH_FAILED` khi không có bằng chứng hợp lệ.
- Legacy bind chỉ giữ trong internal/admin HMAC route, không chạy từ dữ liệu `platformuid` do client gửi.

### 3.4. Khóa WebSocket

`account.js`, `WSServer.js`:

- Human `tag 1` bắt buộc có `userToken` hợp lệ.
- So khớp token với `userId`, `roleId`, `serverId`; bỏ nhánh tải player trực tiếp theo `platformuid/userId`.
- Token thiếu/hết hạn/sai role: trả `AUTH_SESSION_REQUIRED|INVALID|MISMATCH`, sau đó đóng socket.
- Managed bot đi đường riêng: cần `isManagedBot=true`, bot worker token đúng và ID thuộc prefix allowlist. Human không thể dùng cờ bot.
- Không cho guest tự sinh player trên production.

### 3.5. Session và thu hồi

`Account` thêm:

```text
authVersion: integer, default 1
passwordChangedAt: datetime
mustChangePassword: boolean
```

`AuthSessionService`:

- Token chứa `authVersion`, `accountId`, `roleId`, `userId`, `serverId`, `issuedAt`.
- Mỗi lần dùng token phải so `authVersion` hiện tại.
- TTL human đề xuất 3.600 giây; có thể refresh khi WebSocket đang hoạt động, tối đa 24 giờ.
- Tạo index Redis theo account để `revokeAccount(accountId)` xóa toàn bộ token.
- Đổi/reset mật khẩu tăng `authVersion` và gọi `revokeAccount`.
- Không phục hồi token cũ khi rollback.

### 3.6. Rate limit và audit

- Theo account + IP: 5 lần sai/15 phút; theo IP: 30 lần sai/15 phút.
- Áp dụng đồng nhất cho `/api/user/login`, `2820`, `3074 pageId=-1` và reset password.
- Trả thông báo chung, không phân biệt account không tồn tại và sai password.
- Log: hash account có salt server, IP rút gọn, client version, path, reason code; tuyệt đối không log password/token.
- Metrics: `auth_success`, `auth_failed`, `auth_would_deny`, `auth_token_invalid`, `auth_rate_limited`.

### 3.7. Phục hồi mật khẩu

Không mở self-reset chỉ bằng tên account/role vì hệ thống chưa có email/phone đã xác minh.

Trước mắt:

- Thay endpoint reset admin hiện tại bằng password tạm ngẫu nhiên 16 ký tự, đúng policy.
- Chỉ superadmin, bắt buộc reason và xác minh ownership qua role, lịch sử Donate/transaction, ngày tạo hoặc thông tin hỗ trợ phù hợp.
- Plaintext chỉ hiển thị một lần cho admin; không ghi vào log/audit/DB phụ.
- Đặt `mustChangePassword=true`, tăng `authVersion`, thu hồi token.
- Thêm endpoint đổi mật khẩu bằng mật khẩu cũ đúng; WebGM gọi qua API chuẩn, không ghi thẳng MongoDB.

Dài hạn:

- Cho người chơi bind email/phone OTP hoặc tạo recovery code một lần; chỉ lưu hash recovery code.

## 4. Kế hoạch rollout production

### Giai đoạn A — Chuẩn bị và test offline

1. Tải lại source production mới nhất; không dùng snapshot local cũ.
2. Backup source, Mongo `accounts`, metadata role, và manifest Redis auth keys (không xuất token vào report).
3. Viết contract tests cho các đường `3074`, `2820`, `2818`, `2819`, WS tag 1, token revoke, reset password, bot auth.
4. Chạy `node --check`, `npm run test:core-contract`, test auth mới và smoke WebGM.

### Giai đoạn B — Audit mode

1. Deploy code với `AUTH_ENFORCEMENT_MODE=audit`.
2. Chỉ restart `lhs-s1001`; bot process không restart nếu không cần.
3. Theo dõi tối thiểu 60 phút, tốt nhất qua một khung giờ đông người.
4. Thống kê số login đang dựa vào fallback, client version và nhóm account cần hỗ trợ reset.
5. Không lưu mật khẩu hoặc token trong log.

### Giai đoạn C — Mở đường phục hồi

1. Deploy admin reset mạnh + change-password chuẩn.
2. Chuẩn bị quy trình hỗ trợ account không nhớ mật khẩu.
3. Thông báo bảo trì ngắn: sau cutover phải dùng mật khẩu đúng; hướng dẫn liên hệ reset.
4. Ưu tiên 86 account chưa từng xác thực WebGM; không tự reset hàng loạt.

### Giai đoạn D — Canary strict

1. Bật strict trên account QA/disposable hoặc allowlist nhỏ.
2. Test:
   - đúng password → 2820 thành công và có token;
   - sai password → 2820 thất bại, không token, `lastLoginTime` không đổi;
   - sai password → 3074 không lộ recent role;
   - WS token đúng → vào đúng role;
   - thiếu/sai/hết hạn/cross-account token → bị từ chối;
   - 2818/2819 sai password → bị từ chối;
   - WebGM đúng password → login + role lookup thành công;
   - bot thật reconnect/farm/chat bình thường; giả bot bị chặn.
3. Soak 30–60 phút; theo dõi latency bcrypt, lỗi login và reconnect.

### Giai đoạn E — Enforce toàn bộ

1. Chuyển `AUTH_ENFORCEMENT_MODE=strict`.
2. Đặt `USER_CLIENT_VALIDATION_ENABLED=1`, `SDK_AUTH_PASSWORD_STRICT=1`, `ALLOW_AUTO_REGISTER=0` để cấu hình phản ánh đúng code.
3. Xóa toàn bộ `s1001:auth:session:*` cũ vì các token này có thể đã được cấp từ mật khẩu sai.
4. Restart riêng `lhs-s1001`; bot worker tự reconnect bằng đường bot riêng.
5. Không restore token cũ.
6. Theo dõi support/reset và tỷ lệ auth fail ít nhất 24 giờ.

### Giai đoạn F — Hardening tiếp theo

- Thu hẹp CORS/WS origin sau khi audit origin thật của H5, Android WebView và domain/IP production.
- Thêm CSP/HTTPS-only cho endpoint login khi xác nhận client tương thích.
- Chuyển admin reset khỏi password mặc định và xóa plaintext khỏi audit detail.
- Thêm cảnh báo account takeover và lịch sử session cho admin.

## 5. Acceptance gate

Chỉ coi hoàn tất khi:

- 0/100 lần sai password nhận được role/token/player.
- 0 lần WS human không token tải được player.
- Token cross-account/cross-role/cross-server đều bị chặn.
- Reset password làm token cũ vô hiệu ngay.
- Correct password login game + WebGM E2E đều PASS.
- Registration → login → server list → WS → load role PASS.
- Bot thật và bot ảo không giảm count ngoài cửa sổ restart.
- `/ready` 200, Mongo/Redis healthy, không tăng queue/handler latency bất thường.
- Không có password/token trong source, report hoặc log.

## 6. Rollback

- Rollback ưu tiên từ `strict` về `audit`, không quay về code fallback vô điều kiện nếu không thật sự cần cứu dịch vụ.
- Khôi phục source/env từ backup và restart riêng `lhs-s1001`.
- Không hạ `authVersion`, không khôi phục session token cũ, không hoàn tác password reset hợp lệ.
- Nếu client không tương thích token-required, tạm audit có thời hạn và vá client; không mở lại login theo account/UID vô thời hạn.
