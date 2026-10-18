# Audit sự kiện và map từng xuất hiện — 04/09/2026

> Đã xử lý: Đại Chúa Tể/map 990008 đã được mở lại trong 365 ngày. Xem `_ai_workbench/reports/linkage365_20260904.md`.

## 1. Tóm tắt công việc

- Đã đối chiếu báo cáo cũ, 714 bảng config, source local, source/hash production, Mongo S1/S2, asset client, server list-param và route map thật.
- Hai sự kiện `Kim Mã/Vận May` (`43001`) và `Niên Thú` (`44001`) **không bị mất**; hiện vẫn active trên S1/S2 và không nằm trong `disabledEntryIds`.
- Phần đã biến mất là sự kiện liên kết `Đại Chúa Tể` và map `990008`.
- Nguyên nhân: cả `DAZHUZAI_LINKAGE` do server list trả về và `ActivityBaseConfig.linkageStartTime/linkageEndTime` đều hết hạn lúc `2026-09-01 23:00:00 +07:00`.
- Map/code/asset không bị rollback. Map `990008` vẫn có config, scene, điểm sinh, quái và route vào/ra.
- Kết luận: **có thể mở lại**, nhưng cần dời đồng bộ toàn bộ lớp lịch. Lượt audit này chưa sửa production vì người dùng chưa chọn ngày đóng mới.

## 2. File/thư mục đã thay đổi

### Tool/evidence mới

- `_ai_workbench/tools/audit_missing_events_maps_prod_20260904.py`: audit read-only config/Mongo/asset/hash.
- `_ai_workbench/tools/qa_linkage_map_990008_live_20260904.js`: fixture vào map và quay về map thường.
- `_ai_workbench/tools/run_linkage_map_990008_live_qa_20260904.py`: chạy QA map có cleanup.
- `_ai_workbench/tools/run_fortune_contracts_prod_readonly_20260904.py`: chạy contract sự kiện trên source production.
- `_ai_workbench/tools/read_recent_map_qa_logs_20260904.py`: đọc log map QA theo phạm vi hẹp.
- Evidence audit: `_ai_workbench/temp/missing_events_maps_prod_audit_20260904_100257.json`, SHA-256 `bd169c50a948823b83d2772ea5edbf1c5a7941e53cf48880f759907ab2433ee2`.
- Evidence map: `_ai_workbench/temp/linkage_map_990008_live_qa_20260904_100759.json`, SHA-256 `e14418e32f72132ee369506dda57d3589e1160a399a0498e2fffb838b1a3cc56`.
- Evidence contract sự kiện: `_ai_workbench/temp/fortune_contracts_prod_readonly_20260904_100926.json`, SHA-256 `9b721a1f51d48593dd22b1c9a6b0bb238063fe1577745affab91d7119434ce39`.

### Production

- Không sửa source, config, DB hoặc asset production.
- Không restart process.
- Hai fixture QA đã được cleanup, residue bằng `0`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Audit Mongo đầu tiên lỗi `Unexpected token ]` | Pipeline aggregate một dòng quá phức tạp, sai ngoặc | Đổi sang projection tối thiểu rồi cộng thống kê trong Node | Audit production ưu tiên truy vấn đơn giản, dễ kiểm chứng |
| Fixture map lần đầu timeout | Sau login có push map `10001`; request `1400` gửi trong cửa sổ chống duplicate 1,5 giây chỉ nhận ACK nhỏ | Fixture nhận cả ACK/push, chờ 1,7 giây và retry tối đa 3 lần | E2E map phải phân biệt ACK duplicate với push map thật |
| Ba contract sự kiện FAIL khi chạy local | Bốn module sự kiện local lệch hash production, không phải runtime VPS | Không dùng kết quả local để kết luận; upload contract và chạy read-only trên source production | Không deploy module sự kiện từ local trước khi đồng bộ snapshot production mới nhất |
| Tool đọc log lỗi console GBK | Log có tiếng Việt mà stdout Python dùng encoding hệ thống | Ép stdout UTF-8 với replacement an toàn | Tool Windows đọc log multilingual phải cấu hình encoding |

