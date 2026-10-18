# Phòng câu 4 người và bố cục ủy thác — 06/09/2026

**Đã triển khai S1/S2.** Người chơi chọn cùng ngư trường và cùng phòng để câu cùng nhau; mỗi phòng có4 chỗ riêng, danh sách hiện số người/tên. Mục “Tự trang bị cá mạnh, bán cá yếu” đã nằm trong khung riêng đồng bộ phong cách game, không nằm ngoài khung hoặc đè nút Bắt đầu.

Hậu kiểm cuối13:53 UTC+7:183 nhóm test đạt, live QA8 nhân vật mỗi server đạt,155 hash đúng, dữ liệu QA đã dọn sạch. Bản client mới: `20260906_fishing_rooms_v2`.

## 1. Tóm tắt công việc

### Chọn phòng và cùng câu

- Thêm nút **Phòng N** ở mép dưới, bên trái nút quay lại và bên phải vùng chat; không đặt đè lên giỏ/ô trang bị cá phía trên.
- Danh sách dùng khung thoại, hoa văn, nền ô và nút xanh/vàng của game. Mỗi trang4 phòng; có Trước/Sau/Làm mới và tên người trong phòng.
- Vào ngư trường tự chọn phòng còn chỗ; người chơi có thể chọn phòng cụ thể để cùng bạn bè. Phòng hiện tại được đánh dấu; phòng đầy không cho vào và server kiểm lại tại thời điểm chọn.
- Mỗi phòng tối đa4 người, vị trí native0–3, thứ tự lấp chỗ1→0→3→2. Người đang câu giữ nguyên chỗ; người rời nhường chỗ trống cho người tiếp theo. Phòng rỗng bị xóa, danh sách luôn cung cấp một phòng trống kế tiếp.
- Roster vào phòng chứa đầy đủ người đang có. Những người đã ở phòng cũng nhận thông báo người mới; không còn tình trạng chỉ thấy nhau một chiều.
- Phòng tách theo ngư trường và từng tiến trình S1/S2. Chọn cùng số phòng nhưng khác ngư trường hoặc khác server không nhìn thấy nhau.
- Phòng/membership là state tạm thời, không ghi vào DB player: restart server hoặc reconnect có thể được tự xếp lại. Không cam kết giữ số phòng/chỗ qua restart; có thể chọn lại phòng bạn bè còn trống.

### Đồng bộ và an toàn dữ liệu

- Entry, leave, emoji, đổi cần/mồi/bè và animation câu chỉ gửi thành viên cùng phòng; không broadcast presence sang mọi socket hoặc người ngoài phòng.
- Peer catch4060 và đổi cần4061/mồi4062 được nối đúng receiver có sẵn. Emoji dùng ID người gửi từ session, không tin ID người khác trong request.
- Join/leave xếp hàng ở cấp registry và chờ save xác nhận; người vào đồng thời không lấy trùng ghế. Hàng đợi này chỉ phục vụ giao dịch phòng, không thay hàng đợi catch/auto/reward hiện có.
- Gói roster được gửi ngay trong lượt xử lý room để thông báo join tiếp theo không vượt qua roster.
- Giữ cache ACK chuẩn của WSServer cho giao dịch gửi trực tiếp. Gửi lại request rời phòng cũ không thể đẩy người chơi khỏi phòng mới.
- Cảnh native lọc mapId+roomId; peer leave được xóa ngay để không để hình cũ trong animation rời chiếm chỗ vừa được cấp lại. Join trùng ID không tạo entity trùng.
- Disconnect thu hồi đúng session. Socket cũ đóng không giải phóng ghế của session mới cùng tài khoản. Lỗi save/null/commit bất định không công bố phòng mới; invalidate theo cơ chế cũ, không rollback giả player DB.
- Chọn chuyển phòng dừng auto. Nếu lượt câu/kết quả auto còn đang xử lý, client yêu cầu chờ lượt hoàn thành. Không tự xử lý/bán/xóa cá pending khi chuyển phòng; tiền, mồi, thuộc tính, khóa và receipt giữ nguyên.

### Bố cục auto theo ảnh người dùng

