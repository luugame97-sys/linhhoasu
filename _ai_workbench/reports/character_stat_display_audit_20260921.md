# Audit chỉ số nhân vật hiển thị sai — 21/09/2026

## Cập nhật sau sửa — 21/09/2026 21:23 GMT+7

Đã triển khai bản vá hẹp cho bundle đang phục vụ, chỉ đổi `formatAttrValue1` (thuộc tính nhân vật) và `overLengthPower` (ô lực chiến), giữ nguyên raw value, phần trăm và formatter số lượng vật phẩm.

- Baseline remote: bundle `5df03c08...`, index `0697e64b...`; đã backup tại `/linhhoasu/_ai_workbench/backups/attr_units_fix_20260921`.
- Candidate/served bundle: `bd7979c98148a2066832fc2ab8d8210a55f21c52788555b20850f0d235ca4585`; index: `e4f677a4c34e7611fdee1498e9b4c7842603e589269184ca23d65e48058ef2aa`.
- Cache key mới: `20260921_attr_units_v1`; stage `node --check`, CAS, atomic rename và HTTP served-hash đều PASS.
- Postcheck live: `200000 → 200000`, `200000000 → 200.00Tr`, `154795631 → 154.80Tr`, `452972957 → 452.97Tr`, `1000000000 → 1.00Tỷ`; phần trăm `10000 → 100%`, `10001 → 100.01%`; generic item-count formatter giữ nguyên.
- Static-only: không restart PM2, `productionWrites=0`, không ghi DB/player. Browser reload đã tải URL bundle mới; warning `syncFullPower/curIndex` và lỗi `isCanGetIllusReward.indexOf` vẫn là lỗi nền riêng, chưa gán cho formatter.
- Hậu kiểm `/ready` cả 5 cổng 8080/8083/8084/8085/8086 đều `status=ok`, Mongo/Redis checks `true`.

## Kết luận

Đã tái hiện **lỗi nhãn đơn vị ×10 ở bảng thuộc tính chung**, từ đúng bundle và language binary đang phục vụ công khai. Chưa xác nhận trường hợp chính xác **200.000 HP → 2 tỷ HP**: với đầu vào 200.000, hàm hiện tại vẫn trả `200000`.

Ở thời điểm audit trước deploy chưa sửa source game, chưa restart, chưa đăng nhập/phát RPC gameplay và chưa ghi player; phần triển khai sau đó được ghi ở mục cập nhật đầu báo cáo.

## Bằng chứng formatter trên bản public

Kiểm lúc 20:30 GMT+7, **trước deploy**. Index khi đó nạp `js/main.min_drop100.js?v=20260920_gmt7_sync_v1`; không phải `main.min_a6195824.js` dù file đó cũng truy cập HTTP được.

- Main SHA-256 `5df03c08bbe2c3b19bfdd6394bffc8fdb7b29da8658ec2bd4266503142364cf6`, khớp byte với local.
- Language SHA-256 `8d41ea06a4406d7e70ab5790b07c36927f2c42e07c538f9190712764760d154f`, 817.027 byte, khớp file đọc trực tiếp trên VPS. Không lấy bản language local khác hash làm nguồn kết luận.
- Giải mã language public xác nhận `30090590 = "Tỷ"`, `30020171 = "Tỷ"`.
- `GameUtil.formatAttrValue1` / `CSe.formatAttrValue1` tại main line 366 dùng `value / 1e8` từ ngưỡng `1e8`, rồi nối ID `30090590`. Đây là đơn vị 100 triệu của bản Trung, nhưng nhãn Việt lại là tỷ (1e9).

Đã chạy hàm trích nguyên văn từ public bundle trong VM, với cấu hình HP `AttrConfig[1].dataType=1` và language public:

| HP đầu vào | Chuỗi hàm hiện tại trả | Đúng theo đơn vị Việt |
|---:|---|---|
| 200.000 | `200000` | 200.000 |
| 200.000.000 | `2.00Tỷ` | 200 triệu |
| 209.300.000 | `2.09Tỷ` | 209,3 triệu |
| 2.000.000.000 | `20.00Tỷ` | 2 tỷ |

Đây là kiểm tra thực thi formatter từ byte live, **không phải ảnh UI của tài khoản đang đăng nhập**.

## Vì sao cả bản thân và xem người khác đều sai

- Self-profile lấy `RoleModel.getAllAttr()` rồi gán `attrList_1.itemRenderer=g7` (main line 543).
- Other-profile lấy `response.totalAttr` rồi dùng cùng `g7` / `OtherPlayerInfoAttrItem` (line 543).
- `g7` kế thừa `Al` / `MainPanelAttrInfoItem`; renderer chung gán `"+" + GameUtil.formatAttrValue1(id,value)` (line 332).
- Do dùng chung renderer, HP/thuộc tính kiểu số nguyên đạt 100 triệu đều chịu lỗi nhãn. Các ô lực chiến có addon định dạng riêng không chứng minh bảng HP đã được sửa.

