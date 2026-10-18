# Triển khai phương án sạch cho menu Ủy thác — v4

## 1. Tóm tắt công việc

- Đã tách lại hai chức năng từng bị ghép nhầm:
  - `Dừng khi lực chiến cao hơn` dùng checkbox native `powerCheckBox` và cờ `enoughPower` như thiết kế gốc.
  - `Tự mặc đồ mạnh hơn` dùng checkbox EUI native riêng và cờ `autoEquipUpgrade`.
- Buộc tài khoản cũ và mới cùng dùng giao diện đầy đủ `stateA`; không còn trường hợp tài khoản mới bị ẩn điều kiện lực chiến hoặc `Đồng thời/Hoặc`.
- Khôi phục persistence của `enoughPower`; không còn ép cờ này về `false` mỗi lần tải cấu hình.
- `Đồng thời/Hoặc` hiện có lại cả visual selected và semantic khác nhau khi bật điều kiện lực chiến.
- Giữ nguyên FSM auto-equip v3: xét toàn bộ đồ rơi, hỗ trợ slot trống, chọn món mạnh nhất mỗi slot và chỉ cập nhật client sau ACK server.
- Production triển khai client-only; không restart game server, bot, WebGM hoặc admin.

### Logic `Đồng thời/Hoặc`

- Điều kiện phẩm chất cơ bản vẫn là nền bắt buộc.
- Khi bật thêm `Dừng khi lực chiến cao hơn`:
  - `Đồng thời`: phẩm chất + lực chiến + nhóm thuộc tính đã chọn phải cùng thỏa.
  - `Hoặc`: phẩm chất phải thỏa và chỉ cần lực chiến hoặc nhóm thuộc tính thỏa.
- Khi không bật điều kiện lực chiến, hai radio không sáng vì không có toán hạng lực chiến để kết hợp; policy thuộc tính vẫn hoạt động như cũ.
- Checkbox auto-equip hoàn toàn độc lập, không điều khiển hai radio này.

## 2. File/thư mục đã thay đổi

### Source production/local

- `linhhoasu/webgame/game/js/main.min_a6195824.js`:
  - Khôi phục nhãn/flag/handler của `powerCheckBox`.
  - Giữ checkbox auto-equip riêng, hiển thị cho mọi tài khoản.
  - Dùng giao diện đầy đủ `stateA` cho mọi `createTime`.
  - Khôi phục normalize/persistence của `enoughPower`.
- `linhhoasu/webgame/game/index.html`: marker `20260904_auto_delegate_clean_v4`.
- Không thay đổi `gameEui_18e11b8e.bin`, `EquipService.js`, `handlers/item.js` hoặc DB production.

### Tool, test và evidence

- `_ai_workbench/tools/patch_auto_delegate_clean_controls_v4_20260904.py`.
- `_ai_workbench/tools/test_auto_delegate_clean_controls_v4_20260904.js`.
- `_ai_workbench/tools/audit_auto_delegate_all_controls_20260904.js`.
- `_ai_workbench/tools/qa_auto_delegate_settings_relog_20260904.js`.
- `_ai_workbench/tools/run_auto_delegate_settings_relog_20260904.py`.
- `_ai_workbench/tools/deploy_auto_delegate_clean_v4_20260904.py`.
- Deploy evidence: `_ai_workbench/temp/auto_delegate_clean_v4_deploy_20260904_092414.json`, SHA-256 `b385d2ca435d464b486edf773eed882e2ba17918e6308356fdbe447a5c8d12c3`.
- Hậu kiểm độc lập: `_ai_workbench/temp/auto_equip_new_accounts_postdeploy_20260904.json`, SHA-256 `344938b8c4c3267e4f58588f0de9315e17ed87ca5db739da84d248f4b12e850e`.
- Live auto-equip sau deploy: `_ai_workbench/temp/auto_equip_live_v3_qa_20260904_092452.json`, SHA-256 `504083071743809e586cfb5d0406f05f2df9e9b6d6df331c70b6d35dd907ccc2`.
- Settings/relog sau deploy: `_ai_workbench/temp/auto_delegate_settings_relog_qa_20260904_092458.json`, SHA-256 `4f09a97c82b8575565ea99ccb3d9467cfb32fca5bf4006919620a8cc3d648e91`.
- Snapshot production: `_ai_workbench/temp/auto_equip_new_accounts_prod_20260904/manifest.json`, SHA-256 `e55c37be52d3b030e5cd18934c9e7c1337d36b7ab7637ceae74d50a30ef50c28`.
- Control matrix: `_ai_workbench/temp/auto_delegate_all_controls_audit_20260904.json`, SHA-256 `9836ddce72f7ef5d36e2982cdca9fee77b96de63e4df78bafecfa1418c2752be`.
- Local regression log: `_ai_workbench/logs/auto_delegate_clean_v4_tests_20260904_1627.log`, SHA-256 `56152d4f1f6954413de5201055f846ea0fcdfacf7023aa6d3d796fa51a36d087`.
- Backup production: `/linhhoasu/_ai_workbench/backups/auto_delegate_clean_v4_20260904_092414/`.
- Backup local: `_ai_workbench/backups/auto_delegate_clean_v4_local_pre_20260904_162600/`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| `Đồng thời/Hoặc` mất visual và semantic | `powerCheckBox` bị tái sử dụng cho auto-equip, còn `enoughPower` bị ép false | Trả control/flag lực chiến về chức năng gốc; auto-equip có control riêng | Không tái sử dụng control khi semantic cũ còn phụ thuộc downstream |
| Acc mới thiếu các control nâng cao | `stateB` ẩn group lực chiến và radio | Dùng `stateA` đầy đủ cho mọi account | Test UI theo createTime cũ/mới |
| Cờ lực chiến không giữ sau relog | Normalize cũ gán `enoughPower=false` | Khôi phục normalize boolean và giữ serialization riêng | Test write/read + relog cho từng flag độc lập |
| Full regression đầu tiên dừng ở test stateB cũ | Test cũ kỳ vọng auto-equip chỉ xuất hiện ở stateB | Cập nhật contract theo thiết kế sạch: auto-equip riêng ở mọi account | Contract phải theo behavior hiện hành, không khóa workaround cũ |
| Deploy lần đầu dừng ở audit staging | Audit ghép output thành `_ai_workbench/_ai_workbench/temp` | Tool dừng trước mutation; cho phép output path và tạo parent an toàn rồi deploy lại | Tool staging không suy workspace root cố định từ `__dirname` |

