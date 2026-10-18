# Audit gói Đặc quyền đăng nhập giá 68 — 04/09/2026

> Đã xử lý: Activity 9 đã được khôi phục trên production; xem `_ai_workbench/reports/login_privilege_68_fix_20260904.md`.

## 1. Tóm tắt công việc

- Đã kiểm tra read-only toàn bộ chuỗi `PayConfig 10501/10502 → recharge record → Activity 9 → ngày mở → recordList/records → claim handler → reward packet` trên production.
- Giá production của `10501` và `10502` đều đúng `68`.
- Quyền mua vẫn được ghi đúng: `RechargeBenefitService` gọi `activateActivity9ForPayId()`, thêm pay ID vào `rechargeInfo.records` và `activityInfo.datas[].recordList`.
- Lỗi nằm ở pha nhận quà:
  - `Activity9Service.js` vẫn tồn tại.
  - `recharge.js`, `compat.js` và `RechargeBenefitService.js` vẫn tích hợp Activity 9.
  - Nhưng `activity.js` hiện không import Activity9Service, không còn `operateLoginPrivileges()` và không có nhánh `activityType === 9`.
  - Khi bấm nhận, request rơi vào generic branch: chỉ tăng `row.record`, trả `result=0` nhưng `rewardInfo.items=[]`; `records[day]` không được set.
- Luồng đăng nhập cũng không còn gọi `ensureActivity9State()`, nên `score`/ngày mở có thể không tiến theo ngày đối với row cũ.
- Đây là regression sau khi module `activity.js` được thay trong đợt sửa Kim Mã/Niên Thú ngày 02/09. Đây là suy luận dựa trên việc hash production hiện tại `1e7af...` đúng hash đợt Activity 43/44 và bản đó thiếu toàn bộ branch Activity 9.
- Không sửa source, không bù quà và không thay đổi Player trong lượt chẩn đoán này.

## 2. File/thư mục đã thay đổi

### Snapshot/tool/evidence

- `_ai_workbench/tools/snapshot_login_privilege_prod_20260904.py`.
- `_ai_workbench/tools/audit_login_privilege_purchases_remote_20260904.js`.
- `_ai_workbench/tools/audit_login_privilege_purchases_prod_20260904.py`.
- `_ai_workbench/tools/simulate_login_privilege_current_remote_20260904.js`.
- `_ai_workbench/tools/run_login_privilege_current_repro_20260904.py`.
- Production snapshot: `_ai_workbench/temp/login_privilege_prod_snapshot_20260904/manifest.json`, SHA-256 `0cb35f5e9cc9aa13de92fab16d319a433bc4f7a34ae03e11b88f12a9c58c60d8`.
- Anonymized purchase audit: `_ai_workbench/temp/login_privilege_purchase_audit_20260904_104154.json`, SHA-256 `2b25566e9d8f16326039c09db4da792e6812608d6c66405470bacf0ea8cc7620`.
- Exact current-handler reproduction: `_ai_workbench/temp/login_privilege_current_repro_20260904_104355.json`, SHA-256 `fe17d185597ca9d3a343b42cfb0f59238fcdc8b66d40918180c16f339ce2b73c`.

### Production

- Không thay đổi production.
- Không restart process.
- Audit chỉ đọc và fixture chỉ chạy trên player RAM không có `session.userId`, nên không persist.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Kết luận / phương án | Cách tránh lặp lại |
|---|---|---|---|
| Mua 68 nhưng nhận quà rỗng | `activity.js` thiếu branch `activityType === 9` | Merge hẹp handler Activity 9 vào bản Activity 43/44 hiện tại | Contract event phải phủ đồng thời type 9, 43 và 44 trước deploy |
| Bấm nhiều lần nhưng ngày vẫn chưa nhận | Generic branch chỉ tăng `row.record`, không set bit `records[day]` | Khôi phục `operateLoginPrivileges()` và bitmask 1=free, 2=premium | Không coi `result=0` là thành công nếu reward rỗng/ledger không đổi |
| Ngày mở có thể đứng ở 1–3 | Login/player payload không gọi `ensureActivity9State()` | Khôi phục seed/lifecycle Activity 9 trong luồng login | Login contract phải kiểm tra score tăng theo elapsed day |
| Audit Node đầu tiên lỗi parser | Script query một dòng quá dài, sai ngoặc | Tách thành JS định dạng rõ, `node --check` trước upload | Tool production phức tạp phải có file riêng và syntax gate |
| Không có transaction Mongo dù có quyền mua | Sáu quyền hiện có được xác nhận bằng player recharge ledger; collection transaction không có order `10501/10502` | Không suy ra kênh tiền mặt; dùng `rechargeInfo.records` làm bằng chứng entitlement gameplay | Tách bằng chứng mua gameplay với bằng chứng provider/cash order |

