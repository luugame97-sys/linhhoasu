# QA Log - VUSA full-client hybrid trên VPS test

- Target: `http://192.168.200.151:81/?hybrid=20260831_v2`
- VPS: test-only `192.168.200.151`
- Account: `codexqa2026` (không ghi mật khẩu)
- Client main: `main.min_vi_1e47377c.js?v=20260901_vusa_local_login_ui_v2`
- Thời điểm phát hiện mất input: `2026-08-31T17:17:42.777Z` (`2026-09-01 00:17:42` Asia/Saigon)
- Thời gian từ lúc bắt đầu checkpoint tới xác nhận lỗi: khoảng `165 giây`.

## Chuỗi QA

1. Đăng nhập thành công, vào map và thấy nhân vật hoạt động.
2. Tại khoảng 11 giây, click avatar mở `Thông tin cá nhân`; click ngoài panel đóng được.
3. Tại khoảng 62 giây, click avatar mở lại panel thành công.
4. Đóng panel và chờ; tại khoảng 127 giây, click avatar không còn mở panel.
5. Kiểm chứng lại bằng nhiều target độc lập:
   - Avatar góc trái.
   - Menu đáy màn hình.
   - Ô trang bị vũ khí.
   - Nhiệm vụ góc phải.
6. Tất cả target không phản hồi; nhân vật, thú/cảnh và bong bóng thoại vẫn tiếp tục hoạt động.

## Console client

- Không có `Illegal invocation`, `TypeError`, `Unhandled` hoặc fatal mới tại thời điểm đơ.
- Chỉ còn ba log từ lúc load:
  - Một `NotAllowedError` do autoplay audio.
  - Hai cảnh báo spine chưa tải xong tài nguyên và sẽ phát lại.

## Server cùng thời điểm

- `/ready`: HTTP `200`; MongoDB và Redis đều healthy.
- `lhs-s1001`: online, PID `12088`, restart count `1` (lần restart có chủ đích khi đổi env đăng ký; không restart trong QA).
- WebSocket vẫn gửi heartbeat tag `11` đều mỗi 10 giây qua thời điểm đơ:
  - `01:17:34` msgUid `51`, queueDepth `1`.
  - `01:17:44` msgUid `52`, queueDepth `1`.
  - Tiếp tục tới `01:18:24` msgUid `56`, queueDepth `1`.
- Không thấy handler fatal/timeout/queue backlog tương ứng thời điểm mất input.
- Các dòng bcrypt `CXXABI_1.3.8` trong error log là lịch sử cũ; process hiện tại vẫn online và login QA đã thành công.

## Kết luận giới hạn

- **FAIL:** full-client VUSA + login local trên cùng server test vẫn tái hiện mất input toàn canvas.
- Lỗi xảy ra trước 3 phút, nên không cần chờ đủ 10 phút để đạt tiêu chí thất bại.
- Lượt này loại trừ giả thuyết chỉ cần thay toàn bộ asset/main VUSA là hết lỗi.
- Chưa chứng minh mutation client cụ thể; không patch/rollback tiếp chỉ dựa trên suy đoán.
