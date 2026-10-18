# Bật giao diện nền TW đầy đủ (02/09/2026)

## 1. Tóm tắt

- Đã bật nền xanh đậm `login_bg_tw` cho màn hình đăng nhập production.
- Thay đổi chỉ ở lớp trình bày: ép chọn ảnh TW và bật lớp ảnh TW phủ cảnh animation trắng mặc định.
- Không thay `inChina`, vùng, thanh toán, đăng nhập, điều khoản, sự kiện hoặc gameplay.

## 2. File production đã thay đổi

- `/linhhoasu/webgame/game/js/start.min_52ac8d58.js`
  - Mapping nền mặc định được ép thành `login_bg_tw`.
  - Logic thời gian `login_ld_bg` vẫn được giữ nguyên.
- `/linhhoasu/webgame/game/js/main.min_a6195824.js`
  - Chỉ chuyển phần trình bày login sang nhánh TW: `loadingBGImg.visible=true`, `logo.top=49`.
  - Không sửa `AppInfo.inChina` hoặc các chỗ sử dụng `inChina` khác.
- `/linhhoasu/webgame/game/index.html`
  - Cache token đổi thành `20260902_login_tw_full_visual_v2` để client lấy bundle mới.

## 3. Kiểm thử

| Kiểm tra | Kết quả |
|---|---|
| Node syntax start/main | PASS |
| Contract `forceTw` | 1 |
| Mapping khu vực cũ trong chọn nền | 0 |
| Conditional `AppInfo.inChina` của lớp animation | 0 |
| Cache token mới | 2 vị trí |
| HTTP index/start/main/TW asset | `200/200/200/200` |
| Backend `/ready` | `200` |
| Browser QA sạch | Nền xanh mặt trăng hiển thị đúng; cảnh animation trắng không còn thấy |
| Console | Không có lỗi client mới; chỉ cảnh báo autoplay do chưa tương tác |
| Restart | Không restart backend/Nginx/PM2 |

## 4. Hash và backup

- `start.min_52ac8d58.js`: `0dbcad104e31373d6c8536c9a2bbfd0a196dce88824226fda22e58c0ec4aacb1`.
- `main.min_a6195824.js`: `99b420c57a2271b2ebba7c05fe9c92e8963bfde4600b01acb9852c58dcc18c1e`.
- `index.html`: `a972d8124c57f824812b10322adfa7e4fdbb133ca44987b7e54b22d5d0ddd7dc`.
- Backup trước thay đổi đầy đủ: `/linhhoasu/_ai_workbench/backups/login_tw_full_visual_pre_20260901_171906/`.
- Backup của lần tráo mapping đầu: `/linhhoasu/_ai_workbench/backups/login_tw_swap_pre_20260901_171314/`.

## 5. Trạng thái

- Production đang dùng giao diện TW đầy đủ.
- Người chơi đang giữ tab cũ cần `Ctrl+F5` hoặc đóng/mở lại game.
- Đây chỉ là đổi hình ảnh trình bày; không thay logic game.
