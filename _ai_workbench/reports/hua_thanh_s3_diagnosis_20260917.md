# Hứa Thanh — S3: nhiệm vụ độ kiếp và khóa tính năng

Kiểm tra 17/09/2026, 18:10–18:18 GMT+7. Chỉ đọc production; không sửa code game/DB, không đăng nhập thay người chơi, không restart.

## Kết luận

- Có lỗi thật ở đường mở **Thần binh / Võ hồn**: nhiệm vụ phụ chưa có trong nhân vật; backend còn đánh giá nhầm điều kiện task phụ bằng ID nhiệm vụ chính. Đã tái hiện bằng mã backend và hàm client đang phục vụ, trong VM cô lập.
- Nhiệm vụ chính **10302 — Độ Kiếp đến tiền kỳ Hợp thể** chưa hoàn tất đúng với dữ liệu hiện tại: nhân vật cảnh giới18, cấp225, EXP5350/8030, thiếu2680 EXP. Ba nhiệm vụ phụ trợ độ kiếp đều đã đạt. Đây không phải bằng chứng mất tiến độ nhiệm vụ chính.
- Huyết mạch / Bí bảo / Yêu linh khóa đúng lịch ngày15/29/36; S3 hiện ngày5. Hồng nhan là nút placeholder khóa cứng trong client hiện hành.

## Dữ liệu live và đối chiếu ảnh

- VPS xác minh SSH fingerprint bằng helper hiện có; process `lhs-s1003`, cwd `/linhhoasu/lhs/newServer`, HTTP8084, WS9202, DB `lhs_s1003`.
- Nhân vật `_id=6aa637f972731bfc02940339`, tên chính xác `Hứa Thanh`; updatedAt `2026-09-17T11:02:58.626Z`. Cấp225 và EXP5350 trùng ảnh.
- `roleInfo.stage=stageId=18` (Luyện Hư hậu kỳ). `realmInfo` legacy chứa0 không phải trường authoritative của luồng độ kiếp này.
- Task10302: status10, progress18/target19; client hiển thị nhiệm vụ dạng đạt/chưa đạt `(0/1)`.
- Task40018 vượt ải:113/107; task40118 tiêu baozi:14692/650; task40218 cấp:225/225. Cả ba status20.
- Config live: `RoleLevelConfig[225].exp=8030`, `RoleStageConfig[18].levelMax=225`, stage19 là Hợp thể tiền kỳ. Predicate live với EXP5350: tasks=true, level=true, exp=false; bản sao RAM EXP8030: cả ba=true. Đây chỉ kiểm tra điều kiện, không phải thực hiện độ kiếp hoặc đảm bảo thành công theo tỷ lệ.
- Client live `onBreakthrough` cũng chặn điều kiện chưa đủ trước khi gửi3103; tip30031209 là “Chưa đạt điều kiện Độ Kiếp”. Để tiếp tục nhiệm vụ cần tích lũy đủ EXP rồi độ kiếp. Chưa thử thao tác mở đồ/nhận EXP trên tài khoản thật.

## Khóa tính năng

| Tính năng | Điều kiện / nguyên nhân | Kết luận |
|---|---|---|
| Thần binh209 | Task90021 tồn tại; tiền đề90020 dùng Phá Vân Phù, system311 | Lỗi chuỗi nhiệm vụ phụ / kiểm điều kiện backend |
| Võ hồn216 | Task90003 tồn tại; tiền đề90002 chiến đấu Linh Châu một lần, system313 | Lỗi chuỗi nhiệm vụ phụ / kiểm điều kiện backend |
| Huyết mạch219 | Cấp95 và ngày server15 | Chưa đến ngày |
| Bí bảo220 | Cấp110 và ngày server29 | Chưa đến ngày |
| Yêu linh222 | Cấp130 và ngày server36 | Chưa đến ngày |
| Hồng nhan | `lockBtn1` → `MainLockIconRule`, luôn khóa | Placeholder client, không phải mất unlock cá nhân |

