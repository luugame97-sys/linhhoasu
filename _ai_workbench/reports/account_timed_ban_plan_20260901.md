# Kế hoạch khóa có thời hạn cho tài khoản trục lợi Gói Vận Thế

## 1. Kết luận kiểm tra hiện trạng

Production `103.116.105.154` hiện **có khóa tài khoản**, nhưng chỉ ở dạng thủ công/vô thời hạn:

- API admin: `POST /api/admin/players/:userId/ban-account` và `unban-account`.
- Trạng thái: `Account.status=0/1`.
- Khi ban, production đã tăng `authVersion` và gọi `AuthSessionService.revokeAccount(accountId)`; token đăng nhập cũ được thu hồi.
- Login WebSocket cũng kiểm `Account.status` và `authVersion`, nên token giả/cũ không bypass được sau khi ban.
- Trang LHS-admin có nút Chặn/Bỏ chặn và nhập lý do.

Tuy nhiên cơ chế hiện tại **chưa đáp ứng khóa 100 ngày + thông báo lý do**:

- Schema không có `banUntil`, `banReason`, `bannedAt`, `bannedBy`, `banHistory`.
- Toàn bộ 284 account hiện chỉ có `status=1`; 0 account có các trường thời hạn/lý do.
- 36 tài khoản mục tiêu hiện đều active.
- Login account bị ban đang bị gộp thành `AUTH_FAILED / Tài khoản hoặc mật khẩu không đúng`.
- Không có tự động mở khóa khi hết hạn.
- API ban chưa đá WebSocket đang online ngay lập tức.
- Gửi mail sau khi ban không giải quyết được thông báo login, vì account đã không vào game để đọc mail.

Audit read-only:

- `_ai_workbench/temp/account_ban_capability_20260901_094542/audit.json`
- SHA-256: `408333af03dee8a01a7af1edc2b4b840eccb5cdca2ae633505e309c5113487c1`

## 2. Khả năng hiển thị thông báo

Client hiện đã hỗ trợ hiển thị trực tiếp chuỗi server:

- SDK login lấy `errInfo` rồi gán thành `strMsgTxt`.
- Login UI gọi `showMsgBox(strMsgTxt)` khi `iResult != 0`.
- Vì vậy có thể hiển thị thông báo chi tiết bằng server-side, không cần sửa skin/UI client.

Thông báo đề xuất:

> Tài khoản đã bị khóa 100 ngày do lợi dụng lỗi nhận bánh bao Gói Vận Thế. Thời gian mở khóa: 10:30 10/12/2026 (GMT+7). Số lần vi phạm: 310.031; bánh bao nhận sai: 3.100.310. Nếu cần khiếu nại, vui lòng liên hệ quản trị viên.

Không nên hiện mật khẩu, User ID nội bộ hoặc dữ liệu tài khoản khác.

## 3. Thiết kế chuẩn cần bổ sung

### 3.1. Schema Account

Thêm:

```js
banStatus: "active" | "banned"
banUntil: Date | null
banReason: String
banCode: String
bannedAt: Date | null
bannedBy: String
banMeta: {
  source: String,
  eventId: Number,
  shopId: Number,
  exploitCount: Number,
  exploitBaozi: Number,
  evidenceId: String
}
banHistory: [{ action, at, by, reason, until, meta }]
```

Giữ `status` để tương thích admin cũ, nhưng mọi authorization phải gọi chung một hàm `resolveAccountBanState(account, now)`.

### 3.2. Ban resolver server-authoritative

Kết quả có cấu trúc:

```js
{
  banned: true,
  permanent: false,
  until: 1796883000000,
  remainingDays: 100,
  code: "FORTUNE_BAOZI_EXPLOIT",
  reason: "Lợi dụng lỗi nhận bánh bao Gói Vận Thế"
}
```

- Nếu `banUntil <= now`: tự mở khóa nguyên tử, xóa trạng thái active ban, ghi history `auto_unban` rồi cho login.
- Nếu còn hạn: trả `ACCOUNT_TEMP_BANNED` và message tiếng Việt.
- Nếu ban vĩnh viễn: trả `ACCOUNT_BANNED`.
- Không dùng `status=0` đơn độc để tính thời gian.

### 3.3. Chặn đầy đủ mọi đường vào

Áp dụng resolver tại:

1. HTTP `/api/user/login`.
2. SDK auth/tag đăng nhập tài khoản.
3. Server-list bằng password hoặc userToken.
4. WebSocket tag 1 trước khi load player.
5. Tạo/chuyển role.

Khi ban:

- tăng `authVersion`;
- revoke toàn bộ token bằng account index;
- push tag 9 với message rồi đóng tất cả WebSocket của mọi role thuộc account;
- không cho session đóng ghi snapshot cũ đè dữ liệu ban (ban nằm trên Account nên tách khỏi Player save).

### 3.4. Admin API/UI

API ban nhận:

