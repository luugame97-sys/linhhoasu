# Sửa lệch bố cục avatar — 16/10/2026

## Kết quả

- Giữ nguyên yêu cầu tạm bỏ qua avatar mới; chỉ sửa lưới `Ảnh đại diện`.
- Logic native trong `main.min_drop200.js` chia mỗi hàng thành tối đa 6 avatar. Addon mặc định trước đó lại chèn `id=0` vào nhóm đang có 6 phần tử, tạo nhóm 7 phần tử và làm item thứ 7 tràn sang hàng phụ.
- Thêm `lhs-avatar-layout-fix-v1.js`: sau `DisguiseAvatarPanel.updateUI`, chuẩn hóa mọi nhóm `tab=-1` thành các chunk tối đa 6 phần tử. Không đổi ID, quyền sở hữu, trạng thái, item hay dữ liệu player.

## Triển khai và bằng chứng

- Đã cập nhật marker trong `linhhoasu/webgame/game/index.html` để tải addon mới.
- CAS trước sửa khớp index live `45697ede3eb563f99316dc3e38910fa4fa7c6e35c3eae6bd00f39ba658be041a`; addon mặc định hiện hữu khớp `30370f47e37adfaf50e5171526b50a926c15e2acf014baa0d850dee36783da8d`.
- Backup: `/linhhoasu/_ai_workbench/backups/avatar_layout_fix_20261016_20261016_020816`.
- Read-back sau swap: addon `afd1e6a46f5f3523f68929460d4a453f24517fefc85c308c040aea9a1e88c580`, index `6e16444ba45b2e2096ba0302fd145fdfcfcebd63fa534ff59a878c05c011c425`; HTTP index/addon đều 200 và hash addon khớp.
- Không restart process, không ghi DB/player; receipt `_ai_workbench/temp/avatar_layout_fix_20261016/deploy_20261016_020816.json`.

## Kiểm thử và giới hạn

- `node --check` addon: PASS.
- Test mô phỏng 7 phần tử: PASS, kết quả hai hàng `[6 + 1]`.
- Browser public đã nhận index có marker mới và hiển thị màn hình đăng nhập. Chưa đăng nhập/ mở panel avatar vì không có phiên QA được ủy quyền; do đó chưa claim native E2E bằng tài khoản thật. Người chơi cần Ctrl+F5 rồi mở `Ngoại quan → Ảnh đại diện` để xác nhận trực quan.
