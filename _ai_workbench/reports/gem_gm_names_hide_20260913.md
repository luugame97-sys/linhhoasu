# Chỉnh tên/ẩn Hồn ngọc trên WebGM — 13/09/2026

- Đã đổi tên 114 item level 11–29 của type 23–28 theo mẫu tên level 10, ví dụ: `25101 = Hồn ngọc sinh mệnh tấn công cấp 11`, `25105 = Hồn ngọc tốc độ tấn công cấp 11`, không còn hiển thị “loại 23/27”.
- Đã ẩn khỏi catalog WebGM 426 item level 30–100. Các item vẫn tồn tại trong game config và không bị xóa khỏi server/client.
- Catalog không đổi item 60/61; giới hạn gửi riêng 60/61 vẫn `1.000.000.000/item`, item khác `999.999`.
- Deploy catalog có CAS + backup `/linhhoasu/_ai_workbench/backups/gem_gm_names_20260913_pre`; read-back mẫu tên PASS. Evidence: `_ai_workbench/temp/gem_level100_20260913/gm-names-deploy.json`.
- Chỉ thay tên/visibility WebGM; chưa đổi LanguageConfig native trong game vì không muốn ghi đè gói ngôn ngữ live ngoài phạm vi admin catalog.