```json
{
  "durationDays": 100,
  "reason": "Lợi dụng lỗi nhận bánh bao Gói Vận Thế",
  "code": "FORTUNE_BAOZI_EXPLOIT",
  "meta": {
    "exploitCount": 310031,
    "exploitBaozi": 3100310,
    "evidenceId": "fortune_package_totals_20260901_093320"
  }
}
```

Admin phải hiển thị:

- Đang khóa / hết hạn lúc nào / còn bao nhiêu ngày.
- Lý do và số lần bug.
- Người thao tác, thời điểm, lịch sử gia hạn/mở khóa.
- Nút khóa tạm thời, khóa vĩnh viễn, gia hạn, mở khóa.
- Batch preview 36 người rồi xác nhận hai bước; không khóa ngay từ checkbox một lần.

## 4. Chính sách xử lý đề xuất

Không nên khóa đồng loạt 100 ngày cả trường hợp chỉ bug 4 lần và trường hợp 310.031 lần. Phương án cân đối:

| Số lần bug tối thiểu | Thời hạn đề xuất | Số tài khoản | Tổng bánh bao bug |
|---:|---:|---:|---:|
| ≥10.000 | 100 ngày | 5 | 3.810.650 |
| 1.000–9.999 | 60 ngày | 5 | 238.420 |
| 100–999 | 30 ngày | 5 | 26.270 |
| 10–99 | 14 ngày | 16 | 5.300 |
| 1–9 | 3 ngày | 5 | 360 |

Ưu điểm:

- 5 tài khoản nặng nhất chiếm hơn 93% lượng bánh bao bug và nhận hình phạt 100 ngày.
- Tài khoản vi phạm nhỏ không bị xử ngang người dùng tool/click hàng trăm nghìn lần.
- Dễ giải thích và audit dựa trên `minimumExcessClaims` đã xác minh.

Nếu chủ server vẫn muốn khóa cả 36 người đúng 100 ngày, hệ thống kỹ thuật vẫn hỗ trợ; chỉ cần dùng cùng `durationDays=100` cho batch. Đây là quyết định chính sách, không phải giới hạn kỹ thuật.

## 5. Quy trình triển khai an toàn

### Giai đoạn A – làm cơ chế, chưa ban thật

1. Fetch live source và hash precondition.
2. Backup Account schema, AccountService, AuthSessionService, serverList, HTTPServer/HTTPServer1, account handler, WSServer và LHS-admin.
3. Dựng candidate + fixture hoàn toàn local.
4. Test trên một account QA riêng:
   - ban 5 phút;
   - login HTTP/SDK/server-list/WS đều hiện đúng lý do;
   - token cũ bị revoke;
   - phiên online bị đẩy ra;
   - hết 5 phút tự mở;
   - restart không mất ban;
   - admin unban/gia hạn/history hoạt động.
5. Chỉ restart `lhs-s1001` và `lhs-admin` nếu UI admin cũng được cập nhật; health/rollback gate.

### Giai đoạn B – preview 36 người

1. Tạo JSON batch immutable từ report hiện tại.
2. Readback account/user/name/bug count ngay trước commit.
3. Xuất bảng preview: account, role, thời hạn, mở khóa lúc nào, lý do.
4. Chủ server duyệt chính sách tier hoặc 100 ngày đồng loạt.

### Giai đoạn C – commit ban

1. Backup 36 document Account trước mutation.
2. Ghi ban theo batch ID idempotent; không được ban hai lần khi chạy lại.
3. Revoke token, push message + close online session.
4. Readback đủ 36/36: status, banUntil, reason, authVersion, history.
5. Smoke với account QA đã ban; không đăng nhập bằng account người chơi.
6. Lưu rollback script mở khóa chính xác batch này.

## 6. Test bắt buộc

- Đúng mật khẩu + account ban: thông báo ban, không trả `AUTH_FAILED` chung.
- Sai mật khẩu: vẫn chỉ trả lỗi chung, không làm lộ account có tồn tại/đang ban.
- Token phát trước ban: bị từ chối.
- Token SDK/server-list/WS đều bị chặn.
- Multi-role account: khóa toàn account, không chỉ một role.
- Ban 100 ngày tồn tại qua restart.
- Hết hạn tự mở đúng thời điểm.
- Gia hạn và mở khóa thủ công idempotent.
- Online session nhận message và bị đóng.
- Audit log lưu operator/reason/until/meta nhưng không lưu secret.
- Không ảnh hưởng managed bots hoặc tài khoản không nằm trong batch.

## 7. Trạng thái hiện tại

- Chưa ban bất kỳ tài khoản nào.
- 284/284 account production đang `status=1`.
- 36/36 tài khoản mục tiêu đang active và mapping đúng.
- Redis tại thời điểm audit không có token auth đang tồn tại cho nhóm mục tiêu; runtime TTL cấu hình là 3.600 giây.
- Server healthy, audit hoàn toàn read-only.

