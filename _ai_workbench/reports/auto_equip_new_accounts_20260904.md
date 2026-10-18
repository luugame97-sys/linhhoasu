# Tự động mặc đồ mạnh hơn cho tài khoản mới — 04/09/2026

> Cập nhật cuối: UI stateA/stateB vẫn giữ nguyên, nhưng logic auto-equip đã được thay bằng FSM v3 để xử lý slot trống và đồ mạnh thuộc diện giữ. Xem `_ai_workbench/reports/auto_equip_fsm_v3_20260904.md`.

## 1. Tóm tắt công việc

- Ảnh người dùng cho thấy tài khoản mới mở được `Ủy thác tự động` nhưng không có tùy chọn `Tự động mặc trang bị mạnh hơn`.
- Nguyên nhân: `AutoOpenBoxPanel` chọn `stateA/stateB` theo thời điểm tạo nhân vật so với `AppInfo.params.powerOpen`. `stateB` ẩn `_Group3`, là nhóm chứa checkbox `powerCheckBox` đã được tái sử dụng cho auto-equip.
- Vì vậy logic auto-equip và server guard vẫn tồn tại nhưng tài khoản ở `stateB` không có control để bật.
- Đã bổ sung một checkbox EUI native runtime dùng `CheckBox1Skin` cho riêng `stateB`, đặt ở phần trống bên phải hàng `Tăng tốc chiến đấu`.
- `stateA` tiếp tục dùng checkbox gốc; cả hai state cùng đọc/ghi `autoEquipUpgrade`.
- Cờ vẫn mặc định `false`; không tự bật cho tài khoản mới hoặc tài khoản cũ.
- Bản v1 runtime từng gắn control vào `this._Group16` và làm panel phát sinh `Cannot read properties of undefined (reading 'addChild')`. Sau ảnh E2E của người dùng, bản này đã được rollback ngay.
- Bản v2 đang chạy gắn control qua `baseGroup`, là skin part công khai; phép gắn có null-guard nên không thể làm hỏng `childrenCreated` nếu part chưa sẵn.

### Khi nào tính năng hoạt động?

1. Tính năng xuất hiện ngay khi nhân vật đã mở được menu `Ủy thác tự động`; không có thêm điều kiện level/VIP riêng ngoài điều kiện mở menu này.
2. Người chơi phải tick `Tự mặc đồ mạnh hơn` rồi bấm `Bắt đầu`.
3. Khi Ủy thác nhận trang bị, client chọn món mạnh nhất theo từng slot sau policy giữ đồ.
4. Server chỉ cho mặc nếu món mới tăng lực chiến nghiêm ngặt, UID hợp lệ và không vi phạm preset đang được bảo vệ.
5. Nếu không tick, hành vi cũ được giữ: game dừng/mở so sánh khi gặp đồ cần xử lý.

## 2. File/thư mục đã thay đổi

### Source chính

- `linhhoasu/webgame/game/js/main.min_a6195824.js`: tạo checkbox native cho `stateB`, đồng bộ cùng flag `autoEquipUpgrade` và đặt layout ở cột phải hàng đầu của điều kiện thêm.
- `linhhoasu/webgame/game/index.html`: cache marker `20260904_auto_equip_new_accounts1`.
- `linhhoasu/webgame/game/update/resource/assets/cfg/gameEui_18e11b8e.bin`: production không thay đổi; source local được đồng bộ về đúng hash production để tránh control cũ bị tạo trùng trong lần build sau.

### Tool, test và evidence

