# Release Linh điền 41–100 — 23/09/2026

## Kết quả

- Mở cấp **41–100** theo policy `plant_level100_candidate_v1`.
- Giữ cấp 1–39; dùng delta cuối đã kiểm chứng `+150 EXP`; cấp40 cần 1.400 EXP để lên41; cấp99 cần10.250 EXP để lên100; cấp100 terminal (`exp=0`), không lên101.
- Giữ EXP dư của người chơi cấp40; không migration/xóa/bù player.

## Đồng bộ

- Bốn binary config server/client (hai tên `config_e5ac72c2.bin` và `config_fashion_20260909.bin`) cùng candidate SHA `66b86d99474287d5f4d2737900fcce52c6c3683a49e72db235fbbacef7968511`.
- `farm.js` clamp level hợp lệ theo max row hiện có.
- `playerPayload.js` gửi marker `farmLevel100` trước khi client xử lý player; addon [lhs-plant-level100-v1.js](I:/Linhhoasu/server/server/linhhoasu/webgame/game/js/lhs-plant-level100-v1.js) mở rows 40–100 trước native model. Index dùng cache token `plant_level100_candidate_v1`.

## Kiểm chứng

- Candidate progression: 9/9 PASS; binary round-trip/parity: 714 bảng, chỉ `PlantLevelConfig` thay đổi, PASS; `productionWrites=0`.
- Readiness sau rollout: `8080/8083/8084/8085/8086 = 200`, PM2 `lhs-s1001..lhs-s1005` online.
- Release evidence: [release.json](I:/Linhhoasu/server/server/_ai_workbench/temp/plant_level100_20260923/release.json).

## Lưu ý cân bằng

Policy +150 là ngoại suy tương đối, chưa phải bảng chính thức. Tổng EXP từ40→100 là349.500; tốc độ cơ bản khoảng180 EXP/ngày tương đương khoảng5,3 năm nếu không có buff/nguồn EXP khác. Có thể cần điều chỉnh sau khi theo dõi gameplay thực tế.
