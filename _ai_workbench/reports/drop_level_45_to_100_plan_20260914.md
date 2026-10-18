# Kế hoạch cấp rơi trang bị 45 → 100 và pilot S1 45 → 46

## Bằng chứng đã kiểm tra (read-only, UTC+7)

- Runtime PM2 S1/S2/S3 đều `online`; snapshot cấu hình/runtime đã lấy từ VPS với `productionWrites=0` tại `_ai_workbench/temp/drop46_audit_20260914/snapshot.json`.
- S1 hiện có 6 player ở `boxInfo.level=45`; đây là nhóm phù hợp để pilot có kiểm soát. Không sửa player nào trong lượt này.
- `BoxConfig` có 45 row. Cấp 45 trỏ `mapId=10045`, nhưng `MapConfig` đã có `10046–10048` dùng lại scene `10010` và `10049–10050` dùng lại scene `10013`; `MapMonsterService` nạp slot theo `sceneId`, nên cấp mới có thể tái dùng map/scene cũ nếu gameplay chấp nhận.
- Cấp 43–45 dùng scene `10007`; cấp 44 có tỷ lệ phẩm chất 36–43 và boss quality 43; cấp 45 có tỷ lệ 37–44 và boss quality 44. Tổng trọng số mỗi bảng là 10.000.
- `QualityConfig` và catalog trang bị hiện có phẩm chất 1–45, mỗi phẩm chất chuẩn có 13 template (12 slot + biến thể). Phẩm chất 45 tồn tại (ID mẫu `75101…75112`, `75201`) nhưng chưa được bảng cấp 45 cho rơi; vì vậy pilot 45→46 có thể mở phẩm chất 45 mà chưa tạo phẩm chất mới.
- Luồng sinh trang bị hiện tại: `BoxConfig.equipQualityWeight` → weighted quality; `mapBossDropQuality` làm sàn cho boss; chọn template theo quality/slot từ `AssetsConfig`; `EquipService.createEquipFromTemplateId` tạo `lv`, attrs cơ bản theo level, quality multiplier `1 + 0.3*(quality-1)`, một special attr 101–106 và variance 95–105%; power dùng `AttrConfig.power` trong `BattleService`. Đây là logic phải giữ nguyên khi mở rộng, không tự đổi công thức giữa chừng.
- `compat.handleBoxUpgrade2100` đang có fallback cho level ngoài config; đây là rủi ro: pilot phải thêm row/feature gate rõ ràng và chặn vượt 46, không dựa vào fallback. `BoxConfig` bản CN snapshot và bản VN tĩnh trùng 45 row; chưa có dữ liệu official 46–100.

## Thiết kế pilot 45 → 46 (chỉ S1)

1. Tạo bản candidate có `BoxConfig[46]` tối thiểu: map `10046`, scene `10010`, thời gian/chi phí được duyệt, weights tổng đúng 10.000 với quality 38–45 (hoặc bảng cân bằng riêng), boss floor 45. Không thay row 1–45.
2. Cho phép nâng 45→46 chỉ khi feature flag + `SERVER_ID=1001`; chặn 46→47 trong pilot. Giữ nguyên exp/timer và chỉ settle sau ACK/save xác nhận.
3. Dùng catalog quality 45 hiện có; kiểm tra 12 slot, icon/name/param, attrs và power. Không tạo item ID mới trong pilot.
4. Map 10046 chỉ là map ID mới dùng scene cũ; kiểm tra monster-slot claim, boss, open/claim reward và ủy thác/tự bán. Không reset map/player state khác.
5. Chọn 1 tài khoản QA được chỉ định hoặc fixture cô lập; không tự nâng cả 6 player level45. Snapshot trước, receipt idempotent, rollback bằng candidate/backup nếu fail.

## Mở hoàn chỉnh 46 → 100 sau pilot

- Chốt quy luật map/scene: có thể nhóm nhiều cấp vào một scene cũ như hiện tại, nhưng mỗi row phải có map ID, born points, quái/boss và resource tồn tại; không tạo map mới chỉ để tăng số.
- Chốt kinh tế bằng dữ liệu 1–45: nội suy/đoạn bậc chi phí và thời gian, kiểm tra số bạc tiêu cho mỗi bước, tốc độ nâng thực tế và không overflow số nguyên. Không tự nhân theo một hệ số chưa được duyệt.
- Chốt phân phối rơi: quality weights luôn tổng 10.000; quality floor boss; xác định có mở quality 46–100 hay chỉ mở thêm cấp dùng quality hiện có. Nếu mở quality mới, mỗi quality cần 13 template, `QualityConfig`, `AssetsConfig`, tên/ngôn ngữ, icon/khung/resource, attrs/power và kiểm tra ID không đụng bảng khác.
- Mở rộng client cùng binary/table mà server đọc; sửa nhãn danh sách, max-level, auto-delegate filter/giữ phẩm chất và cache-bust. Không để client hiển thị cấp mà server không chấp nhận.
- Sửa gate server: cấp tối đa 100; bỏ fallback ngoài bảng hoặc giới hạn fallback trong test; CAS/lock/idempotency cho nâng cấp, speed-up, relog và reconnect.
- Kiểm thử contract + native: 45→46→100, chi phí/timer, tăng tốc, save/relogin/cold restart, rơi thường/boss, đầy túi, claim replay/concurrent, ủy thác auto-sell/giữ phẩm chất, power và hiển thị. Chỉ sau khi PASS mới rollout S1 rồi S2/S3.

## Kết luận

Pilot 45→46 ở S1 **khả thi và rủi ro thấp hơn** vì map 10046 và phẩm chất 45 đã có sẵn. Tuy nhiên cần candidate + feature flag + tài khoản QA được chỉ định; chưa đủ căn cứ để bật production ngay. Việc mở 46→100 đầy đủ là dự án cấu hình + catalog + client/server, không chỉ sửa giới hạn số cấp.

## Trạng thái thực hiện pilot

- Pilot S1 đã được bật sau khi fixture local và Mongo cô lập PASS; chỉ S1 có flag `DROP_LEVEL_46_ENABLED=1`, S2/S3 không đổi.
- Cấp 45 nhận chi phí 5×68.000.000 bạc và timer 26.136.000 giây; cấp46 terminal. Không có bồi hoàn hay thay đổi player thật.
- Người chơi phải hard-refresh client và dùng tài khoản QA. Native account E2E trên người chơi thật vẫn là bước xác nhận cuối; không nên dùng tài khoản chính nếu chưa chuẩn bị bạc/Phù tăng tốc và phương án rollback.
