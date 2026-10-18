# Thiên Giáng Phúc Lộc QA lần theo lỗi x2–x5 — 08/10/2026

## Hiện tượng người dùng báo

Chọn số lần x2–x5 rồi bấm nút có thể làm màn hình không bấm được tiếp.

## Kết quả kiểm tra

- Snapshot live mới: server/activity/client đang đúng các hash đã publish; S1–S7 `/ready` Mongo/Redis đạt. Không có thay đổi production trong QA này.
- Server candidate kiểm tra multiplier `1..5` với state Talo/S1 (`item233=159`, `item232=33`, `score=13`, màu4): **21/21 PASS**. Debit, score, record, packet1775, ACK, request/cycle và replay đều khớp; không có dấu hiệu server nhân sai hoặc treo response. Save/reward adapter trong suite là mock, nên chưa coi đây là native persistence E2E.
- Client pipeline hiện hành được chạy bằng native method extraction với x2/x3/x4/x5 và skip animation bật/tắt: các ca callback theo thứ tự bình thường đạt. Khi callback completion của animation đến trước callback “hồ lô chạm đất”, native `FuluItem` tăng index qua năm hồ lô nhưng lượt phán định cuối không chạy; nút giữ khóa tới watchdog 60 giây. Regression native thực tế: **HIT→COMPLETE 5/5 PASS; COMPLETE→HIT 0/5 PASS**.
- Gọi cleanup lần hai trước khi popup thưởng cũ đóng cũng có thể mở khóa lượt mới sau khi popup trước vẫn còn. Đây là lỗi client lifecycle, chưa chứng minh mọi lượt live đều rơi đúng thứ tự này.
- Lượt browser Talo/S1 x4 đã hoàn tất một mẫu: 159→155 vé, score13→17, hiển thị đủ 5 hồ lô và thoát màn hình được. Console không ghi lỗi Fulu; có lỗi autoplay âm thanh `NotAllowedError` độc lập.

## Bản sửa server đã chuẩn bị

- Candidate `Activity52TaskService.js` sửa hai lỗi dữ liệu đã tái hiện: giữ trạng thái task legacy đã nhận khi ledger chưa tồn tại; không lấy `items19` của ngày hôm qua để hoàn thành task ngày mới. Exact live helper tests: trước 17 PASS/4 FAIL, sau 21/21 PASS; regression cũ 41/41 PASS. Chưa deploy.

## Bản sửa candidate đã chuẩn bị, chưa deploy

- Candidate server `Activity52TaskService.js` SHA256 `c425c87fffee81cbf8a16c0ea2b1a6dc4ffea152f2c07f0e50ac430d1ab494d1`: giữ task legacy đã nhận khi ledger chưa có; chặn điểm `items19` của ngày hôm qua dùng cho task Phúc Lộc ngày mới. Exact Mongo QA trước helper tái hiện 4/4 lỗi, candidate pass; candidate Mongo claim/draw x8, multiplier1–5, native/body rewards, replay/CAS đều PASS; cleanup 9/9 synthetic, production/account writes0.
- Candidate client `lhs-fulu-safe-v1.js` SHA256 sau race fix: `1f96a613015d47fe5f0b99fa53697f78cca9cd1757c3b02c2e2984d4d15a15b3`. Fix giữ đủ 5 callback HIT/COMPLETE trước final judgment, final judgment idempotent và không cho cleanup lần hai mở nút khi popup cũ chưa đóng.
- Regression native thật dùng method `FuluItem.playDropAnimation/onFallComplete`: **11/11 PASS** (HIT-first x1–x5, COMPLETE-first x1–x5, duplicate cleanup). Suite client follow-up **20/20 PASS**, syntax PASS.
- Không inject candidate vào tab đang chạy. Khi được duyệt publish, phải bump query cache và full reload; không nạp v2 vào trang đã wrap v1.

## Trạng thái sau triển khai VPS

- Đã publish server candidate `Activity52TaskService.js`, client lifecycle fix và cache marker index `20261008_fulu_safe_v2` bằng backup/CAS.
- Rolling restart S1–S7 hoàn tất; `/ready` Mongo/Redis 7/7 PASS; served client hash khớp candidate `1f96a613015d47fe5f0b99fa53697f78cca9cd1757c3b02c2e2984d4d15a15b3`; không ghi player/account.
- Tab game đã full reload sang cache marker mới. Bạn cần QA riêng x2, x3, x4, x5 với skip animation bật/tắt; kiểm nút quay, popup đóng, số dư233, score, reward và relog. Autoplay `NotAllowedError` còn lại là lỗi trình duyệt âm thanh, không liên quan logic lưu/quay.