## Đối chiếu hồ sơ thật trên VPS

Lúc 20:18:35 GMT+7, đọc đầy đủ hai hồ sơ mẫu trong `lhs_s1001`; áp dụng cấu hình PM2 `lhs-s1001`, chạy `BattleService.calcPlayerPower`, `buildOtherPlayerDetail`, `buildPlayer500Data` trên bản sao trong tiến trình audit. Không gửi packet ra client, không dùng session đang chơi.

| Mẫu | HP từ calculator | `totalAttr[1]` khi dựng hồ sơ người khác | Chuỗi từ formatter hiện tại |
|---|---:|---:|---|
| Talo/S1, cấp 175 | 154.795.631 | 154.795.631 | `1.55Tỷ` |
| FoxPlayer/S1, cấp 678 | 452.972.957 | 452.972.957 | `4.53Tỷ` |

- Talo có đủ 12 ô trang bị trong login builder, gồm 10 món Drop100; không tái hiện mất trang bị trong probe này.
- Bỏ `oldTrekInfo` khỏi bản sao để tính lại: HP chính của cả hai mẫu **không đổi** (delta 0). Cả hai chỉ có skin thuyền 300001.
- HP đội thủy thủ OldTrek là hệ riêng: Talo 8.668; không phải HP chính 154.795.631. Không có bằng chứng quy lỗi nhãn HP chính cho logic tăng trưởng thủy thủ.
- `suppliedDocMutated=false`, `dbSameOnReadback=true` cho cả hai; guard save/create không bị gọi (`blockedWriteAttempts=0`).
- Các số trên là **kết quả code server hiện tại trên snapshot DB**, không phải chứng minh mọi nguồn thuộc tính của client và combat simulator đã cân bằng/đồng nhất. Chưa có cặp `RoleModel.getAllAttr()` + packet cùng thời điểm của tài khoản trong ví dụ người dùng.

Probe inventory đầu tiên bị thiếu `boxInfo` trong projection và chưa áp dụng đúng environment PM2, nên số HP chính 144.176.370 của Talo từ probe đó **không dùng làm kết luận**. Đã gắn cờ invalid trong artifact và khóa chế độ inventory; số từ full-document probe bên trên thay thế nó.

## Đối chiếu bản sửa ngày 20/09

Báo cáo cũ ghi từng phát hành formatter chia 1e9/1e6, candidate còn tại `_ai_workbench/temp/attr_format_fix_20260920/candidate_main.min_drop100.js`, hash `eeb67048b6621bfa08c1837b4122ce7bb4572024fb70424949d63b5a53bbd988`.

Candidate thực sự trả `209.30Tr` cho 209.300.000. Nhưng **current public bundle khác candidate và vẫn chứa công thức cũ**, index cũng không còn marker `20260920_attr_format_v1`. Vì vậy kết luận “đã sửa” trong báo cáo cũ không mô tả trạng thái hiện tại. Chưa đủ bằng chứng quy trách nhiệm cho lần triển khai cụ thể nào; không gọi đây là lỗi cache người chơi đơn thuần.

## Giới hạn và bước tiếp theo

- Browser hiện dừng ở đăng nhập; không tự dùng thông tin đã điền sẵn để vào tài khoản. Log tải trang xác nhận bundle query GMT7 và addon power-relogin V2, nhưng không có ảnh hồ sơ sau đăng nhập.
- Browser log còn một warning riêng `lhs-power-relogin-v1.js`: `syncFullPower` đọc `curIndex` khi model chưa có dữ liệu ở màn đăng nhập. Warning này chưa được quy là nguyên nhân HP ×10, vì lỗi đơn vị đã tái hiện độc lập từ formatter thuần với input số.
- Để chốt riêng ví dụ 200k → 2 tỷ, cần đúng tên nhân vật/server và ảnh màn hình hoặc phiên đã đăng nhập tại màn lỗi. Không tự chuyển giả định 200k thành 200 triệu.
- Bản vá đã thực hiện đúng phạm vi trên. Còn thiếu native/account E2E sau đăng nhập để xác nhận ảnh của đúng tài khoản; không giảm HP trong DB để bù lỗi chữ.

## Bằng chứng / tái kiểm

- `_ai_workbench/temp/stat_formatter_verified_20260921.json`: byte hash public, dictionary, công thức, kết quả thực thi và tuyến renderer.
- `_ai_workbench/temp/character_stats_targeted_20260921.json`: full-document probe, raw attrs, payload builder, ablation OldTrek và read-back.
- `_ai_workbench/tools/audit_stat_formatter_20260921.js` — chạy bằng Node, chỉ GET public + VM formatter, ghi evidence local.
- `_ai_workbench/tools/audit_oldtrek_power_live_20260921.py --targeted` — SSH đọc-only hai mẫu, không chạy chế độ inventory cũ.
