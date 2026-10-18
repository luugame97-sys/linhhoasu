# Candidate mở rộng ngư trường 8–10 — 24/09/2026

## Phạm vi

- Chỉ cập nhật source server candidate; không sửa binary client, không deploy, không ghi player/DB.
- Extension opt-in qua `FISHING_SCENES_8_10_ENABLED=1`; khi không bật, binary hiện tại vẫn giữ đúng 7 map thường.
- Scene 8/9/10 dùng lại fish/relic/resource key đã tồn tại của scene 6/7, nên không phát sinh ID asset mới.

## Cấu hình

| Scene | Điều kiện cấp câu cá | Fish | Relic | Presentation key |
|---:|---:|---:|---:|---|
| 8 | 31 | 15 | 6 | scene7/banner7/handbook7 |
| 9 | 34 | 15 | 6 | scene7/banner7/handbook7 |
| 10 | 37 | 30 | 12 | scene7/banner7/handbook7 |

`openDay=1`, `isActivity=0`; mở map chỉ theo `FishLevelConfig`/`cond`, giữ logic gốc. Module kiểm tra base scene 1–7, fish/relic tồn tại, shape và collision trước khi mutate bảng.

## Thay đổi chính

- `linhhoasu/lhs/newServer/src/config/fishingScenes.js`
- `linhhoasu/lhs/newServer/src/services/ConfigService.js`
- `linhhoasu/lhs/newServer/src/handlers/playerPayload.js`
- `linhhoasu/lhs/lhs-local-run2/src/handlers/playerPayload.js` (fixture parity)
- `linhhoasu/lhs/newServer/scripts/test-fishing-scenes-8-10.js`

`playerPayload` đọc `FishSceneConfig` để nhận mọi scene thường có fish pool, không còn whitelist cứng 1–7; scene activity vẫn bị loại khỏi normalize.

## Kiểm chứng

- `node --check` 4 file: PASS.
- Enabled contract: scene8/9/10 xuất hiện; khóa dưới cond và mở tại cond; login payload giữ scene10; PASS.
- Disabled compatibility: không có row 8–10; payload scene10 fallback về scene1; PASS.
- Core gameplay contract (env tắt, 718 bảng): PASS.
- `productionWrites=0` trong các test.

## Còn chờ

- Client/binary phải được bổ sung cùng các row 8–10 trước khi bật env ở production; hiện chưa deploy.
- Asset mới có thể thay các presentation key sau khi designer hoàn thiện; không cần đổi fish/relic ID nếu tiếp tục tái sử dụng.
