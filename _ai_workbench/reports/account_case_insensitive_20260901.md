# Đồng bộ tài khoản không phân biệt hoa/thường (01/09/2026)

## 1. Tóm tắt

- Đã xác minh lỗi `AUTH_SESSION_MISMATCH` khi tài khoản đăng nhập bằng `Ohokaka12321` nhưng token/server handshake dùng canonical `ohokaka12321`.
- Đã triển khai cơ chế account ID không phân biệt hoa/thường trên production `103.116.105.154`.
- Tài khoản vẫn được lưu một bản canonical lowercase; không tạo thêm bản ghi theo từng kiểu viết hoa.
- Mật khẩu vẫn phân biệt hoa/thường và được giữ nguyên khi xác thực; `userId`/role ID vẫn so sánh chính xác.

## 2. Phạm vi thay đổi

| Thành phần | Cách xử lý |
|---|---|
| Đăng ký/tìm tài khoản | `AccountService.normalizeAccountId()` trim + lowercase trước khi validate, tạo và truy vấn |
| Login HTTP/SDK | Xác thực bằng account ID canonical; response `uid`, token và role dùng canonical |
| Chọn server | Sau SDK auth, chuẩn hóa lại account ID từ Mongo trước khi tạo session/bind role |
| WebSocket tag `1` | Chuẩn hóa `platformuid` và `authSession.accountId` rồi mới so sánh; vẫn giữ kiểm tra `userId` nhân vật chính xác |
| Dữ liệu hiện có | Không migrate/xóa dữ liệu; audit tài khoản mục tiêu chỉ có một record `ohokaka12321` |

## 3. Kiểm thử production

### 3.1 Login HTTP

Đã kiểm thử với mật khẩu QA do chủ dự án cung cấp; mật khẩu không ghi vào log/báo cáo. Năm biến thể đều trả HTTP `200`, đăng nhập thành công, cùng một nhân vật và cùng canonical account ID:

| Input | Canonical trả về | Nhân vật | Token tạm |
|---|---|---|---|
| `Ohokaka12321` | `ohokaka12321` | 1 | Đã xóa sau test |
| `ohokaka12321` | `ohokaka12321` | 1 | Đã xóa sau test |
| `oHokaka12321` | `ohokaka12321` | 1 | Đã xóa sau test |
| `OHOKAKA12321` | `ohokaka12321` | 1 | Đã xóa sau test |
| `ohOKaka12321` | `ohokaka12321` | 1 | Đã xóa sau test |

### 3.2 SDK auth → chọn server → WebSocket

- Input handshake: `Ohokaka12321`.
- SDK trả `uid=ohokaka12321`, 1 role.
- WebSocket tag `1` được chấp nhận, `loginResult=0`.
- `session.accountId=ohokaka12321` và `authSessionMismatch=false`.
- Token chẩn đoán đã bị revoke/xóa sau test; không tạo dữ liệu nhân vật mới.

### 3.3 Hậu kiểm artifact/runtime

| Kiểm tra | Kết quả |
|---|---|
| SHA-256 candidate/live `account.js` | `0831425cf06ec45c363a3691c28d15e75646018b03963ffc07a9fce9abcf09ca` — khớp |
| SHA-256 candidate/live `serverList.js` | `de6a1479116c3e0d494870ec2a6796b7d399d01c33eaa7db0369e51c977b6c2b` — khớp |
| Node syntax trên VPS | `SYNTAX_OK` |
| PM2 `lhs-s1001` | `online`, PID `23793` |
| Game HTTP readiness | `ready=200` |
| WebSocket health | `ws=200` |
| Process khác | Không restart `lhs-dist`, `lhs-admin`, `lhs-real-bots` |

- Contract test local: `12 checks PASS` (canonicalization SDK, WebSocket, role ID và reject account khác).

Evidence đầy đủ: `_ai_workbench/temp/account_case_insensitive_prod_verify_20260901.json`.

## 4. Lỗi và cách tránh lặp lại

| Lỗi | Nguyên nhân gốc | Cách xử lý | Phòng tránh |
|---|---|---|---|
| Đăng nhập được nhưng chọn server báo `AUTH_SESSION_MISMATCH` | `platformuid` từ client giữ chữ hoa, token giữ lowercase; backend so sánh chuỗi trực tiếp | Canonical hóa hai account ID trước khi so sánh | Mọi điểm nhận account ID phải gọi `normalizeAccountId()` |
| Có nguy cơ tạo nhiều tài khoản cho các kiểu hoa/thường | Nếu chỉ sửa UI/client mà không sửa truy vấn server | Canonical hóa trước validate/create/find/auth | Giữ unique index/lookup trên account ID lowercase |
| Script E2E không đọc được JSON do log stdout | Handler ghi log cùng stdout với kết quả JSON | Parser dùng `JSONDecoder.raw_decode` tìm object có marker `result=PASS` | Tool chẩn đoán phải tách log và payload hoặc parse theo marker |

## 5. Trạng thái và giới hạn

- Production đã chạy bản fix và test live PASS.
- Không cần đổi tên tài khoản trong Mongo; tài khoản hiện tại đã là lowercase canonical.
- Mật khẩu không được canonical hóa. Người chơi phải nhập đúng mật khẩu; chỉ account ID được bỏ phân biệt hoa/thường.
- Nếu phát hiện các record cũ trùng nhau khác hoa/thường ở tài khoản khác, cần lập migration riêng có backup và chọn record giữ lại; không tự động gộp trong hotfix này.

## 6. File đã thay đổi

- Production source: `/linhhoasu/lhs/newServer/src/handlers/account.js`.
- Production source: `/linhhoasu/lhs/newServer/src/handlers/serverList.js`.
- Candidate/backup: `_ai_workbench/temp/account_case_insensitive_candidate_20260901/` và `/linhhoasu/_ai_workbench/backups/account_case_insensitive_pre_20260901_143330/`.
- Tool kiểm thử: `_ai_workbench/tools/test_login_case_ohokaka_remote.py`, `_ai_workbench/tools/e2e_account_case_server_select_remote.py`.
- Tool hậu kiểm read-only: `_ai_workbench/tools/verify_account_case_insensitive_prod.py`.
