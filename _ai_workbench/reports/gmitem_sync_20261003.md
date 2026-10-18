# Đồng bộ item game vào WebGM — 03/10/2026

- Đã thêm vào `/linhhoasu/webgame/gm/assets/item/gmitem.txt`:

  `100097;Túi tự chọn Hồn ngọc cấp 10`

- Backup trước thay đổi: `/linhhoasu/_ai_workbench/backups/gmitem_sync_20261003_20261003_171022/gmitem.txt`
  - SHA-256: `e7b0e5c38ac40cdac64fb48b63068fedadab31ca0f5631b0da4d856031cf05db`
  - Không chứa ID `100097`.
- File sau cập nhật SHA-256: `f73bdb1dade464e551cee20bae0791f299952f257b165cc2f3bc01f769b7f48e`.
- Read-back file chỉ có đúng một dòng ID 100097; `vht6ur_item_catalog()` trả `allowed=true` và đúng tên.
- Không restart game/WebGM, không ghi player/DB; admin chỉ cần reload trang WebGM để thấy item.

Lưu ý: lần swap đầu đã hoàn tất nhưng script read-back gặp lỗi tên codec local; bước xác minh sau đó đã kiểm tra lại hash, backup, dòng catalog và PHP whitelist thành công.
