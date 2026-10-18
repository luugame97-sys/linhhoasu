# Audit càn quét Yêu Vương và nhiệm vụ Rơi thăng bậc — 22/09/2026

## Kết luận theo ảnh và runtime

Ảnh là **Rơi bậc 3 → 4**, không phải lỗi câu cá. Ba task của `BoxTierConfig[3]` là `70003/70103/70203`:

| Điều kiện | Config runtime | Trạng thái trong ảnh |
|---|---:|---|
| Cấp rơi (`activeId=9`) | ≥14 | `50/14`, đạt |
| Cấp nhân vật (`activeId=6`) | ≥190 | `180/190`, **chưa đạt** |
| Yêu Vương (`activeId=39`) | boss stage ≥17 | cần kiểm tiến độ thật |

Vì vậy ngay cả khi task Yêu Vương được sửa, nhân vật trong ảnh vẫn chưa thể thăng bậc cho tới khi đạt **cấp nhân vật 190**.

## Nguyên nhân càn quét không hoàn thành task Yêu Vương

1. `activeId=39` lấy tiến độ bằng max của:
   `mainTaskProgress.dungeonBossMaxMapId`, `raidInfo.demonBossInfo.stage`, `raidInfo.bossStage`, `roleInfo.stage - 1`.
2. Càn quét `tag=2304` hiện chỉ:
   - kiểm `stage <= demonBossInfo.stage`;
   - phát `cleanoutRewards`;
   - tăng `dungeonBossChallengeCount` (số lần khiêu chiến).
   Nó **không ghi mốc Yêu Vương đã vượt vào `dungeonBossMaxMapId`** và không biến stage tương lai thành stage đã vượt.
3. Nghiêm trọng hơn, khi login `ensureDungeonRaidInfo()` đang gán:
   `demonBossInfo.stage = roleInfo.stage - 1`.
   Nó ghi đè stage đã lưu. Fixture read-only: stage đã lưu **17** → sau chuẩn hóa login còn **15** khi `roleInfo.stage=16`; task `70203` tiến độ thành `15/17`, status chưa đạt.
4. Sau khi chỉ gọi hàm tăng counter càn quét, `dungeonBossChallengeCount` tăng nhưng `demonBossInfo.stage` và `dungeonBossMaxMapId` không đổi. Đây là lý do càn quét không giúp hoàn thành task mốc.

## Phân biệt đúng hành vi

- Càn quét chỉ được phép đánh lại stage đã vượt; chặn stage tương lai là đúng để tránh bypass.
- Nếu người chơi chưa từng vượt boss stage17, càn quét không thể hoàn thành target17; phải khiêu chiến thật stage17 trước.
- Nếu đã từng vượt stage17 nhưng relog làm stage tụt, đó là lỗi mất tiến độ do chuẩn hóa login và cần sửa lưu mốc.

## Kiểm chứng

- Đọc trực tiếp config runtime VPS: `BoxTierConfig[3]`, `TaskConfig[70203]`, `DemonBossConfig`; không đọc/ghi hồ sơ người chơi.
- Fixture dùng chính `ensureDungeonRaidInfo`, `normalizeTaskInfo`, `MainTaskProgressService`: tái hiện stage17→15 và counter-only không đổi mốc.
- Tất cả 5 node production online/readiness OK trong lần đọc trước; chưa deploy hay restart cho audit này.

## Hướng sửa an toàn (đã triển khai và kiểm chứng)

1. Đã giữ `max(stage đã lưu, stage mở theo cảnh giới)`, không gán đè stage đã vượt.
2. Đã ghi mốc bền vững khi thắng/càn quét và gửi task type7; không dùng counter số lần thay cho mốc.
3. Guard stage tương lai, quota, chi phí và reward policy được giữ nguyên.
4. Không tự khôi phục hồ sơ lịch sử bị tụt nếu không có field/log chứng minh; chỉ các request thắng/càn quét hợp lệ từ nay ghi mốc.

Đã backup trước sửa, deploy rolling 5 node và read-back live; không ghi player thật trong QA.