- `_ai_workbench/tools/audit_auto_equip_new_account_ui.js`.
- `_ai_workbench/tools/patch_auto_equip_new_accounts_20260904.py`.
- `_ai_workbench/tools/test_auto_equip_new_accounts_20260904.js`.
- `_ai_workbench/tools/snapshot_auto_equip_new_accounts_prod_20260904.py`.
- `_ai_workbench/tools/deploy_auto_equip_new_accounts_20260904.py`.
- `_ai_workbench/tools/audit_auto_equip_new_accounts_postdeploy_20260904.py`.
- Bản v1 đã rollback: `_ai_workbench/temp/auto_equip_new_accounts_deploy_20260904_063245.json`.
- Rollback evidence: `_ai_workbench/temp/auto_equip_new_accounts_rollback_20260904_071612.json`, SHA-256 `64f9308f91cdc13c7b70a3b28fb16d8abe52f59ff67a9999d3ec44892634864d`.
- Deploy v2 evidence: `_ai_workbench/temp/auto_equip_new_accounts_deploy_20260904_071807.json`, SHA-256 `e4fe9cb5478fa5d070628fb7e927a5f28f82691fb33d3ab5ce8e33946de95614`.
- Hậu kiểm v2: `_ai_workbench/temp/auto_equip_new_accounts_postdeploy_20260904.json`, SHA-256 `d09214b9a85bb44abeef329e185a5a0e5dac529c5e863390e9375ad724249e57`.
- Test log v2: `_ai_workbench/logs/auto_equip_new_accounts_v2_tests_20260904_1420.log`, SHA-256 `9b54c934a17c233df3a1036ec3c07c4406d05292a821aef8c84a26895fc417b4`.
- Backup production v2: `/linhhoasu/_ai_workbench/backups/auto_equip_new_accounts_20260904_071807/`.
- Bản broken được bảo toàn tại `/linhhoasu/_ai_workbench/backups/auto_equip_new_accounts_broken_20260904_071612/` để điều tra, không còn được serve.
- Backup local broken: `_ai_workbench/backups/auto_equip_new_accounts_broken_local_20260904_141900/`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Tài khoản mới không thấy checkbox | `stateB` của skin ẩn `_Group3/powerCheckBox` | Tạo checkbox native riêng cho `stateB`, dùng chung `autoEquipUpgrade` | Test đủ mọi state theo dữ liệu tài khoản mới/cũ |
| Deploy đầu dừng ở `EUI_DRIFT` | `gameEui` local từng được patch thử nhưng production vẫn là bản gốc | Fail trước mutation, snapshot production và giải mã lại skin thật | Mọi binary asset phải đối chiếu hash remote trước khi dùng candidate local |
| Encoder `gameEui` chạy treo bất thường | `BinJsonUtil.json2bin()` đóng gói toàn bộ skin quá chậm, đúng lỗi từng gặp trước đây | Dừng tiến trình trước upload; tạo control bằng EUI runtime trong bundle | Không triển khai binary nếu encoder chưa hoàn tất và chưa có round-trip verification |
| Test remote không tìm thấy `BinJsonUtil` | Harness suy app root từ thư mục staging | Truyền rõ `/linhhoasu/lhs/newServer` vào test | Test staging không được suy runtime root từ `__dirname` |
| Test opt-in cũ FAIL sau khi tách handler | Contract khóa exact tên handler cũ | Cập nhật test kiểm tra handler dùng chung mới và tăng số check | Contract nên kiểm tra semantic và cả adapter tương thích |
| Bản v1 làm hỏng toàn bộ panel Ủy thác | `_Group16` tồn tại trong JSON skin nhưng không nằm trong `$sP`, nên `this._Group16` là `undefined` ở `childrenCreated` | Rollback ngay về bản ổn định; v2 dùng `this.baseGroup && this.baseGroup.addChild(...)` | Chỉ truy cập skin part có trong `$sP`; contract phải kiểm tra cả vòng đời/null-guard, không chỉ marker |

## 4. Kỹ năng / kinh nghiệm mới

- `currentState` có thể thay đổi cả visibility/layout dù code `updateViewUI()` vẫn chạy và đổi nhãn bình thường.
- Khi asset skin production khác source local, cách an toàn là dựng control bằng component EUI native (`U.Group`, `U.CheckBox`, `U.Label`) và kiểm tra served bundle; không dùng HTML/DOM overlay.
- Tài khoản mới/cũ phải có fixture cho từng UI state, không thể chỉ kiểm tra marker có trong bundle.
- Server vẫn là nguồn quyết định cuối cùng cho mặc/bán; control UI chỉ bật opt-in.

## 5. Trạng thái hiện tại

- Production deploy và hậu kiểm độc lập đều PASS.
- Served contract v2: runtime group, checkbox, `CheckBox1Skin`, nhãn, stateB visibility, flag selection, handler, default-off và auto-equip flow đều xuất hiện đúng một lần.
- Public attach qua `baseGroup` xuất hiện đúng một lần; private attach qua `_Group16` bằng `0`.
- Hash production/local:
  - Main v2: `f5490e4a2339eb9f13adfee20d7f82f79fc5099ca8de3826445e9432a72abd6d`.
  - Index: `aba269b7ad48114f7b1454457080b01e3a0862374256dcb8bc23bc476c57c25e`.
  - GameEUI giữ nguyên: `0f47c283f404bb5ad9a8654d9087faeafff4564f865c3ff86eaf14f9630a9128`.
- PM2 PID/restart counter trước/sau không đổi; không restart dịch vụ.
- `/ready` S1/S2 đều `200`; mỗi server `580/580` bot, `2.466` slot quái, multiplier `2`, `invalid=0`.
- 120 dòng error log gần nhất không có uncaught/unhandled, syntax/type/reference error hoặc invalid target.
- Regression PASS: new-account UI 24 check; auto-equip client 11; server handler 10; double-monster 16; task guide 12; idle guide; map combat; core gameplay 714 bảng.
- Ảnh E2E của người dùng đã bắt đúng lỗi v1. Chưa có ảnh E2E mới sau deploy v2; cần tải lại bundle trước khi thử.

## 6. Bước tiếp theo

1. Tài khoản mới cần `Ctrl+F5` hoặc đóng/mở lại game để nhận marker mới.
2. Mở `Ủy thác tự động`; checkbox `Tự mặc đồ mạnh hơn` sẽ nằm bên phải hàng `Tăng tốc chiến đấu`.
3. Tick checkbox rồi bấm `Bắt đầu`.
4. Nếu ảnh sau Ctrl+F5 vẫn chưa có checkbox, gửi ảnh mới kèm tên server; cần kiểm tra cache/CDN của đúng entrypoint đang dùng.
