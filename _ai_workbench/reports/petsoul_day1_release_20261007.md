# Hồn thú từ ngày 1 — 07/10/2026

## Kết quả

- Đã triển khai S1–S7: `SystemConfig[231].openDay` 43 → 1 ở 4 binary runtime (hai server, hai client), thêm override riêng `[231]` trong chính sách server/client `featureDayAccess`, tăng version addon `20261007_feature_day1_v2`.
- Giữ nguyên `conditions`: phụ thuộc System206/Tinh linh và cấp nhân vật135. Không đổi quà, phí, lịch khai mở server hoặc dữ liệu người chơi. Bảng thú cưỡi 5.000 cấp giữ nguyên byte trong binary.
- Index cập nhật query version của binary thành `20261007_hunth_day1_v1` và addon v2; `translationVersion` của mount5000 vẫn giữ nguyên. Local chỉ đồng bộ 4 source file có baseline khớp; binary live dùng candidate từ exact remote để không ghi đè drift local.

## Đính chính audit trước

- Source native đã xác minh `UnlockSystem.isSystemUnlock`, `PetSoulIconRule.checkShowIcon`, `PetSoulMainPanel.openCheck` dùng `conditions`, cache unlock và `forceLockSystem`. Row live231 không có type5 ngày.
- Vì vậy `openDay=43` cũ là metadata còn sót, không đủ chứng minh nguyên nhân người chơi bị khóa. Kết luận trước rằng phải đợi ngày43 là sai. Bản này loại bỏ mốc metadata đó; các tài khoản còn khóa phải kiểm tra cấp135, System206/nhiệm vụ10109, phản hồi unlock hoặc forceLockSystem.

## Kiểm chứng

- RAM-only 32 checks server/config +11 checks client PASS: 4 binary chỉ khác `SystemConfig.231.openDay`, overlay server/client cùng kết quả, idempotent, prerequisites/sentinel giữ nguyên.
- Exact live `upgrade.js` SHA256 `48798f66479633a5dedfac552e3e6d905e8003fc328eabe02455e3ebbc144e41`: ngày1/5/42, cấp134 bị chặn; cấp135+206 đạt; thiếu206 và nhiệm vụ chưa tới bị chặn. Bộ chuẩn hóa task là fixture pass-through; bộ đánh giá điều kiện dùng source live.
- Candidate trên VPS PASS: `openDay=1`, prerequisites nguyên trạng, mountMax5000. JS syntax PASS.
- Hậu kiểm: 7/7 `/ready` status ok/Mongo true/Redis true; 8 hash installed đúng, runtime đọc day1, public binary/addon hash đúng, HTTPS index/addon200/version đúng. Các process ngoài game giữ PID; launch/disabled/ignore env giữ nguyên.
- Không backfill player, không gửi RPC thử/mua/triệu hồi bằng tài khoản thật và không thao tác tab đang chơi. Chưa visual E2E.

## Backup / rollback

- Remote backup chọn lọc: `/linhhoasu/_ai_workbench/backups/petsoul_day1_20261007_061650`.
- Local backup: `_ai_workbench/backups/petsoul_day1_local_20261007_131620`.
- Helper `_ai_workbench/tools/release_petsoul_day1_20261007.py rollback` CAS candidate → backup rồi rolling restart những node đã restart. Backup đã chứa bảng mount5000.
- Manifest/bằng chứng: `_ai_workbench/temp/hunth_day1_20261007/release.json`, `test_server.json`, `test_client.json`, `public_https.json`.
- Người chơi tải lại trang/đăng nhập lại để nhận query version/config mới; không tự reload tab hiện tại.
