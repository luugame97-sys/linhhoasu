# Audit toàn bộ linh thú — 23/09/2026

Phạm vi: mở trứng, ghép pet, ăn pet EXP, tự động ghép, nâng cấp, tẩy kỹ năng, đặt lại, ô pet, đồ giám/đổi pet, ghép mảnh và PetSoul. Kiểm tra RAM-only theo config/client production; `productionWrites=0`, không sửa source/deploy trong lượt audit này.

## P1 cần chặn trước khi tiếp tục mở tính năng

- **Ghép không đủ Quả linh vẫn thành công**: `3302` gọi `consumeItemOrCurrency()` nhưng không kiểm tra đủ item trước; fixture item36=0 vẫn xóa 2 pet và tạo pet mới. Cả 5 PM2 node không có override `PET_COMPOSE_FAIL_OPEN`, nên default `true` hiện khiến ghép thủ công bỏ qua tỷ lệ cấu hình. [pet.js](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/handlers/pet.js:45), [pet.js](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/handlers/pet.js:754)
- **Ghép q7 thành công trả sai pet EXP q2**: runtime không có q8 nhưng server tính q7→q8 rồi fallback ID82001/q2; client lại ánh xạ bước tiếp theo thành q9. [compose.json](../_ai_workbench/temp/pet_full_audit_20260923/compose.json)
- **Ăn pet thường → pet EXP bị server từ chối**: client native gửi `matUid=pet thường,targetUid=pet EXP` ở nhánh kéo-thả này, trong khi `canPetEat()` chỉ chấp nhận material `tag=2`. [pet.js](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/handlers/pet.js:555)
- **Ăn EXP vào pet đã max cấp vẫn xóa material**: trả thành công, giữ target ở cấp 200, không hoàn item36/không cảnh báo. [pet.js](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/handlers/pet.js:1136)
- **Tự động ghép không xử lý đúng pet EXP**: client tiếp tục gọi `3311` để ăn EXP, nhưng server giữ cả hai pet EXP; luồng auto có thể dừng/lặp sai. [pet.js](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/handlers/pet.js:1241)
- **Trứng 25 cần chốt contract**: `PetEggConfig[25].consume={id:1,count:100}` được client dùng ở màn mua khi hết token; `3300` chỉ trừ item25. Nếu đây là phí mỗi lần mở thì server đang thiếu charge; nếu là giá mua token thì hiện tại đúng. Riêng `eggId=0`/ID không hợp lệ chắc chắn có thể tạo pet miễn phí. [pet.js](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/handlers/pet.js:670)
- **Mua ô pet có thể miễn phí/vượt max**: `3308` tăng field dù thiếu diamond và không chặn `fieldMax` (fixture 8→9 với diamond0, 16→17). [pet.js](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/handlers/pet.js:1041)
- **Ghép trực tiếp có thể xóa pet đang trang bị hoặc đang gắn PetSoul**: server không chặn slot chiến đấu/`petUid` binding. [pet.js](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/handlers/pet.js:544)

## P2 / lệch contract

- Wash kỹ năng ở cấp terminal 20 vẫn tăng thành21 do `exp=0` bị ép thành1. [pet.js](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/handlers/pet.js:922)
- Ăn pet có hard-cap 200 trong server, nhưng client có logic mở rộng cap theo Coercion cho phẩm chất cao; cần chốt contract trước khi sửa.
- Khi hết slot, đường tạo pet vẫn đẩy pet với `slot=-1`; client có thể diễn giải slot này như ô trang bị chiến đấu.

## Ghép mảnh

Luồng item mảnh `90011–90017` và recipe `7000001..7000007`, `13000001..13000006/13000030` hiện kiểm count, phát native pet và đồng bộ `1202`/`3300` đúng trong fixture; chưa thấy lỗi P1 ở nhánh này.

## PetSoul (nếu tính trong “toàn bộ pet”)

Production đang khác source local: snapshot live `pet-soul.js` SHA-256 `80ef65f5…`. Audit 20 ca: 4 PASS, 16 FAIL, gom thành các lỗi chính:

- `6903` có thể tạo Soul chưa sở hữu; cache wash stale có thể ghi đè star, binding và drug-use mới, dẫn tới hoàn drug lặp.
- Reset/triệu hồi dùng `player.items[id=1]`, không đọc `currencies.diamond`; tài khoản chỉ có diamond thật bị từ chối.
- Catch hết hạn vẫn tiêu item; catch fail ép state flee dù config escape rate=0.
- Catch success gửi `6901.data` object trong khi client `push.apply` cần array; loyalty gửi object trong khi client cần số.
- Bind chấp nhận petUid không sở hữu; dispatch nhiều mục có thể mutate một phần trước khi reject.
- Wash bỏ qua privilege giảm phí item286 và có thể hạ attr dưới min config.

## Bằng chứng

- [compose.json](I:/Linhhoasu/server/server/_ai_workbench/temp/pet_full_audit_20260923/compose.json)
- [fragments.json](I:/Linhhoasu/server/server/_ai_workbench/temp/pet_full_audit_20260923/fragments.json)
- [soul.json](I:/Linhhoasu/server/server/_ai_workbench/temp/pet_full_audit_20260923/soul.json)
- [baseline.json](I:/Linhhoasu/server/server/_ai_workbench/temp/pet_full_audit_20260923/baseline.json)

Đã triển khai pet core `pet.js` SHA-256 `abe59d8a…` và PetSoul candidate live-snapshot SHA-256 `d1e7972a…` cùng `src/config/petSoulRewards.js`; 5/5 node readiness 200. Daily click dùng item261×10; dispatch settle GMT+7 tối đa7 ngày, map reward wrapper ẩn thành vật liệu thật459–462. Max-level EXP vẫn fail-closed vì chưa có công thức EXP→item36 được cấu hình. Không đổi client bundle.
