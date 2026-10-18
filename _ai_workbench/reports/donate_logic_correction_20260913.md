# Đính chính logic giảm quà Donate — 13/09/2026

- Logic cuối cùng áp dụng cho **50/50 mốc đang bật** (ngày/tuần/tháng): cả 5 ID `7, 8, 20, 60, 61` đều nhận `floor(milestone_amount / 100)`. Các mốc hiện tại đều chia hết cho 100 nên không mất phần lẻ.
- Upsert theo ID item: có thì ghi đè đúng số lượng mới, chưa có thì thêm; mọi item thưởng khác giữ nguyên.
- Cap gửi Donate của 5 ID là `100.000`, phù hợp mốc cao nhất 10.000.000 / 100.
- Verify production: 50 rows PASS; S1/S2 `/ready` `200/200`.