## 4. Kỹ năng / kinh nghiệm mới

- `both/or` không phải radio trang trí: nó là một phần truth-table của quality × power × attribute filters.
- Một feature mới không được chiếm control cũ nếu các predicate khác vẫn đọc flag cũ.
- Test sạch cần đủ bốn tầng: runtime control matrix, truth-table predicate, opaque setting persistence/relog và live gameplay E2E.
- Với production client-only, vẫn phải backup/hash/served asset/PM2/health/error scan; không restart không đồng nghĩa bỏ qua hậu kiểm.

## 5. Trạng thái hiện tại

- Production clean v4: PASS.
- Hash production/local:
  - Main: `8a6fa393c10be89adc23361a4526c1b73339991c67ef6ac8201a28f8d8be8f60`.
  - Index: `0f8664bedb3c4ff9af5a07abcd9b1d49d18e47f85a16eb3722601afc8dcd3015`.
  - GameEUI giữ nguyên: `0f47c283f404bb5ad9a8654d9087faeafff4564f865c3ff86eaf14f9630a9128`.
- Clean contract: 27/27 PASS; gồm giao diện mọi account, power/auto độc lập, truth-table và persistence độc lập.
- Toàn menu: 20/20 control PASS, không còn failure.
- Auto-equip FSM: 19/19 PASS; slot trống, retained upgrade, strongest-per-slot, reject fallback.
- UI lifecycle/account: 24/24 PASS; public `baseGroup`, không private attach.
- Server handler: 10/10 PASS.
- Live auto-equip sau deploy: 18/18 PASS; power `0→400→800`, equal-power/preset protected, cleanup `0`.
- Settings/relog: 6/6 PASS; key `2` giữ qua response, relog và Mongo, cleanup `0`.
- Quái 2×: 16/16 contract PASS; S1/S2 giữ `2.466` slot, `invalid=0`.
- Guide nhiệm vụ: 12/12 PASS; Tĩnh lặng: 7/7 PASS; core gameplay nạp đủ 714 bảng.
- PM2/PID/restart counter trước/sau không đổi; sáu process liên quan online.
- S1/S2 `/ready=200`, bot `580/580`; recent server error scan rỗng.
- Chưa click E2E trực quan bằng tài khoản người dùng sau khi họ tải marker v4; runtime/menu/live server/persistence đã được kiểm tra độc lập.

## 6. Bước tiếp theo

1. `Ctrl+F5` hoặc đóng hoàn toàn tab game rồi mở lại để nhận marker `20260904_auto_delegate_clean_v4`.
2. Trong `Điều kiện cơ bản`:
   - `Dừng khi lực chiến cao hơn` là điều kiện giữ/dừng gốc.
   - Chọn `Đồng thời` hoặc `Hoặc` khi đã bật điều kiện lực chiến.
3. Trong `Điều kiện thêm`, tick `Tự mặc đồ mạnh hơn` nếu muốn tự động thay đồ.
4. Bấm `Bắt đầu` để lưu và chạy Ủy thác.
