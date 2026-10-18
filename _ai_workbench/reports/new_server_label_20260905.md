# Sửa dòng “Máy chủ mới” hiển thị S1

## 1. Tóm tắt công việc

Đã sửa và triển khai S1/S2: dòng “Máy chủ mới” hiển thị **S2**, còn server đang chọn và danh sách gần đây giữ nguyên theo tài khoản.

## 2. File/thư mục đã thay đổi

- Source local/production: `linhhoasu/lhs/newServer/src/handlers/serverList.js`.
- `newServerName` trước lấy tên server mặc định; `newServerData` lấy server gần nhất của tài khoản. Nay cả hai lấy server công khai, hoạt động và đã tới giờ mở, có openTime gần nhất; hòa ngày lấy serverId lớn hơn.
- Bổ sung handler3075 mà client dùng để làm mới thông tin máy chủ mới, cùng logic lựa chọn với SDK2820.
- Không sửa defaultServerData, recentLoginServers, lịch/status/isNew trong DB, tài khoản hoặc save người thật; không sửa client.
- Tools: snapshot_new_server_label.py, test_new_server_label.js, qa_new_server_label.js, deploy_new_server_label.py dưới `_ai_workbench/tools/`.
- Evidence: `_ai_workbench/temp/new_server_label_20260905/snapshot.json`, `deploy_20260905_114618.json`.
- Backup production: `/linhhoasu/_ai_workbench/backups/new_server_label_20260905_114618/serverList.before.js`; local `_ai_workbench/backups/new_server_label_local_20260905/`.

## 3. Lỗi và giải pháp

| Lỗi | Nguyên nhân | Xử lý | Chống lặp |
|---|---|---|---|
| Nhãn server mới ghi S1 | API dùng selected/recent thay vì newest | Tách newest payload khỏi default/recent | Test ba trường độc lập |
| Làm mới latest chưa có handler | Client gọi3075 nhưng server chưa register | Thêm3075 dùng cùng hàm chọn | Test endpoint thật |
| Server ẩn hoặc chưa mở bị gợi ý | Chọn theo sốID đơn thuần sẽ sai | Lọc running/status/openTime trước sort | Case đóng/chưa mở/thời điểm ranh giới |

## 4. Kinh nghiệm

Nhãn “Máy chủ mới” và server được chọn là hai chức năng khác nhau. Không ép tài khoản sang S2, không chỉnh lịch mở chỉ để đổi nhãn.

## 5. Kiểm thử và trạng thái

- Unit9checksPASS: lọc server đóng/chưa mở, ranh giới thời gian, giữ default/recent.
- Live3075 trả S2, endpoint public `/ws-s2` đúng. SDK2820 mặc địnhS1 trả newServerName=S2/newServerData.serverId=1002 nhưng defaultServerData.serverId=1001 và recentS1 vẫn nguyên.
- QA riêng cleanup account/player về0; không log mật khẩu/token. Không thao tác nhân vật người dùng.
- Hash production/local khớp; S1/S2ready200 vàPM2online. Restart riêng hai game process vì dùng chung source; không restartDB/dist/admin/Nginx.
- S2 giữ mở công khai, không whitelist hoặc đóng theo18:55/19:00. Chỉ đóng khi người dùng yêu cầu.
- UI thực tế do người dùng kiểm, không gọi APIpass là visualpass.

## 6. Cách kiểm nghiệm

Tải lại trang rồi đăng nhập: dòng phía trên “Máy chủ mới” phải ghiS2. Dòng chọn máy chủ phía dưới có thể vẫn làS1 nếu bạn đang chọnS1 — đây là đúng và không bị ép đổi.
