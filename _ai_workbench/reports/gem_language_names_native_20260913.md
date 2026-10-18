# Cập nhật tên Hồn ngọc native trong game — 13/09/2026

- Đã đổi tên LanguageConfig level 11–100 của type 23–28 theo tên thuộc tính cụ thể; ví dụ `25101` = “Hồn ngọc sinh mệnh tấn công cấp 11”, `25105` = “Hồn ngọc tốc độ tấn công cấp 11”, `25996` = “Hồn ngọc thủ tốc độ cấp 100”.
- Không còn chuỗi “loại 23/24…” trong tên native của các item mới.
- Deploy language binary + index cache token `20260913_gem_names_v1` qua CAS, backup `/linhhoasu/_ai_workbench/backups/gem_language_names_20260913_pre`; không restart server/game process.
- Verify: local binary decode đúng mẫu tên, live language HTTP 200, served hash khớp candidate. Admin catalog đã được chỉnh riêng trước đó (level 30–100 ẩn).
