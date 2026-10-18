# Giảm Tinh linh pháp tướng và Hồn pháp bảo — 13/09/2026

- Chỉ giảm item `8` và `61` còn **1/10 mức hiện tại**: `mốc / 1.000` (ví dụ 50.000đ = 50 item).
- Item `7/20/60` giữ nguyên `mốc / 100` (50.000đ = 500 item).
- Áp dụng 50/50 mốc ngày/tuần/tháng; upsert theo ID, quà khác giữ nguyên.
- Cap gửi item `8/61` hạ còn `10.000`; có backup/CAS.
- Verify production `50/50 PASS`; S1/S2 ready `200/200`, không restart.
