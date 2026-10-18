# Sửa lệch ô checkbox “Cộng điểm nạp” (01/09/2026)

## 1. Tóm tắt

- Xác minh ảnh người dùng gửi: checkbox bị Bootstrap áp `margin-left: -1.5em`, nên bị đẩy ra ngoài khung vàng.
- Đã chỉnh riêng khối này sang flex, bỏ margin âm và căn checkbox, nhãn, dấu `!` trên cùng một hàng.
- Ô nhập điểm nạp riêng vẫn tự xuống dòng đúng khi bật.

## 2. File thay đổi

- Production: `/linhhoasu/webgame/gm/admin/index.php`.
- Candidate: `_ai_workbench/temp/xu_checkbox_alignment_candidate_20260901/admin/index.php`.
- Tool deploy: `_ai_workbench/tools/deploy_xu_checkbox_alignment.py`.
- Backup: `/linhhoasu/_ai_workbench/backups/webgm_xu_checkbox_alignment_pre_20260901_115728/`.

## 3. Kiểm tra

- Hash production trước: `d5ea1a8a59e1692159fa0843902ae2799159a280f0303af71fb3aab75330cba2`.
- PHP lint staging: PASS.
- Hash sau: `02480d5b70e581661a2594dd68fd62b5acd5004378476f4cf4fc5438bd549f80`.
- Admin page: HTTP `302`; JavaScript: HTTP `200`; game `/ready`: HTTP `200`.
- Không restart game/WebGM process và không thay đổi dữ liệu.

## 4. Cách kiểm tra

Tải lại WebGM bằng `Ctrl+F5`, mở **Quản lý Xu**. Checkbox phải nằm trong khung vàng, thẳng hàng với chữ **Cộng điểm nạp** và dấu `!`.