- Toast trong ảnh là `SystemConfig216.subExplain=99400001`: “Sau khi hoàn thành Cách chơi tranh độ linh châu”, thuộc Võ hồn, không phải lỗi chung của nhiệm vụ10302.
- Hứa Thanh đã có system311/313 trong `unlockedSystem`, nhưng `tasks` và `tasksMap[9]` không có nhiệm vụ type9. Normalize trên snapshot bằng source đang chạy vẫn trả0 type9.
- Mẫu có giới hạn:22 nhân vật S3 cấp>=75, loại userId tiền tố bot; không có task type9,209 hoặc216 trong trường đã kiểm. Không coi đây là kiểm toán toàn bộ tài khoản.
- Sai logic ở **live** `src/handlers/upgrade.js:611–612`: condition type2 luôn dùng `getCurrentMainTaskId(player)`, đang bằng10302, để so với90003/90021. Không phân biệt task type1 với type9.
- Native `calcSingleConditionType` phân biệt rõ: task chính dùng main ID; task phụ tra đúng task, thiếu→id-1, đang làm→id, đã nhận thưởng→id+1. Với cond4, task phụ tồn tại là đủ; không cần hoàn thành90003/90021 trước khi mở.
- Sáu ca RAM dùng hàm thật của cả hai phía: thiếu task thì cả hai khóa; task90003/90021 tồn tại ở status10 hoặc30 thì client mở nhưng backend vẫn khóa (4 ca mismatch).
- `playerPayload.js:644–652` lọc nhiệm vụ phụ khi guide system chưa mở; `:692–722` không tự tạo root thiếu. Vì vậy không nên khuyên người chơi chỉ bấm nhận nhiệm vụ hoặc ép unlock toàn bộ để xử lý.
- Hồng nhan: skin baseline `RoleButtonGroupSkin.lockBtn1`, label30020230, icon`main_icon_hyan`; đã đối chiếu live `lockBtn1` gắn `Trt`, rule luôn `D.setRoleButtonLock(this.tar,!0)`, tap tip30032617.

## Kiểm chứng và giới hạn

- `task.js`, `playerPayload.js`, `MainTaskProgressService.js`, `RealmTaskProgressService.js`, `WSServer.js` local khớp live. `upgrade.js` khác local nên đã đọc bản live và dùng chính bản đó cho probe; không ghi đè local/game.
- Live upgrade SHA256 `96932e96fdf77db0f71b2e6b8f455df5114ad0f76aef6ba026f012233f27819c`; client `main.min_drop100.js` SHA256 `9b030e70cdfd3ecd1655df13b9e13cb96f2fcf81761ef969fff9a4f8a58708cb`, index hiện trỏ bundle này.
- Probe không kết nối DB; snapshot đưa vào VM, config đọc từ runtime. Peripheral fishing/activation hooks bị stub, không dùng chúng để kết luận ngoài phạm vi. Unsupported dependency calls=0; productionWrites=0.
- Đọc tail8MiB log S3 và error log hiện tại: thấy login/save chậm và socket1006 của nhân vật, không thấy `Upgrade3103 condition rejected` hoặc lỗi task tương ứng trong cửa sổ này. Không gán lỗi mạng đó làm nguyên nhân mở khóa, không coi thiếu log là không từng xảy ra.
- S3 `/ready=200`; PID/restart các process game/bot/admin/dist giữ nguyên trong inventory, S3 giữ nguyên qua probe.
- Đây là Mongo/source/config live + kiểm thử logic RAM, **chưa có native account E2E và chưa sửa**.

## Bàn giao

Nếu được yêu cầu sửa: xử lý đúng task phụ trong điều kiện type2, hoàn thiện khởi tạo/theo dõi chuỗi phụ theo prerequisite authoritative và kiểm tra progression54/55. Không bỏ gate ngày, không cấp đồ/thưởng hoặc đánh dấu hoàn thành hàng loạt. Với dữ liệu người chơi phải backup/CAS/idempotency và read-back riêng sau khi chốt bản sửa.

Evidence: `_ai_workbench/temp/hua_thanh_s3_20260917/{inventory,detail,probe}.json`, live snapshot `source/upgrade.js`. Tool tái kiểm: `audit_hua_thanh_s3_20260917.py` modes `inventory`, `detail`, `probe`; probe lấy snapshot của hai mode trước, không live replay.