- Checkbox, tiêu đề và mô tả auto-power cùng nằm trong một `Group`592×126, viền `common_line_4`, nền `common_box_2` giống các nhóm tùy chọn có sẵn.
- Thẻ ởy777; nội dung không vượt thẻ. Nút Bắt đầu xuốngy924; khung thoại cao1230, baseGroup1000. Có khoảng trống giữa thẻ và nút.
- Không thay setting key, serialization, mặc định, điều kiện dừng, auto-order hay hệ số tốc độ1,11×.

Ảnh xem trước dựng bằng **Egret/EUI và asset gốc**, không phải HTML thay giao diện game:

- [Giao diện chọn phòng](../temp/fishing_rooms_release_20260906/ui-rooms.png).
- [Khung tự trang bị/bán cá](../temp/fishing_rooms_release_20260906/ui-auto.png).

Ảnh là fixture local với dữ liệu mẫu. Wrapper CommonWindowBg được mô phỏng khâu gắn viewport; không gọi đây là nghiệm thu toàn client production hoặc mọi bè/thời trang khi4 nhân vật cùng xuất hiện.

## 2. File/thư mục đã thay đổi

### Source chính local và production

| File | Thay đổi |
|---|---|
| `linhhoasu/lhs/newServer/src/services/FishingRoomService.js` | Mới: registry, list, cấp4 ghế, join/leave, room broadcast, ACK cache |
| `linhhoasu/lhs/newServer/src/handlers/fish.js` | Ghế0–3, list qua4050 action=list, room entry4002/4050, leave, peer packets |
| `linhhoasu/lhs/newServer/src/net/WSServer.js` | Registry mỗi server, send hook và disconnect đúng session |
| `linhhoasu/webgame/game/js/main.min_a6195824.js` | Picker native, room guards/peer filtering, khung auto-power |
| `linhhoasu/webgame/game/index.html` | Cache token `20260906_fishing_rooms_v2` |

Local3 server file và main khớp candidate; index normalized content khớp (giữ newline local). Không chép toàn cây local lên VPS; commerce khác local từ trước được giữ nguyên. Không đổi config bin, economy, DB schema, WebGM, tăng tốc, luật cá hoặc input-freeze đã tạm dừng.

### Công cụ/evidence

- Baseline hash-guard: `_ai_workbench/temp/fishing_room_audit_20260906T060009Z/`.
- Candidate: `_ai_workbench/temp/fishing_rooms_release_20260906/`.
- Tools mới trong `_ai_workbench/tools/`: build_fishing_rooms_client, fishing_rooms_client_methods, fishing_rooms_view_methods, fishing_auto_power_layout, test_fishing_rooms, qa_fishing_rooms_v2, release_fishing_rooms, finalize_fishing_rooms, publish_fishing_room_ui_v2, sync_fishing_rooms_local_patch, sync_fishing_room_ui_v2, check_fishing_rooms_residue (hậu tố20260906).
- Công cụ UI: inspect_fishing_room_skins, build_room_ui_fixture, render_room_ui, room_ui_fixture_20260906.html. Chỉ dùng runtime/asset local, không login tài khoản người thật để chụp hình.
- Test cũ được cập nhật dependency/policy fixture: test_fishing_balance thêm room registry qua cờ `FISH_ROOM_REGISTRY=1`; test_fishing_auto thêm kỳ vọng khung qua `FISH_AUTO_FRAMED=1`. Giữ các assertion gameplay khác.
- Evidence chính: `rooms-tests.json`, `stage.json`, `deploy.json`, `ui-update.json`, `final-deploy.json`, `verify.json`, `residue-check.json`, `client-build.json`, `ui-render.json` và2 PNG.
- `release-error.json` ghi canary cũ thất bại; trạng thái cuối phải đọc `final-deploy.json`/`verify.json`, không lấy lỗi cũ làm kết quả cuối.
- Không dùng lại2 harness room live đã bị WITHDRAWN ở phiên audit.

### Backup/rollback

