# Tiến độ sửa đăng ký và tạo nhân vật (02/09/2026)

## Đã hoàn thành và đang chạy production

- Đăng ký protocol `2818` và Web `/api/user/register` chỉ tạo account, không tạo nhân vật hoàn chỉnh.
- Response trả `needCreateRole=1/true`, `roles=[]`.
- Khi đăng nhập/chọn S1 bằng `2820`, server tạo role nháp `kungfuId=0` để cấp session.
- Client native phát hiện role chưa chọn hệ, mở `RoleCreateView`; xác nhận lựa chọn gửi tag `3100` rồi mới vào game.
- E2E production `2818 → 2820 → WebSocket tag 1 → 3100`: PASS.
- Web registration account-only: HTTP 201, role count 0, `needCreateRole=true`.
- Account QA đã được dọn sạch sau kiểm thử.

## Chưa hoàn thành

- Chưa có tên dự phòng tuần tự dạng `MG365_xxxxxxx`.
- Fallback hiện tại khi pool tên chuẩn bị trùng/hết tên là `HanhGia_<server>_<chuỗi ngẫu nhiên>`.
- Vì vậy chưa đáp ứng yêu cầu “tài khoản sau tăng đúng một số và dùng chung toàn server”.

## Trạng thái production hiện tại

- `lhs-s1001`: online, PID `23294`, restart count `1332`.
- `/ready`: HTTP 200; MongoDB và Redis healthy.
- `lhs-dist`, `lhs-admin`, `lhs-real-bots` đều online.
- Không có lỗi auth/role mới trong log hậu kiểm.
- Hash live 5 file role-flow đã được đọc lại; syntax PASS.

## Bước tiếp theo đề xuất

1. Giữ luồng native hiện tại.
2. Thêm bộ đếm atomic trong MongoDB dùng chung cho toàn bộ server, ví dụ sequence `mg365_role_name`.
3. Chỉ cấp `MG365_0000001`, `MG365_0000002`... khi client không gửi tên hợp lệ hoặc fallback pool thất bại.
4. Giữ unique index `Player.name`, dùng transaction/findOneAndUpdate `$inc` để không trùng khi nhiều account tạo cùng lúc.
5. QA concurrency, relog, restart và multi-server trước khi deploy.

Không triển khai sequence `MG365` trong lần kiểm tra tiến độ này.
