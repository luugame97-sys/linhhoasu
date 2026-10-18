# Audit gói 68 ở Nhiệm Vụ → Tiên duyên — 04/09/2026

## 1. Tóm tắt công việc

- Đối chiếu ba ảnh người dùng cung cấp với chuỗi ngôn ngữ, class giao diện, config client/server và source production.
- Xác định chính xác đây là `ActivationMainWin`, tab `Tiên duyên / Nhiệm vụ`, dùng `activityType=7`; không phải `Phát tài ngay`, quỹ `activityType=1` hay Đặc quyền đăng nhập `activityType=9`.
- Khóa identity gói: `payId=10301`, giá `priceR=68`; Activity ID `7001` cho khu vực/S1 và `7051` cho khu vực/S2.
- Chạy audit MongoDB production chỉ đọc, ẩn danh; chạy fixture RAM trên đúng source/hash production đã đồng bộ local.
- Không sửa source/config/database, không mua thử, không cộng/bù quà và không restart process.

## 2. Nhận dạng contract chính xác

### Dấu hiệu từ giao diện

- `LanguageConfig[30033608] = Tiên duyên`.
- `LanguageConfig[30033609] = Nhiệm vụ`.
- `LanguageConfig[30033610] = Phúc lợi cơ bản`.
- `LanguageConfig[30033611] = Phúc lợi siêu ưu đãi`.
- Client mở hai tab trên trong `ActivationMainWin`.
- Panel Tiên duyên dùng `ActivityActivationData`, `activityType=7`, không dùng `ActivityLoginPrivilegesData` hay `ActivityFundData`.

### Config gói

| Khu vực | Activity ID | Pay ID | Giá R | Giá D | Giá NT | Điều kiện mở |
|---|---:|---:|---:|---:|---:|---|
| S1 / area 1 | 7001 | 10301 | 68 | 999 | 330 | Cấp nhân vật ≥ 15 |
| S2 / area 2 | 7051 | 10301 | 68 | 999 | 330 | Cấp nhân vật ≥ 15 |

- `Activity7TypeConfig` quy định `day=7`, `rechargeId=10301`.
- Hai bản config server/client khớp semantic cho Activity 7, PayConfig và ShopConfig của gói.
- Các mốc gốc: `0, 40, 80, 120, 160, 200, 240, 280, 320, 360, 400, 440, 480, 520, 560, 600`.
- Năm mốc `40/80/120/160/200` và reward trong ảnh khớp trực tiếp `Activity7Config[7001/7051][1]`.
- `ShopConfig[10301]` là `type=10`, nhưng toàn bộ `rewards/extraRewards/firstRewards/subsequentRewards` đều rỗng vì quà thật nằm trong `Activity7Config`.

## 3. Nguyên nhân gốc

### Lỗi 1 — resolver mua chưa hỗ trợ gói Activity 7

`RechargeRewardResolver.resolveRechargeRewards()` chỉ cho phép một số family chuyên biệt đã biết. Với `10301`, ShopConfig không có reward trực tiếp nên cả hai đường đều trả:

```text
SPECIALIZED_RECHARGE_REQUIRED
```

- Đường mua token tag `1230`: bị từ chối trước khi trừ token hoặc ghi record.
- Callback tiền thật: cũng bị từ chối trước khi cấp quyền lợi.
- Client không hiển thị lý do nghiệp vụ rõ ràng nên người chơi chỉ thấy bấm mua nhưng không có kết quả.

### Lỗi 2 — ghi trạng thái mua vào sai nguồn mà client không đọc

`RechargeBenefitService.applyRechargeBenefits()` hiện:

- ghi `rechargeInfo.records[{id:10301,...}]`;
- kích hoạt riêng Activity 9;
- không tìm Activity 7 theo area;
- không thêm `10301` vào `activityInfo.datas[].recordList`;
- không trả `activationPassUpdate` để push `1701`.

Trong khi client quyết định gói Tiên duyên đã mua bằng:

```text
activityData.recordList chứa rechargeId 10301
```

Vì vậy có recharge record vẫn không làm nút mua biến mất, không hiện trạng thái đã kích hoạt và không mở cột `Phúc lợi siêu ưu đãi`.

### Lỗi 3 — handler nhận quà và client dùng hai nguồn entitlement khác nhau

`operateActivationPass()` trên server lại coi player đã mua nếu `rechargeInfo.records` có `10301`, trong khi client chỉ coi đã mua nếu `activity.recordList` có `10301`.

Hệ quả:

