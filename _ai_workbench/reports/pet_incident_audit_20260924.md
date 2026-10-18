# Kiểm tra lỗi mở trứng / hợp thành Tinh Linh — 24/09/2026

## Test mua thật theo xác nhận người dùng — 09:37 GMT+7

- Người dùng xác nhận cho phép bấm mua 1 trứng giá100 trên phiên Codex Browser hiện tại. Không ghép/mở trứng hoặc sửa/bù DB.
- Snapshot đúng role Tuanpkt S5 trước/sau: diamond `100276 → 100176`, item25 `0 → 1`, buyRecords25 `6 → 7`.
- Giao diện mở hộp mua số lượng1, bấm Mua một lần, xuất hiện popup nhận thưởng; sau popup, số trứng xanh hiển thị1, giá mua được ẩn. Danh sách14 pet và field14 giữ nguyên trong hai snapshot.
- Kết luận giới hạn: luồng mua trứng thành công end-to-end ở lần test này, không có hiện tượng bấm không phản hồi. Không dùng kết quả này phủ định sự cố gián đoạn trước đó hoặc coi lỗi ghép đã sửa.
- Evidence: `temp/pet_incident_20260924/buy_ui_before.json`, `buy_ui_after.json`; ảnh UI nằm trong tool output của phiên. Đã tiêu100 Nguyên bảo, giữ1 trứng đã mua cho người chơi.

## Test ghép trực tiếp theo yêu cầu người dùng — 09:52 GMT+7

- Backup snapshot trước thao tác: `_ai_workbench/backups/pet_compose_ui_20260924/tuanpkt_s5_pet_before.json`.
- Đã dùng cặp cùng pet ID83401: UID100004 và UID100007. Cả hai đều level1, không khóa; item36 (Quả Linh) bằng0, trong khi q3 cần10.
- Kéo ghép trên UI làm hai hình biến mất. Server trả thất bại do thiếu item36; không trừ kim cương, không save ghép và DB vẫn giữ đủ14 pet, trong đó hai UID trên vẫn tồn tại. Đây là tái hiện chính xác hiện tượng người chơi báo “ghép là mất”.
- Khi kéo tiếp, client gửi RPC3301 đổi slot; DB chỉ đổi vị trí UID100004/100007 (slot5 và0), không mất pet. Không mở trứng/không cấp vật liệu.
- Root cause đã xác nhận live: callback `sendCompose` kiểm tra `t?` thay vì `t.result===0`, sau response lỗi vẫn gọi `deletePet(s)` và `deletePet(o)`. Vì vậy UI xóa hình tạm thời; relog/đồng bộ lại sẽ thấy pet trở về. Server guard thiếu item36 hoạt động đúng.
- Mã test native offline chưa đạt do bundle phụ thuộc closure minified (`y6`), không dùng làm bằng chứng; bằng chứng chính là thao tác browser + snapshot DB trước/sau và source callback đã trích.

## Kết luận đã tái hiện bằng dữ liệu thật

- `Tuanpkt` là `accountId=tuanpkt`, có role ở S1 và S5. Role S5 là `u_Wk_1005_dfa62f_1790093829720`, tên hiển thị hiện tại `HanhGia_1005_8c418db5ae_`.
- S5: `field=10`, có 10 pet ở các slot ghép `0..9` và 1 pet ở slot chiến đấu `-1`; không còn ô ghép trống. Vật phẩm `24=1`, `25=0`, `26=0`, vật liệu ghép `36=0`.
- S1 không phải node khác logic: cả S1–S5 dùng cùng bundle/handler. Role Tuanpkt ở S1 không có pet, còn role S5 có14 pet và thiếu item36, nên S5 mới kích hoạt đúng nhánh lỗi UI; tuổi tài khoản không phải nguyên nhân gốc.
- Có các cặp cùng phẩm chất để thử ghép (trong đó có cặp cùng type ở q3), nhưng vẫn cần item36 theo cấu hình:
  - Mở trứng 24 bị server từ chối tại guard ô trống (`findFirstEmptyComposeSlot < 0`), trứng vẫn còn 1. Đây là điều kiện từ chối đúng, nhưng client không hiện lỗi rõ.
  - Hợp thành bị server từ chối vì thiếu item36. Dữ liệu hiện tại vẫn còn đủ 11 pet; chưa có bằng chứng DB bị mất pet.
- Hai pet cùng phẩm chất/type có thể chọn ghép trong dữ liệu S5, nhưng vẫn cần item36 theo cấu hình (q2: 5; q3: 10; q4: 25; q5: 40; q6: 60; q7: 100).

## Đối chiếu bản gốc/CN

- Config CN gốc `config_59d5b3ac.bin` vẫn khai báo `PetQualityConfig.consumes`: q2 cần item36×5, q3×10, q4×25, q5×40, q6×60, q7×100. Vì vậy item36 là phí ghép theo thiết kế gốc, không phải vật liệu tự thêm trong bản fix.
- Client CN gốc `main.min_8f4e67d7.js` cũng xử lý callback ghép bằng `t&&` rồi xóa hai UID trước khi kiểm tra `t.data`; lỗi UI không phải do S5.
- Server baseline cũ gọi `consumeItemOrCurrency()` nhưng bỏ qua giá trị `false`, nên có thể ghép miễn phí khi thiếu item36. Bản hiện tại đã sửa fail-closed để không tạo pet/không xóa vật liệu khi thiếu cost.

## Nguyên nhân client làm người chơi tưởng “mất pet”

Bundle client đang dùng chung cho cả 5 server, SHA-256 `0e662b2b3c405cfea3981032d90ba7751e13cb78de004ebfda5f479586aa0ed2`.