## 4. Kỹ năng / kinh nghiệm mới

- Activity 9 có hai ledger độc lập:
  - `rechargeInfo.records`/`recordList` xác nhận đã mua.
  - `records[day]` xác nhận đã nhận free/premium của từng ngày.
- `row.record` tăng không có nghĩa đã nhận quà; trong lỗi hiện tại nó chỉ đếm số lần generic handler bị gọi.
- Khi nhiều event dùng chung `activity.js`, deploy một candidate theo từng event riêng có thể làm lùi branch của event khác dù syntax/core vẫn PASS.
- Repair đúng không cần cộng bù mù: sau khi khôi phục handler, request module 0 có thể sweep toàn bộ ngày đã mở nhưng chưa có bit claim, giữ idempotency.

## 5. Trạng thái hiện tại

### Bằng chứng code/runtime

- `Activity9Service.js` production tồn tại, SHA-256 `688a4a59f34fe91facea9d2072ee1da8bd92b13b85668f4d7ed896376824bd71`.
- `activity.js` production SHA-256 `1e7af70a7c5c75efcb411d6a322af98f1d81bc3a3acf479837cfeb86943a9cb8`.
- `activity.js` không có:
  - Import `Activity9Service`.
  - Hàm `operateLoginPrivileges`.
  - Nhánh `activityType === 9`.
- Reproduction trên chính source production:
  - Activity type `9`, giá `68`, `recordList=[10501]`, `score=3`.
  - Bấm nhận: `row.record 0→1`.
  - `records={}` giữ nguyên.
  - `items={}` giữ nguyên.
  - Response `1700 result=0` nhưng `rewardItems=[]`.

### Bằng chứng Player đã mua

- Tổng `6` tài khoản người thật, tất cả ở S1.
- Cả 6 đều có:
  - `rechargeInfo.records[{id:10501,count:1}]`.
  - Activity `9001` và `recordList=[10501]`.
  - Row còn mở, không hết hạn.
  - Thiếu quà premium của ít nhất một ngày.
- S2 chưa có người mua `10501/10502`.
- Không có transaction Mongo product `10501/10502`; điều này không phủ nhận entitlement gameplay nhưng không đủ để xác nhận kênh tiền mặt/provider.
- Năm tài khoản đã nhận đủ free+premium ngày 1 (`records[1]=3`) trước regression, nhưng đang thiếu ngày 2–4.
- Một tài khoản cấp 35 khớp ảnh rất sát:
  - Activity bắt đầu `02/09/2026 11:50 +07`, hết hạn `09/09/2026 11:50 +07`.
  - `score=3`, tức giao diện mở ngày 1–3.
  - `record=10`, tức đã bấm vào generic claim nhiều lần.
  - `records={}`, nên chưa nhận free hoặc premium ngày 1–3.
- Danh tính trong evidence được băm ẩn danh; không ghi username/order/token.

### Phạm vi ảnh hưởng

- Claim gói miễn phí và đặc quyền của Activity 9 đều bị ảnh hưởng vì cùng dùng module 0.
- Purchase activation vẫn hoạt động, nên gói hiển thị đã mua nhưng reward claim thất bại.
- Các row hiện còn trong cửa sổ 7 ngày; cần sửa trước khi chúng hết hạn hoặc phải có kế hoạch gia hạn/repair riêng.

## 6. Bước tiếp theo

1. Merge hẹp Activity 9 vào `activity.js` production hiện tại, giữ toàn bộ logic Kim Mã/Niên Thú.
2. Khôi phục `ensureActivity9State()` trong login/payload để score tăng đúng ngày và account level ≥30 được seed row.
3. Viết suite kết hợp:
   - Type 9 + type 43/44 cùng PASS.
   - Free/premium ngày 1–7, sweep ngày bỏ lỡ, duplicate, expired/future.
   - Purchase 68 → activation → claim → relog/restart.
4. Chạy dry-run repair cho 6 subject, snapshot từng Player; ưu tiên cho người chơi tự claim lại các ngày thiếu sau khi fix thay vì cộng quà thủ công.
5. Chỉ bù tự động nếu E2E chứng minh sweep không thể phục hồi một row cụ thể.