- Local trước sửa: `_ai_workbench/backups/fishing_rooms_local_20260906/`.
- Báo cáo trước sửa: `_ai_workbench/backups/fishing_rooms_reports_20260906/`.
- Backup production chính: `/linhhoasu/_ai_workbench/backups/fishing_rooms_20260906_063700/`.
- UI chỉnh vị trí nút: thư mục con `ui-v2/`; bổ sung ACK cache: `ack-cache/service.before`.
- Staging: `/linhhoasu/_ai_workbench/temp/fishing_rooms_20260906_063700/`.
- Rollback source/client theo preimage; không rollback hoặc chỉnh player DB. File mới có thể chuyển vào backup khi rollback, không xóa rộng.

## 3. Lỗi đã gặp & giải pháp

| Vấn đề | Nguyên nhân | Xử lý | Chống lặp |
|---|---|---|---|
| Chồng nhân vật/nhìn một chiều |Mọi pos1, roster=[]|4 ghế riêng và roster/fanout cùng phòng|2/4/5/8/20/40 client đồng thời|
| Ghế0 bị ép thành1 |Normalizer cũ>=1|Chỉ nhận0–3|Native parse/coordinates assertions|
| Người ngoài phòng nhận gói |Broadcast toàn server|Broadcast registry; client map+room guard|Kiểm phòng khác không nhận peer catch|
| Ghế đã dùng lại còn hình cũ |Animation leave giữ entity tạm|Xóa peer ngay khi rời|Leave→join cùng seat test|
| Replay rời phòng cũ làm mất chỗ mới |Room gửi trực tiếp không đi qua result cache|Ghi ACK cùng cache WSServer, giới hạn100|Live gửi lại đúng msgUid sau chuyển phòng|
| Auto-power nằm ngoài khung |3 control thêm trực tiếp vào baseGroup|Thẻ có viền/nền, khoảng cách nút rõ|EUI render+bounding check|
| Nút chọn phòng có thể đè ô cá |Vị trí ban đầu ở trên vùng equipment|Chuyển xuống giữa chat và nút quay lại|Đối chiếu tọa độ skin thật|
| Staging room suite chạy lâu |Parse hàm minify lặp cho nhiều client|Cache extraction một lần; timeout tiến trình test|Không kéo dài live timeout vô hạn|
| QA đầu tăng cấp116→117 |Clone còn EXP của bot mẫu|QA exp0, giữ assertion identity chặt|Chuẩn hóa fixture trước login|
| Render auto ban đầu trống |Fixture thiếu transclusion CommonWindowBg|Gắn đúng viewport trong wrapper kiểm UI|Không sửa game để chiều harness|
| UTF-8 output Python báoGBK |stdout Windows mặc định|reconfigure utf-8 trong tool inspect|Không sửa bytes asset/chuỗi để né console|
| apply_patch hunk/marker không khớp |Context khác và method đầu minify|Đọc exact source, neo method đúng; chạy lại|Không suy tên/ghi đè nguyên source |
| Mongoose warning isNew |Schema có tên reserved sẵn|Ghi nhận, không thay model ngoài scope|Phân biệt warning và fail|

Canary đầu13:35 dừng tại S2 do fixture EXP, chưa chạm S1/client mới; tự khôi phục source và ready200. Sau khi chuẩn hóa QA và rerun182 test, S2/S1 đạt. Bản khép cuối bổ sung cache ACK được test lại183 nhóm và live hai server. S2 có4 restart trong cả phiên (canary lỗi+rollback+release+final); S1 có2 (release+final).4 dịch vụ khác không restart.

## 4. Kỹ năng / kinh nghiệm mới

- Roster phải đến trước peer delta để không bị rebuild xóa người vừa vào; gửi có thứ tự cần nằm trong giao dịch phòng, nhưng vẫn phải lưu ACK cho replay.
- Khóa theo user không bảo vệ chỗ ngồi dùng chung; bộ cấp ghế cần quản lý các join cùng một registry. Session identity khác userId, đặc biệt lúc reconnect.
- Tên phòng trống có thể thay đổi do người khác vào trước; luôn kiểm lại room capacity ở server, không dựa vào nút UI.
- Dùng skin/texture gốc, kiểm EUI rendering thật cho layout mới; không dựng mock DOM rồi gọi giao diện game hoàn tất.
- Live QA cần assert playerID trong Mongo và cấp/name500 trước gameplay; không tự tạo tài khoản lệch suffix. Cleanup kể cả partial login và kết nối lỗi.
- FX/catch/auto/settings giữ logic cũ. Khi thay vị trí thành phần UI phải đối chiếu toàn khung để tránh che chat hoặc giỏ cá.