## 4. Kỹ năng / kinh nghiệm mới

- Một sự kiện có thể “mất” do ba gate độc lập: row activity, param thời gian server list và config thời gian client.
- Kiểm tra map phải gồm config + asset + monster manifest + enter/return E2E; thấy folder asset là chưa đủ.
- Source local của module event đang cũ hơn production; production hiện là nguồn chuẩn cho lần sửa kế tiếp.
- Map link `990008` là map đặc biệt được kích hoạt bởi linkage `index=7`, không phải map tiến độ mở rương trong `BoxConfig`.

## 5. Trạng thái hiện tại

### Kim Mã/Vận May và Niên Thú

- Config `43001`/`44001` tồn tại, yêu cầu level `>=30`.
- S1 `lhs_s1001`: `1.687` Player có cả hai row; `1.687` đang active; expired `0`, disabled `0`.
- S2 `lhs_s1002`: `580` Player có cả hai row; `580` đang active; expired `0`, disabled `0`.
- Khoảng kết thúc hiện tại:
  - S1: sớm nhất `11/09/2026 16:37 +07`, muộn nhất `17/09/2026 16:39 +07`.
  - S2: khoảng `17/09/2026 05:24–05:29 +07`.
- Contract chạy trên source production:
  - Activity 43/44: `51/51 PASS`.
  - Config/reward thật: `27/27 PASS`, đủ 714 bảng.
  - Theo dõi tiêu item `4/55/65`: `8/8 PASS`.

### Đại Chúa Tể và map 990008

- Lịch server-param: `14/07/2026 23:00 → 01/09/2026 23:00 +07`; hiện `open=false`.
- Lịch `ActivityBaseConfig` giống hệt; hiện `open=false`.
- Map `990008`: `type=1`, `sceneId=990008`, `4` điểm sinh, `50` slot quái sau 2×.
- Asset `map_greatRuler_001`: `131` file, `8.749.876` byte gồm `1 BIN + 65 JPG + 65 KTX`.
- Asset battle, minimap, main-map banner và audio Đại Chúa Tể vẫn có trong resource manifest.
- Live WS map QA `8/8 PASS`:
  - Vào `990008`, nhận đúng spawn `(3193,1588)`.
  - Quay về `10001`.
  - Persistence map thường trở lại `10001`.
  - Cleanup Player QA `remaining=0`.

### Những gì cần đổi để mở lại đầy đủ

1. `serverList.js` và `serverList1.js`: dời `DAZHUZAI_LINKAGE.start/end`.
2. Config server/client `config_e5ac72c2.bin`: dời `ActivityBaseConfig.linkageStartTime/linkageEndTime` đồng bộ.
3. `start.min_52ac8d58.js`: dời mốc theme đăng nhập Đại Chúa Tể nếu muốn khôi phục cả nền/chủ đề mở đầu.
4. Đổi cache/manifest phù hợp, chạy syntax/config decode/served hash.
5. QA param `2565`, icon đổi map, enter `990008`, quái/reward, quay về map thường, relog và rollback gate.

### Rủi ro cần chú ý

- Chỉ sửa server-param: client vẫn bị `ActivityBaseConfig` chặn.
- Chỉ sửa config client: `AppInfo.params.linkage` vẫn hết hạn.
- Map `990001–990006` có config/asset nhưng không có entry contract tương ứng được chứng minh trong audit; không nên public đồng loạt.
- Bốn module event local đang lệch hash production; không được upload local đè live khi mở lịch.

## 6. Bước tiếp theo

1. Người dùng chọn ngày/giờ đóng mới cho Đại Chúa Tể; ví dụ mở ngay và đóng sau 14 ngày.
2. Triển khai lịch đồng bộ ba lớp với backup/rollback.
3. Không cần “mở lại” Kim Mã/Niên Thú vì chúng đang active; nếu giao diện vẫn không thấy, cần ảnh/icon cụ thể và level nhân vật để kiểm tra điều kiện hiển thị level 30.
