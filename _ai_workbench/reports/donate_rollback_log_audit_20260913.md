# Audit khả năng rollback Donate — 13/09/2026

- Đã kiểm tra backup/temp quanh thời điểm bù 12/09: chỉ có backup catalog/config và delivery plan; không có player snapshot trước bù.
- Mongo `lhs_s1001/lhs_s1002` chỉ có `transactions`, `battlelogs`, `arenafightlogs`, `adminactionlogs`; không có collection item-consume/upgrade ledger.
- PM2 log của 3 tài khoản chỉ có `PlayerSave`, login/combat; không ghi tiêu hao item `7/8/20/60/61` hoặc nguồn từ delivery bù.
- Mongo local không có `oplog.rs` để dựng pre-image.
- Kết luận: chưa đủ bằng chứng để hạ cấp an toàn; giữ nguyên trạng thái tài khoản, không rollback mù.
