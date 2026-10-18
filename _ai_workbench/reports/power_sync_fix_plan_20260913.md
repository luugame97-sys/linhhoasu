# Kế hoạch đồng bộ lực chiến server–client — 13/09/2026

## Vấn đề đã xác định

- Server đã có `combatPowerValue` raw theo `ceil(sum(effectiveAttrs × AttrConfig.power))`, nhưng client chỉ cập nhật field này ở một số ACK.
- `RoleModel.calAllPower()` ưu tiên snapshot canonical cuối; các tag mutation bị bỏ sót khiến HUD đứng yên sau nâng cấp/mặc đồ.
- `power/powerScore` legacy còn được nhiều payload dùng làm fallback; không được dùng chúng để suy ra raw display bằng cách nhân/chia hệ số.
- Curios trước đây đọc sai `baseAttrsLastGrow`; đã sửa một phần, nhưng task/fish/echo và parity category vẫn cần kiểm chứng riêng.

## Contract chuẩn cần giữ

```text
combatPowerValue       integer raw native weighted point
combatPowerVersion     native-weighted-v1
combatPowerUnit        point
combatPowerKind        current | battle-snapshot
combatPowerEntityId    canonical player/bot id
combatPowerServerId    positive server id
combatPowerRevision    hash của attrs + weights + identity + kind
combatPowerEpoch       process epoch
combatPowerSequence    tăng dần trong epoch/entity/kind
combatPowerStatus      ready | unavailable | stale
```

`power/powerScore` giữ tương thích ngược cho gameplay/legacy; không đổi ý nghĩa trong cùng một đợt sửa.

## G2 — Server producer và ACK mutation

1. Tạo một helper outbound duy nhất để tính snapshot sau khi handler đã mutate `session.player`.
2. Gắn snapshot canonical vào ACK của toàn bộ nhóm có thể đổi attr, đối chiếu trực tiếp `handlers/index.js`:
   - role/formation/kungfu: `600, 3000–3005, 3100–3105`
   - fashion: `1800–1805`
   - equip/preset: `2200–2201, 2210, 2212`
   - mount: `3200–3210`
   - pet: `3300–3314`
   - artifact/orb: `3500–3507, 6400–6406`
   - spirit/spec-spirit: `3600–3601, 3610–3617`
   - gem: `3901–3906`
   - fishing/old-trek: `4000–4022, 7000–7065` (lọc read-only)
   - fate: `3800, 3802, 3803`
   - Valhalla/bloodline: `4100–4111, 4700–4708`
   - Curios/pet-soul: `5200–5208, 6900–6909, 6920–6922`
   - homeland/formation native: `6700–6751, 6800–6812`
3. Không attach snapshot vào heartbeat/read-only để tránh tăng payload và tải event loop.
4. Giữ self-only `combat-power-refresh-v1` làm fallback kiểm tra; không cho target ID, không đổi `session.player`, không ghi DB.
5. Các producer offline/profile/map/chat/guild/rank phải gọi cùng resolver; không fallback player thật về `level*100` hoặc stored `power` nếu đủ snapshot attrs.

## G3 — Client lifecycle/freshness

1. Socket chỉ nhận canonical khi `kind=current`, đúng `entityId` và `serverId` của self; bỏ opponent/cross-server/historical.
2. Cập nhật `PlayerInfoModel.playerInfo` trước khi dispatch `ATTR_CHANGE`.
3. Cache theo `(epoch, server, entity, kind)`; cùng epoch bỏ `sequence` cũ hơn; epoch mới reset hợp lệ.
4. Khi bất kỳ category attr đổi, không khóa HUD ở snapshot login. Chờ ACK canonical mới; nếu chưa có, trạng thái là `stale`/giữ số cũ có tooltip rõ, không tự nhân/chia để tạo số giả.
5. Animation chỉ tween từ giá trị cũ tới canonical mới, không đọc lại ancestor snapshot ở từng frame.

## G1/G4 — Parity calculator và HUD

- So từng category native/server: equip, mount, formation, spirit, gem, pet, pet soul, fashion, item, artifact/orb, fate, fishing, bloodline, homeland, elf, Valhalla, OldTrek, Curios, SpecSpirit.
- Curios phải khớp `baseArrData`, `getOneAttrAdd`, passive task, fish conversion và `CuriosEchoConfig`; không dùng suy đoán cấp→base grow.
- HUD dùng một formatter raw duy nhất; full number, compact, tooltip và delta chung chuẩn; không đổi formatter tiền/damage.

## G5 — Kiểm thử bắt buộc

- Unit: mỗi module đơn lẻ/tổ hợp, linked percent, negative/zero, max-safe integer.
- ACK matrix: từng tag mutation ở trên phải tạo `sequence` mới và HUD self đổi tăng/giảm.
- Identity: opponent/server khác/historical không được ghi đè self.
- Lifecycle: packet đảo thứ tự, reconnect, relog, đổi đồ cùng ID, save deferred.
- Surfaces: self HUD, profile500/502, map, chat, guild, Arena/BXH, TopCombat/Island, bot virtual/managed/Arena robot.
- Native E2E được ủy quyền: login → ghi power + attrs → một thao tác tăng và một thao tác giảm → đọc ACK/HUD/profile/map → relog → đối chiếu lại.

## G6 — Phát hành/rollback

1. Chụp baseline/hash VPS và backup chọn lọc.
2. Deploy server additive trước, restart từng `lhs-s1001/2/3`, kiểm `/ready`, hash, log.
3. Deploy client bundle cache-bust sau khi server ACK đã verified.
4. Canary một server/tài khoản QA; nếu sequence/ACK/HUD lệch thì rollback đúng allowlist, không sửa DB player.
5. Chỉ gọi hoàn tất khi có evidence raw packet + client model + HUD cho player thật và từng loại bot.

## Trạng thái

- Hiện đang ở **G2/G3 diagnosis + plan**; chưa chạy native E2E trong lượt này.
- Không được dùng mốc “1 tỷ” cũ làm input để bù hoặc đổi hệ số khi chưa có raw snapshot cùng entity/thời điểm.
