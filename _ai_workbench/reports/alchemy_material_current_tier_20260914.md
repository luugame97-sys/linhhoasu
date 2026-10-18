# Chuẩn hóa rơi Nội đan/Tinh huyết theo bậc hiện tại — 14/09/2026

## Kết quả

- Bỏ hoàn toàn nhánh ngẫu nhiên rơi các bậc cũ trong `AlchemyMaterialDropService`.
- Mỗi lượt rơi hợp lệ trên bản đồ thường chỉ chọn đúng bậc hiện tại suy ra từ `AlchemyFormulaConfig`/cảnh giới; không suy theo cấp nhân vật, cấp trang bị hoặc cấp bản đồ.
- Áp dụng đồng nhất cho Nội đan (`2001–2015`) và Tinh huyết (`2201–2215`), đủ 15 bậc.
- Giữ nguyên nguồn và số lượt roll theo giao dịch thật; bot, map không hợp lệ, hành động không thường và claim lỗi không phát vật phẩm.

## File chính

- `linhhoasu/lhs/newServer/src/config/alchemyMaterialDrops.json`
  - version `20260914_current_tier_only_v1`
  - `currentTierWeightBps: 10000`
- `linhhoasu/lhs/newServer/src/services/AlchemyMaterialDropService.js`
  - `pickTier()` trả thẳng bậc hiện tại khi policy 10.000 bps.
- Bằng chứng live: `_ai_workbench/temp/alchemy_material_current_tier_20260914_20260913_175840.json`.

## Kiểm thử

- `node scripts/test-alchemy-material-sources.js`: **17 PASS**; 148 công thức, 46 nguyên liệu thô, 30 nguyên liệu quái, 15 nguyên liệu trồng, 58 map thường; 100.000 lượt mô phỏng cho kết quả 19.915 Nội đan và 5.010 Tinh huyết, chỉ ở bậc hiện tại.
- `node scripts/test-farm-alchemy-fix.js`: **52 PASS**.
- `node scripts/test-alchemy-craft.js`: **19 PASS**.
- Tất cả harness đều `productionWrites=0`, `networkAttempts=0`.
- Manifest hậu kiểm live ghi nhận stage 45 trả `2015`/`2215`, hash sau deploy khớp candidate và `/ready` các cổng 8080/8083/8084 đều `200`; PM2 S1/S2/S3 online.

## Phát hành

- VPS `103.116.105.154`, restart có phạm vi: `lhs-s1002`, `lhs-s1001`, `lhs-s1003`.
- Backup: `/linhhoasu/_ai_workbench/backups/alchemy_material_current_tier_20260914_20260913_175840`.
- Không sửa DB/player, không phát bù, không rollback dữ liệu.

## Ranh giới cần lưu ý

- Bảng game hiện có không chứa bảng xác suất official cho các bậc cũ. Vì vậy đã chuẩn hóa phần **chọn bậc** về 100% bậc hiện tại; tỷ lệ kích hoạt cũ vẫn giữ 20% cho Nội đan và 5% cho Tinh huyết (`chanceBps` 2000/500), chưa thể gọi đó là tỷ lệ official nếu chưa có nguồn gốc xác thực.
- Nếu có bảng/packet native chính thức về tỷ lệ kích hoạt, chỉ cần cập nhật policy và chạy lại cùng bộ kiểm thử; không cần đổi luồng persistence.