## 5. Trạng thái hiện tại

### Kiểm thử

| Nhóm | Kết quả |
|---|---|
| Phòng mới + native receiver |30/30 PASS local/Linux staging; mô phỏng đến40 người|
| Auto |21/21 PASS|
| Cần/bè |38/38 PASS,1.800 case ma trận|
| Balance/integrity |70/70 PASS|
| Huyền Vũ |24/24 PASS|
| Core |PASS,714 bảng|
| Giao diện |EUI/WebGL+asset gốc render2 panel không lỗi; click nút Vào phòng nhận đúng ID; nội dung auto nằm trong thẻ/nút dưới thẻ|
| Live S2 |8 QA đúng identity,2 phòng×4 vị trí, roster2chiều, full reject, thay chỗ, peer cast lọc, pending/relog, disconnect, stale-leave replay PASS|
| Live S1 |Cùng bộ8 QA PASS sau S2|

Tổng183 nhóm test hồi quy. Client inverse-build kiểm19 chỉnh sửa có chủ đích; hàm auto-power/FX, speed và animation tính thời gian gốc giữ nguyên. Không tự bù hoặc chỉnh cá/vật phẩm của người thật.

### Hậu kiểm13:53 UTC+7

-155/155 expected artifact đúng;5 file thay (bao gồm service mới),150 giữ nguyên.
- `FishingRoomService.js`: `01fdc148b1315eba4e8908decc2e6c1852dff2c88fbcac616451b9a263019760`.
- `fish.js`: `6dd91f922a21069c3a0cf889377e1fa71e3c7a23feee0fbb63e0087cd2146f67`.
- `WSServer.js`: `bdf75549831074824b5c60d864ab3a47fa5c609a0adba67c7b590b6e0861dec8`.
- Main served: `0c69e4b217e2bfa1a5c76d7d084bab13835e9c6433f4e17be93d662a3922e5bd`.
- Index served: `f3cb60a4c8fedf410592d71d63ac2f0e75360e5ebfe1777ab621e976a4a26101`.
- S1 PID16313/restart1378, S2 PID15390/restart46, ready8080/8083=200.
- Dist30824, admin30856, bot1600/1576 giữ PID/restart; không đổi DB/Nginx.
- Mỗi lượt QA chỉ xóa đúng dữ liệu test đã tạo. Hậu kiểm Mongo player/mail prefixqafroomv2 còn0 cả hai DB; Redis session/rank scope rỗng; không còn tiến trình QA chạy. Không có tồn dư như harness cũ.
- Chưa nghiệm thu toàn cảnh4 người có mọi loại bè/thời trang lớn trong client production. Đã kiểm tọa độ native và UI local, chưa khẳng định tuyệt đối mọi asset/hoạt ảnh không che nhau trên mọi màn hình.

## 6. Bước tiếp theo

1. Người dùng reload game một lần để nhận token `20260906_fishing_rooms_v2`.
2. Vào cùng ngư trường, bấm **Phòng N** ở dưới bên phải, chọn phòng còn chỗ giống bạn bè. Bấm Làm mới nếu danh sách vừa thay đổi.
3. Kiểm mục auto trong khung mới, không thay lựa chọn đã lưu. Khi đang trong lượt câu thì chờ xong mới đổi phòng; chuyển phòng sẽ dừng auto.
4. Nghiệm thu cùng4 người trong game: đúng tên,4 chỗ, đồng bộ cần/mồi/bè/động tác. Nếu asset lớn che nhau, gửi ảnh4 người để điều chỉnh layout có bằng chứng; không thay ngẫu nhiên vị trí người đang câu.
5. Các phòng không liên server, không giữ chỗ qua restart. Muốn phòng riêng/mật khẩu/mời bạn trực tiếp hoặc trên4 người là mở rộng khác, chưa có trong bản này.