- UI vẫn khóa cột ưu đãi.
- Server vẫn có thể cấp premium khi nhận request `1700`.
- Cùng packet `id=7001,module=0,index=0,param=0` được cả ô cơ bản và ưu đãi sử dụng; server tự quét mốc đầu tiên còn thiếu.
- Người chơi có thể bấm một ô cơ bản ở mốc sau nhưng server lại trả premium của mốc trước. Trạng thái nhìn thấy và phần thưởng thực tế không đồng bộ.

### Lỗi 4 — thiếu khóa mua một lần ở contract chuyên biệt

Dữ liệu cũ có một nhân vật mang `count=12`, một nhân vật `count=4` và các count khác lớn hơn 1. Vì client không thấy entitlement nên nút mua vẫn hiện; luồng cũ có thể ghi mua lặp.

Đây là dấu hiệu state mua lặp, chưa phải bằng chứng đã bị trừ tiền thật nhiều lần vì không có provider/order ledger để nối.

## 4. Audit production ẩn danh

Snapshot cuối: `2026-09-04T14:21:24Z` (21:21:24 UTC+7).

| Chỉ số | S1 / lhs_s1001 | S2 / lhs_s1002 |
|---|---:|---:|
| Tổng player | 1.749 | 581 |
| Player cấp ≥ 15 | 208 | 0 |
| Có row Activity 7 đúng khu vực | 192 | 0 |
| Có recharge record 10301 | 7 | 0 |
| Có entitlement 10301 trong activity.recordList | 0 | 0 |
| Có transaction/order 10301 | 0 | 0 |

Kết quả cho 7 nhân vật S1 có record mua:

- 7/7 có row `7001` đang mở.
- 7/7 có `rechargeInfo.records[10301]` nhưng 0/7 có `recordList[10301]`.
- Tổng purchase count đã ghi: 24.
- Tổng mốc đủ điều kiện: 38.
- Free đã đánh dấu nhận: 37; còn thiếu 1.
- Premium đã đánh dấu nhận: 33; còn thiếu 5.
- Không có record bit ngoài bộ hợp lệ `0/1/3`.

Điều này chứng minh lỗi entitlement/UI ở cả 7 trường hợp. Tuy nhiên không được kết luận cả 7 “không nhận bất kỳ quà nào”: ledger hiện cho thấy nhiều premium đã được server ghi nhận vì handler dùng recharge record làm nguồn mua, dù UI vẫn khóa.

S2 hiện chưa có player cấp 15 nên chưa có dữ liệu người chơi để quan sát lỗi. Contract S2 vẫn lỗi tiềm ẩn vì dùng chung pay ID `10301` và Activity ID `7051`.

## 5. Fixture RAM trên source hiện tại

Fixture không có `session.userId`, không thể persist:

- Mua token `10301`: trả `SPECIALIZED_RECHARGE_REQUIRED`.
- Token giữ nguyên.
- Không thêm purchase record.
- Không thêm entitlement.
- Khi dựng player cũ có recharge record nhưng recordList rỗng, server vẫn cấp premium `Nguyên bảo x400` của mốc 0; activity record thành `3`, còn client vẫn coi gói chưa mua.
- Bộ chọn theo area tạo `7001` cho S1 và `7051` cho S2 đúng config.

## 6. File/thư mục đã thay đổi

### Source production/game

- Không thay đổi.

### Tool hỗ trợ

- `_ai_workbench/tools/audit_activation_pass_remote_20260904.js` — audit catalog/source/hash/Mongo ẩn danh và fixture resolver.
- `_ai_workbench/tools/audit_activation_pass_prod_20260904.py` — chạy audit read-only trên VPS, không lưu credential vào output.
- `_ai_workbench/tools/test_activation_pass_current_contract_20260904.js` — contract RAM cho purchase, entitlement, claim và chọn Activity S1/S2.

### Evidence

- `_ai_workbench/temp/activation_pass_68_audit_20260904_142124.json`
- SHA-256: `f416d2815860cb88df531021f177e8d02173823c6e1e1be854e595f7d6147660`

### Backup báo cáo

- `_ai_workbench/backups/session_report_before_activation_pass_audit_20260904_2224/`

