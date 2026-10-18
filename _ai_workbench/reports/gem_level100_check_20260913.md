# Audit mở rộng Hồn ngọc loại 23–28 — 13/09/2026

- Hiện nhóm loại 23–28 có đúng 6 ID level 10: `25091–25096`.
- Mỗi ID level 10 đang `synthesisLevel=0`, nên server coi là max; `GemComposeConfig` chỉ có đường ghép tới level 10 (3 viên level 9 → 1 viên level 10).
- Không có ID level 11–100 trong `GemLevelConfig`; vì vậy không thể chỉ tăng `maxLevel` hay sửa `GemComposeConfig` hiện tại.

## Có cần tạo item mới không?

**Có.** Cần thêm tối thiểu 6×90 = **540 item template ID mới** cho level 11–100, mỗi loại một ID theo type 23–28. Mỗi ID mới phải có đồng bộ:

1. `GemLevelConfig`: level, baseAttrs/extraAttrs/score, `synthesisLevel` (level tiếp theo) và `synthesisValue=3`.
2. `GemComposeConfig`: 3 ID level trước → ID mới.
3. `AssetsConfig`: type 18, quality/name/desc/icon và metadata hiển thị.
4. `LanguageConfig`: tên/mô tả cho từng ID.
5. `GemShapeConfig`/resource icon: hiện shape chỉ có level 1–10; level 11–100 cần shape/hiển thị mới hoặc client fallback được kiểm chứng.
6. Client bundle/UI: formatter, màu phẩm chất, auto-compose và hard cap hiện có `GemBaseConfig.maxQuickLevel=6`; nếu muốn auto-compose đến 100 phải đổi riêng, không tự mở trong lần này.

## Chi phí ghép

Theo đúng “3 viên cùng loại lên 1 viên level kế tiếp”, từ 1 viên level 10 lên level 100 cần `3^90 = 8.727.963.568.087.712.425.891.397.479.476.727.340.041.449` viên level 10. Nếu quy về level 1 thì cần `3^99 = 171.792.506.910.670.443.678.820.376.588.540.424.234.035.840.667` viên level 1. Đây là chi phí lý thuyết, chưa phải mức economy hợp lý để triển khai production.

Chưa tạo item, chưa sửa config, chưa deploy.
