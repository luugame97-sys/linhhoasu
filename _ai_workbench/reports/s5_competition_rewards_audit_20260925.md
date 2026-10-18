# Audit S5 không phát thưởng Võ Đạo Hội / Đỉnh Phong — 25/09/2026

## Kết luận

S5 không phát quà vì bị loại ở hai tầng cấu hình khác nhau, không phải do thư bị mất sau khi phát:

- Võ Đạo Hội (Arena/System305): process `lhs-s1005` đang chạy `ARENA_SETTLEMENT_ENABLED=0`, `ARENA_SETTLEMENT_APPROVED=0`. Scheduler trong `src/app.js` nhận hai cờ này và không chạy kết toán. Đây là cấu hình được gắn trong block mở S5 (`deploy_server5_launch_20260920.py`), không phải lỗi Mongo/mail.
- Đỉnh Phong Diễn Võ (CrossArena/System317): `crossServerEventSchedule.json` chỉ có `serverIds: [1001,1002,1003]`. Hàm `CrossServerEventService.isServerAllowed()` loại S5; dù process S5 có `CROSS_EVENT_ENABLED=1`, CrossEvent settlement không tạo roster/settlement cho S5.

## Bằng chứng production read-only

| Server | Arena settlement | Mail Arena | Cross participant | Mail Đỉnh Phong |
|---:|---:|---:|---:|---:|
| S1 | 12 | 8.093 | 6 | 4 |
| S2 | 12 | 1.494 | 2 | 8 |
| S3 | 9 | 1.784 | 5 | 14 |
| S4 | 9 | 1.242 | 0 | 0 |
| **S5** | **0** | **0** | **0** | **0** |

S5 DB `lhs_s1005` không có `ArenaSettlement`, không có mail tiêu đề Võ Đạo Hội/Đỉnh Phong và không có `CrossEventSettlement` local. S1–S4 có Arena settlement mới nhất kỳ `20260924` state `done`; S5 không có kỳ nào.

S5 runtime flags:

```text
ARENA_SETTLEMENT_ENABLED=0
ARENA_SETTLEMENT_APPROVED=0
ARENA_SETTLEMENT_ACTIVATION_AT=1789873200000 (20/09/2026 10:00 GMT+7)
CROSS_EVENT_ENABLED=1
crossServerEventSchedule.serverIds=[1001,1002,1003]
```

## Phạm vi kiểm tra

- Read-only, `directPlayerWrites=0`; không chạy settlement, không phát/bù mail.
- Evidence đầy đủ: `_ai_workbench/temp/s5_competition_rewards_20260925/live.json`.
- Source/hash và log scheduler đã đối chiếu; không có log lỗi settlement trên S5 vì scheduler Arena bị disable và CrossArena bị gate khỏi pool.

## Điều cần chốt trước khi sửa

Muốn S5 nhận thưởng mới cần quyết định riêng:

1. Bật Arena payout cho S5 và đặt activation/cutoff chính xác từ thời điểm S5 mở; không tự bù các kỳ trước khi có duyệt.
2. Thêm `1005` vào pool CrossArena và xác định S5 có tham gia kỳ đang chạy hay chỉ từ kỳ kế tiếp; roster liên server phải được xây lại theo rule.
3. Chỉ sau khi duyệt lịch mới chạy dry-run/preview người nhận, rồi backup + rollout và phát mail idempotent. Không phát bù hàng loạt từ suy đoán.
