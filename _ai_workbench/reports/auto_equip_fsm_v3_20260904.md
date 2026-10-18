# Auto-equip FSM v3 — sửa đúng luồng tự mặc đồ mạnh hơn

## 1. Tóm tắt công việc

- Đã phân tích lại toàn bộ luồng từ cờ UI → `IdleFightStateSelect.dealSelect()` → RPC `2200` → server replace → client model → sale `2201` → tiếp tục Ủy thác.
- Nguyên nhân thật: client gọi `CheckAutoStop()` trước rồi chỉ tìm món mạnh trong danh sách mà hàm này trả về. Đây là danh sách đồ có thể bán, không phải toàn bộ đồ rơi.
- `CheckAutoStop()` cố ý không đưa trang bị của slot trống vào danh sách bán. Nó cũng giữ lại trang bị đạt điều kiện phẩm chất/thuộc tính. Vì vậy tài khoản mới và nhiều món mạnh cần giữ không bao giờ được xét auto-equip.
- V3 tạo hai bản sao của toàn bộ drop:
  1. Một danh sách dùng để tìm món tăng lực mạnh nhất theo từng slot.
  2. Một danh sách dùng policy giữ/bán hiện có.
- Món đã chọn để mặc được loại khỏi cả danh sách giữ và bán. Sau ACK server thành công, đồ cũ yếu hơn mới được đưa vào sale.
- Nếu RPC từ chối hoặc power không tăng, Ủy thác tắt và toàn bộ món chưa xử lý quay về popup thủ công; không mất/bán nhầm đồ.

## 2. File/thư mục đã thay đổi

### Source production/local

- `linhhoasu/webgame/game/js/main.min_a6195824.js`: thay thuật toán `autoEquipPowerUpgrade()` bằng FSM v3.
- `linhhoasu/webgame/game/index.html`: cache marker `20260904_auto_equip_fsm_v3`.
- Server `EquipService.js` và `handlers/item.js` không đổi; guard server hiện tại đã đúng.

### Tool, test và evidence

- `_ai_workbench/tools/patch_auto_equip_fsm_v3_20260904.py`.
- `_ai_workbench/tools/test_auto_equip_fsm_runtime_20260904.js`: trích và thực thi chính hàm FSM trong bundle.
- `_ai_workbench/tools/qa_auto_equip_live.js`: mở rộng fixture slot trống và nâng cấp hai bước.
- `_ai_workbench/tools/run_auto_equip_live_v3_qa_20260904.py`.
- `_ai_workbench/tools/deploy_auto_equip_new_accounts_20260904.py` và `audit_auto_equip_new_accounts_postdeploy_20260904.py` được mở rộng cho v3.
- Deploy evidence: `_ai_workbench/temp/auto_equip_new_accounts_deploy_20260904_073004.json`, SHA-256 `f3c0d748b213851957884500870d661825513ebd8bdd569464f5caeb98ac7d8d`.
- Hậu kiểm độc lập: `_ai_workbench/temp/auto_equip_new_accounts_postdeploy_20260904.json`, SHA-256 `4faa1a2dc8a75abf0aefe7cf66f9ad6019cfb3c32af37e0a0b06bb1be9624f31`.
- Live WS QA: `_ai_workbench/temp/auto_equip_live_v3_qa_20260904_073117.json`, SHA-256 `97c18e8ea41fc83b3d2906b7de640dffd53c93097514dcb27e6f6445e9031ccb`.
- Test log: `_ai_workbench/logs/auto_equip_fsm_v3_tests_20260904_1432.log`, SHA-256 `cfa099896674fc765f98eee6e4145c22a0969f581df1fafb6f32763cea86ce9c`.
- Backup production: `/linhhoasu/_ai_workbench/backups/auto_equip_new_accounts_20260904_073004/`.
- Backup local: `_ai_workbench/backups/auto_equip_fsm_v3_local_pre_20260904_143200/`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Tick auto-equip nhưng acc mới vẫn không tự mặc | FSM chỉ xét output `CheckAutoStop()`, tức nhóm được phép bán; slot trống luôn nằm ngoài nhóm này | Chọn best upgrade từ toàn bộ drop, sau đó áp policy giữ/bán cho phần còn lại | Test bắt buộc slot trống và món mạnh thuộc diện giữ |
| Món phẩm chất cao mạnh hơn vẫn mở popup | Món đạt điều kiện giữ còn trong `s`, không đi vào candidate `o` | Candidate lấy từ toàn bộ `e`; món đã mặc được xóa khỏi `s/r` theo UID | Policy giữ không được ngăn việc mặc món tăng lực khi người chơi đã opt-in |
| Live QA lần đầu kỳ vọng bán món bằng lực chiến | Server safe-sale chỉ bán món chắc chắn yếu hơn, đúng thiết kế | Đổi kỳ vọng: món bằng lực chiến phải nằm trong `ignoredUids` và vẫn tồn tại | Không dùng `<=` cho auto-sale nếu yêu cầu là chỉ bán đồ yếu |
| Live QA lần hai còn biến `base` cũ | Fixture đổi từ slot có đồ sang slot trống nhưng một assert readback chưa đổi tên | Sửa assert kiểm tra `first` đã bán, `equal` và preset-protected còn nguyên; cleanup vẫn 0 | Khi đổi fixture phải rà toàn bộ setup/request/readback/cleanup |

