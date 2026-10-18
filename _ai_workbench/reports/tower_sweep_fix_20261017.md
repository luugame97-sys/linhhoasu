# Quét batch Hư Thiên Bảo Điện — 17/10/2026

## Lỗi đã xác minh

Nút quét native trước đây chỉ gọi `sendStartFight(9,"",0)`, tức RPC2300 type9 và server xử lý một tầng `curlayer+1`. `checkSweepIsUnlock()` chỉ kiểm tra mốc hiển thị dựa trên `maxlayer`, chưa có batch RPC/reward settlement. Sau reset, người chơi phải đánh từ tầng1 từng tầng dù đã có lịch sử cao hơn.

## Bản sửa

- Thêm `TowerSweepService` và RPC3705. Mục tiêu quét là `max(0, 10*(floor(maxlayer/10)-2))`, giữ nguyên quy tắc native: maxlayer800→quét đến780, maxlayer500→480.
- Một request cộng dồn reward thường của từng tầng và reward mốc `TowerRewardConfig`; không phát `firstRewards` vì các tầng mục tiêu đều đã thấp hơn hoặc bằng lịch sử. Tăng `curlayer`, `dailyCount`, `score` theo số tầng; không tạo lựa chọn kỹ năng mới trong quét. Nếu đang có kỹ năng chờ chọn, yêu cầu chọn trước.
- Receipt FeatureReceipt tag3705 + requestId chống bấm lặp; fresh player snapshot, role lock, scoped CAS `swordInfo/items/currencies/other_attr_info`, lưu một lần rồi mới trả success. Retry cùng ID trả lại kết quả cũ; không nhận reward lần hai.
- Client addon intercept `ClimbingTowerModel.onFighting(3)`, gọi3705, cập nhật snapshot và hiển thị số tầng đã quét. Luồng đánh từng tầng cũ giữ nguyên cho các nút khác.

## Kiểm chứng và triển khai

- Test batch: 9 ca PASS gồm800→780, không còn tầng, max thấp, first reward không phát lại, receipt replay idempotent, productionWrites/networkCalls0.
- `node --check` service/handler/addon PASS. Rollout 6 file với backup/CAS/atomic swap, restart tuần tự S1→S9, PM2save; process ngoài phạm vi0, readiness9/9, HTTPS2/2.
- Runtime read-back `2026-10-17T06:20:31Z`: source dùng chung `/linhhoasu/lhs/newServer/src/app.js`, RPC3705 route có, client addon có intercept, target800=780/target500=480.
- Chưa native authenticated E2E bấm nút quét và nhận reward bằng tài khoản người chơi; cần hard refresh/relogin trước kiểm tra. Không có tooling tiêu tài nguyên hoặc ghi player.

## Bằng chứng/rollback

- Evidence `_ai_workbench/temp/baodian_sweep_20261017/{tests,verification,deployment}.json`, candidate/baseline.
- Backup `/linhhoasu/_ai_workbench/backups/tower_sweep_20261017_061616`.
- Rollback: kiểm postimage/CAS, khôi phục 6 file từ `before`, restart tuần tự/readiness/hash; không hoàn tác các reward đã commit tự động.
