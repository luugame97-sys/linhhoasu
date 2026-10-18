# Fix không đổi được ảnh đại diện mặc định — 22/09/2026

## Kết quả

- Đã xác định lỗi ở client: tab Ảnh đại diện không đưa lựa chọn mặc định `id=0` vào danh sách; server `tag1801`, `type=102,id=0` đã chấp nhận.
- Thêm item mặc định vào danh sách native, không đổi điều kiện sở hữu hay avatar hiện tại. Người chơi chọn lại ảnh mặc định sẽ gửi đúng `id=0`.
- Tài khoản `votinh135/S2` hiện là nhân vật `Lão Tổ`, avatar đang lưu `113114`; audit chỉ đọc, không đổi hồ sơ.

## Kiểm chứng / phát hành

- VM client: item `id=0` xuất hiện đúng một lần, chọn được; item khác không bị ảnh hưởng. Node syntax PASS.
- HTTP index/addon production: **200 + hash PASS**, không restart game process, `productionWrites=0`.
- Backup: `/linhhoasu/_ai_workbench/backups/avatar_default_ui_20260922/`.

Sau phát hành, người chơi tải lại game bằng Ctrl+F5 rồi vào Ngoại quan → Ảnh đại diện → chọn ô mặc định.