- `sendCompose` chỉ kiểm tra response có tồn tại (`t?`), không kiểm tra `t.result===0`. Khi server trả `{result:-1,data:null}`, client vẫn `deletePet(s)` và `deletePet(o)` trong bộ nhớ giao diện. Relog sẽ đọc lại DB và pet trở lại.
- `sendUseEgg` cũng chỉ kiểm tra `t?`; response thất bại `{result:-1,data:[]}` bị xử lý như callback thành công nhưng không tạo pet/không báo nguyên nhân.
- `sendPetEat` có cùng kiểu kiểm tra `t?`; đây là cùng một rủi ro khi ăn pet thất bại.
- Luồng mua trứng cũng có lỗi cùng loại: `ShopModel.sendBuyItem` gọi `RPC1200`, nhưng callback không kiểm tra `t.result===0`; response lỗi vẫn đóng hộp mua và ghi local buy record/dispatch event, không hiển thị lỗi. Nếu server từ chối do thiếu kim cương hoặc snapshot lệch, người chơi thấy “bấm Mua không phản hồi”.

## Kiểm tra toàn bộ server

| Server | Process | Người có pet | Đầy ô ghép | Có cặp đủ điều kiện nhưng thiếu item36 |
|---|---|---:|---:|---:|
| S1 | online | 306 | 15 | 63 |
| S2 | online | 87 | 4 | 25 |
| S3 | online | 82 | 3 | 24 |
| S4 | online | 59 | 4 | 19 |
| S5 | online | 53 | 6 | 17 |

Tất cả process dùng cùng `/linhhoasu/lhs/newServer`, cùng handler Pet SHA-256 `abe59d8a2531c633fe2b9c0e37beaf59df543a69f35b30c1ba26cf8a44f6f4b3`; không có node lệch phiên bản. Quét các log PM2 và log ứng dụng gần nhất không thấy lỗi/exception tag `3300`, `3302`, `3311` hoặc request của role S5. Đây là do handler hiện không log các response từ chối, không phải bằng chứng mọi thao tác đều thành công.

## Kiểm thử và phạm vi

- `test-pet-core-20260923.js`: PASS 5/5, `productionWrites=0`.
- `audit_pet_compose_20260923.js`: PASS 9 ca, `productionWrites=0`.
- Audit production chỉ đọc Mongo/config/hash/log, không gọi RPC thật, không sửa player, không cấp/bù pet.
- Probe RAM-only đúng request của client `RPC1200 {id:25,count:1}` với 1.176 kim cương: PASS, còn 1 trứng và kim cương còn1.076, `productionWrites=0`.
- Read-back S5 sau thời điểm người chơi test: role có `shopInfo.buyRecords[25]=4`, `diamond=76`, `egg25=0`, `field=14`; điều này chứng minh ít nhất 4 lượt mua đã được server ghi nhận, không phải route mua luôn hỏng. Cần xử lý client ACK lỗi/stale state để người chơi thấy kết quả.
- Log S5 có cảnh báo RPC1200 chậm khoảng 518–663ms và lịch sử từng có Mongo timeout/EPIPE; đây có thể làm cảm giác “không phản hồi”, nhưng lượt mua gần đây của role vẫn được commit. Chưa có log lỗi Pet/RPC1200 gắn đúng role để khẳng định một giao dịch cụ thể thất bại.
- Backup/source release cũ vẫn giữ nguyên; lượt này chưa sửa/deploy.

## Hướng xử lý cần duyệt riêng

1. Sửa client để chỉ xóa/cập nhật pet khi `result===0`; thất bại phải gọi error callback và hiển thị lý do.
2. Hiển thị trước điều kiện “đầy ô” và “thiếu item36”, tránh người chơi tưởng mất pet.
3. Không tự bù pet cho `Tuanpkt` khi DB hiện vẫn còn đủ 11 pet. Nếu người chơi còn thấy mất sau relog, cần lấy thời điểm/RPC hoặc ảnh trước-sau để đối soát tiếp.

## Trạng thái sau triển khai client

- Đã triển khai static-only bundle mới SHA-256 `e16e7570257586a53bea2a26cc144723b5b0b00deef6977957c7e85cb0112106`, cache key `20260924_pet_result_guard_v1`.
- Guard đã áp dụng cho `3300`, `3301`, `3302`, `3311` và mua `1200`: chỉ xử lý success khi `result===0`; lỗi ghép/mở/ăn/mua không còn xóa pet hoặc ghi nhận thành công cục bộ.
- Remote backup: `/linhhoasu/_ai_workbench/backups/pet_client_result_guard_20260924`; `pm2Restart=false`, `productionWrites=0`; served hash/guard marker PASS.
- Re-test sau patch trên chính phiên Browser: client tải đúng `?v=20260924_pet_result_guard_v1`; thử kéo cặp q2 UID100003/100002 khi item36=0. UI không xóa pet, DB giữ15 pet, diamond99326 không đổi, server vẫn báo điều kiện thiếu vật liệu. Đây là hành vi đúng sau fix; “ghép vẫn lỗi” hiện là thiếu item36 chứ không còn lỗi mất hình.
- Server đã bổ sung ACK thiếu vật liệu: `code=PET_COMPOSE_INSUFFICIENT_COST`, `missingItems` và thông báo trực tiếp `Thiếu Quả Linh ×5/×10`; rollout S5→S1→S2→S3→S4 readiness PASS, backup `/linhhoasu/_ai_workbench/backups/pet_missing_cost_message_20260924`.