## 4. Kỹ năng / kinh nghiệm mới

- `CheckAutoStop()` là policy phân loại giữ/bán, không phải nguồn candidate thích hợp cho auto-equip.
- Thứ tự đúng: chọn upgrade từ toàn bộ drop → loại selected UID → phân loại phần còn lại → server validate → client cập nhật sau ACK → sale an toàn.
- Client FSM contract phải được thực thi với stub RPC/model; chỉ tìm marker không chứng minh control flow.
- Live server E2E cần phủ slot trống, replace lần hai, equal-power, protected preset, persistence và cleanup.

## 5. Trạng thái hiện tại

- Production v3: PASS.
- Client runtime FSM 19 checks PASS:
  - Slot trống được mặc.
  - Món mạnh thuộc điều kiện giữ vẫn được mặc.
  - Nhiều món cùng slot chọn món mạnh nhất.
  - RPC từ chối thì tắt Ủy thác và mở popup đầy đủ.
- Live WebSocket production 18 checks PASS:
  - Mặc lần đầu `power 0 → 400`.
  - Nâng cấp lần hai `400 → 800`.
  - Bán đúng đồ cũ yếu hơn.
  - Giữ món bằng lực chiến.
  - Giữ UID đang dùng ở preset khác.
  - Mongo readback đúng; cleanup `remaining=0`.
- Hash production/local:
  - Main: `119448ca7b4e7df1ac3aef7e513144eaaf38b7e90ba3fa63f53c5df636fe8495`.
  - Index: `6bd3d47f526217d1c5f6660dd8d7824fe116b8ac315536cf322db7461f24698d`.
- Served bundle có marker FSM v3, all-drop list và selected-UID removal đúng một lần.
- UI stateA/stateB, null-safe `baseGroup`, hướng dẫn nhiệm vụ, Tĩnh lặng nhận thưởng và quái 2× được giữ nguyên.
- PM2/PID/restart counter không đổi; S1/S2 `/ready=200`, bot `580/580`, `2.466` slot, `invalid=0`; recent error scan rỗng.
- Chưa có E2E trực quan bằng tài khoản người dùng sau khi họ tải marker v3. Runtime bundle và live server bridge đều đã PASS.

## 6. Bước tiếp theo

1. Đóng hoàn toàn tab/game cũ hoặc `Ctrl+F5` để nhận `20260904_auto_equip_fsm_v3`.
2. Mở `Ủy thác tự động`, tick `Tự mặc đồ mạnh hơn`, rồi bấm `Bắt đầu`.
3. Với slot trống: món có power dương sẽ được mặc ngay.
4. Với slot đã có đồ: chỉ món có power lớn hơn mới được mặc; món bằng/yếu không thay.
5. Nếu vẫn không hoạt động, gửi ảnh console sau khi marker v3 đã tải; khi đó cần bắt request `2200` của đúng tài khoản thay vì sửa tiếp theo suy đoán.
