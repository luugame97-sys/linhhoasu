# Session Report — Tự động mặc trang bị mạnh hơn

## 1. Tóm tắt công việc

- Đã triển khai tùy chọn opt-in `Tự động mặc trang bị mạnh hơn` trong màn `Ủy thác tự động`.
- Tái sử dụng đúng checkbox native trước đây là `Dừng khi lực chiến cao hơn`, nhưng dùng cờ mới `autoEquipUpgrade`, mặc định tắt; không kế thừa lựa chọn cũ.
- Khi bật: client lọc điều kiện giữ, chọn món tăng lực mạnh nhất cho từng slot, gọi `2200` tuần tự; sau ACK thành công mới cập nhật model và đưa đồ cũ/yếu vào sale `2201`.
- Server tự tính lại power bằng `AttrConfig.power`, chỉ cho auto-equip khi `afterPower > beforePower`; auto-sale chỉ bán món yếu hơn đồ đang mặc và bảo vệ tất cả preset.
- Nếu RPC từ chối, món bằng/không tăng lực, món được giữ bởi phẩm chất/thuộc tính hoặc UID đang ở preset khác: ủy thác dừng và mở xử lý thủ công.

## 2. File/thư mục đã thay đổi

- Production `/linhhoasu/lhs/newServer/src/services/EquipService.js`: power calculator, strict auto-upgrade, protected auto-sale.
- Production `/linhhoasu/lhs/newServer/src/handlers/item.js`: truyền/đáp cờ `autoDelegate`, power trước/sau và `ignoredUids` cho 2200/2201.
- Production `/linhhoasu/webgame/game/js/main.min_a6195824.js`: FSM auto-equip + sale/fallback và flag opt-in mới.
- Production `/linhhoasu/webgame/game/index.html`: cache marker `20260904_auto_equip_upgrade2`.
- Candidate: `_ai_workbench/temp/auto_equip_candidate_20260904/`, `_ai_workbench/temp/auto_equip_optin_v2/`.
- Tools/contracts: `_ai_workbench/tools/patch_auto_equip_upgrade_client.py`, `patch_auto_equip_optin_v2.py`, `test_auto_delegate_contract.js`, `test_auto_equip_handlers.js`, `test_auto_equip_upgrade_client.js`, `test_auto_equip_optin_v2.js`, `qa_auto_equip_live.js`, `deploy_auto_equip_upgrade_20260904.py`, `deploy_auto_equip_optin_v2.py`.
- Evidence: `_ai_workbench/temp/auto_equip_upgrade_deploy_20260904_051709.json`, `_ai_workbench/temp/auto_equip_optin_v2_deploy_20260904_052636.json`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Stage `.js.auto-equip-*` không được Node 20 syntax-check | Đuôi cuối không phải `.js` | Stage dạng `name.auto-equip-*.js` | Giữ extension thật ở cuối filename |
| Live QA login timeout lần 1 | Fixture tạo `userId` không theo suffix `_s1001` | Dùng `platformuid` ở client và Player `platformuid_s1001`; cleanup prefix | E2E phải mô phỏng đúng identity contract |
| Sót một Player QA suffix sau lần đầu | Cleanup chỉ nhắm UID đầu vào | Cleanup theo prefix `^qa_auto_equip_` ở cả DB; readback 0 | Fixture cleanup phải phủ ID được server chuẩn hóa |
| Live QA timeout lần 2/3 | Harness cắt ArrayBuffer bằng offset của buffer cũ; lần sau chạy khi bot login burst | Sửa decode dùng đúng buffer/offset và chờ 580/580 bot trước QA | Test harness phải được kiểm chứng login-only trên baseline |
| Cờ checkbox cũ có thể auto-bật ngoài ý muốn | Tái sử dụng `enoughPower` đã có dữ liệu người chơi | Thêm `autoEquipUpgrade` ở cuối setting blob, default false; ép `enoughPower=false` | Tính năng đổi ý nghĩa phải có flag mới và migration fail-closed |
| Đồ giữ bởi phẩm chất có thể bị auto-mặc | Bản candidate đầu lấy tất cả món mạnh trước policy filter | Chạy `CheckAutoStop` với enoughPower tạm tắt; chỉ auto-mặc nhóm vốn là sale candidate | Policy giữ phải có ưu tiên trước power automation |

## 4. Kỹ năng / kinh nghiệm mới

- Power server parity với client cơ bản: tổng `attrValue * AttrConfig.power`, bỏ weight `-1`, làm tròn lên.
- Auto replace phải validate trước khi remove khỏi open list; rejection không mutation.
- Fallback RPC phải đưa cả món chưa xử lý, món sale candidate và đồ cũ đã thay vào popup, rồi tắt ủy thác.
- Setting mới append cuối ByteArray và đọc có guard `position < length`, giữ tương thích blob cũ.

## 5. Trạng thái hiện tại

- Service contract PASS: mạnh được mặc; bằng/yếu bị từ chối không mutation; slot trống nhận món power dương; manual replace tương thích; đồ cũ/yếu bán; món mạnh và UID preset khác được bảo vệ.
- Handler contract PASS 10 checks: auto/manual flags, before/after power và ignoredUids đúng.
- Client v1 contract PASS 17 checks; opt-in v2 PASS 10 checks; core gameplay PASS 714 bảng.
- Live WebSocket E2E PASS 12 checks: power `200 → 400`, mặc món mạnh, bán đồ cũ và món bằng/nhỏ hơn, giữ nguyên UID preset khác, Mongo readback đúng.
- Player QA cleanup PASS; hậu kiểm hai DB không còn `qa_auto_equip_*`.
- S1/S2 bot đều `580/580`, virtual 580, invalid 0; worker bot không restart.
- `/ready` cả hai node PASS; error audit không có lỗi mới liên quan auto-equip.
- Hash production: EquipService `6da1b8c26a616c3e933a72b6b80d36ee732dfafbd49a12af9be6be6acc818539`; item.js `9965c53ad2e797348a9e8bd733db56f8c5ed085070c9cb18dcdf19386dcf7473`; main JS v2 `4eebd64544284a207bd8614fca576bbc689b90f53e06dcbc42d8f2a13e0479bd`; index v2 `24ad042e4a26fd57706d1f78e823f2fe62a761b2f4e08a02bf48f4b9aa8f8bf9`.
- Backup server/v1: `/linhhoasu/_ai_workbench/backups/auto_equip_upgrade_20260904_051709/`; backup client trước v2: `/linhhoasu/_ai_workbench/backups/auto_equip_optin_v2_20260904_052636/`.
- Chưa QA click/quan sát popup trực quan bằng session người chơi thật; server E2E và client native static/served contract đã PASS.

## 6. Bước tiếp theo

1. Ctrl+F5/xóa cache game một lần.
2. Mở `Ủy thác tự động`, tick `Tự động mặc trang bị mạnh hơn`, rồi bấm `Bắt đầu`.
3. Quan sát một lần: đồ mạnh tự mặc, đồ cũ/yếu tự bán, ủy thác tiếp tục; đồ thỏa điều kiện giữ vẫn mở popup.
4. Nếu muốn trở về hành vi cũ, bỏ tick; vì mặc định tắt nên người chơi khác không bị thay đổi hành vi.