## 7. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Ban đầu nhận dạng nhầm Phát tài ngay | Ảnh toàn màn có nút 68 và hai cột giống family fund | Dùng icon Nhiệm Vụ + hai Lang ID tab để khóa `ActivationMainWin/type=7` | Nhận dạng bằng UI + class + config + protocol, không chỉ bằng giá |
| Có lúc nhận dạng nhầm Activity 9 | Tên Tiên duyên từng dùng cho gói khác trong báo cáo cũ | Đối chiếu mốc 40/80/120/160/200 và class `ActivityActivationData` | Một tên dịch có thể trùng nhiều module; phải khóa activityType/payId |
| Audit log bổ sung chạy chậm | Out log PM2 khoảng 7 GB | Chỉ đọc 8 MiB cuối; error log khoảng 1 MiB đọc đủ | Không quét full log lớn khi marker DB/source đã đủ |
| PowerShell pipeline lỗi parser | Pipe đặt ngay sau block foreach | Gom kết quả vào mảng rồi format | Tránh pipe trực tiếp sau block phức tạp |
| Fixture có ba packet cùng reward snapshot | Server gửi nhiều notification packet cho một lần grant | Kiểm tra delta inventory thực là 400, không cộng ba lần | Luôn phân biệt mutation với packet thông báo |

## 8. Kỹ năng / kinh nghiệm mới

- `rechargeInfo.records` là lịch sử mua tổng quát; `activity.recordList` mới là entitlement mà Activity 7 client dùng.
- Reward ledger của Activity 7 dùng `records[param]`: `1` là free đã nhận, `3` là free + premium đã nhận.
- Gói `10301` là activation-only; không được fallback sang reward tổng quát và không được lấy quà từ ShopConfig rỗng.
- Một pay ID có hai Activity ID theo area; fix phải chọn `7001/7051` theo server/area, không hard-code S1.
- Purchase success phải kích hoạt entitlement, push Activity update và chống mua lặp trong cùng một transaction/rollback boundary.

## 9. Trạng thái hiện tại

- Đã xác định chính xác nguyên nhân và phạm vi dữ liệu.
- Server/client catalog khớp; lỗi nằm ở resolver/activation/state contract, không nằm ở hình ảnh hoặc lệch PayConfig.
- Mua mới hiện fail-closed trước khi trừ token trong fixture source hiện tại.
- Bảy player S1 có state cũ lệch; S2 chưa có player đủ cấp để quan sát.
- Chưa sửa production, chưa restart và chưa bù quà.

## 10. Phương án sửa đề xuất

1. Tạo resolver chuyên biệt Activity 7 cho pay `10301`: activation-only, `multi=1`, giá đúng catalog, từ chối mua lặp server-side.
2. Khi purchase thành công, chọn Activity `7001/7051` theo area, seed nếu cần và thêm `10301` vào `recordList` idempotent.
3. Trả/push packet `1701` sau purchase để client đổi ngay trạng thái nút và mở cột premium.
4. Thống nhất nguồn entitlement cho claim: ưu tiên `recordList`; khi đăng nhập có thể self-heal recordList từ recharge record cũ đã xác thực.
5. Bổ sung `activityInfo` vào snapshot rollback của token purchase trước khi mutation.
6. Contract test đủ 16 mốc: free, premium, nhận trùng, click lệch ô, mua lặp, thiếu token, cash amount mismatch, relog/restart và S1/S2.
7. Repair 7 player theo hướng tối thiểu: chỉ thêm entitlement còn thiếu, giữ nguyên `records[param]`; không tự cộng 5 premium/1 free vì người chơi có thể tự bấm nhận sau khi UI mở.
8. Không bù tiền/quà theo `purchase count` cho tới khi có ledger order/provider đủ tin cậy.

## 11. Làm rõ chu kỳ đổi mới

- Gói `Tiên duyên` không đổi mới và không yêu cầu mua lại mỗi ngày.
- `Activity7TypeConfig[7001/7051][1].day=7`: client chia hoạt động thành chu kỳ 7 ngày và hiển thị thời gian còn lại tới biên 7 ngày kế tiếp.
- Tab `Nhiệm vụ` dùng 12 task type 2; toàn bộ có `updateCycle=1`, nên phần nhiệm vụ được cấu hình làm mới hằng ngày.
- Điểm nhiệm vụ phải được cộng dồn vào track Tiên duyên trong chu kỳ để mở các mốc tới 600.
- Source server hiện chưa có rollover Activity 7 hoàn chỉnh: khi row hết window, `syncActivationPassActivity()` chỉ thay `startTime/endTime`, nhưng giữ nguyên `score`, `records` và `recordList`. Vì vậy timer có thể sang chu kỳ mới nhưng tiến độ/quà/quyền mua không được reset nhất quán.
- Khi sửa phải chốt contract: nhiệm vụ reset ngày; track, entitlement và reward ledger reset đúng chu kỳ 7 ngày; tuyệt đối không bắt mua lại mỗi ngày.
