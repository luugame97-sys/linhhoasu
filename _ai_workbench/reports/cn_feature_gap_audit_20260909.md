# Đối chiếu tính năng build Trung và build hiện hành — 09/09/2026

## Phạm vi và bằng chứng

Đây là audit tĩnh, read-only; không nhập config CN vào production, không sửa DB và không restart dịch vụ.

- Build Trung: `_ai_workbench/temp/fashion_cn_recovery_20260909/raw/js/main.min_dc9b2913.js`.
- Build hiện hành: `linhhoasu/lhs/js/main.min_a6195824.js`.
- Server đối chiếu: `linhhoasu/lhs/newServer/src`.
- Config fashion đã đối chiếu riêng: `config-review.json` và `system-audit.json`. Snapshot raw ban đầu có 727 bảng CN so với 714 bảng local; snapshot fashion merge dùng 747 bảng CN. Hai số này thuộc hai phạm vi/snapshot khác nhau, không cộng gộp.

## Kết quả chính

| Nhóm | Tình trạng hiện hành | Bằng chứng / kết luận |
|---|---|---|
| Thời trang CN | **Đã đưa vào candidate/live theo rollout trước** | 6 bộ mới 28310, 28370, 28380, 28410, 29280, 29820; report fashion rollout và manifest content-release đã ghi DEPLOYED. Đây là content đã tích hợp, không phải module gameplay CN mới. |
| BidKing cũ | **Đã có một phần** | Server đăng ký 7300–7307, 7350–7353, 7454 và 7475 trong `src/handlers/index.js`; `handlers/bid-king.js` dùng các bảng `BidKing*`. |
| BidKingStream | **Thiếu hoàn toàn ở client/server hiện hành** | CN bundle có 312 reference; local bundle 0; CN config có các bảng Architecture/Base/Character/Clue/Effect/Item/Maps/Open/Treasure. Đây là biến thể mới, không thể dùng handler BidKing cũ để kết luận tương thích. |
| CatchGoose | **Thiếu hoàn toàn** | CN bundle 216 reference và RPC nhìn thấy ở 8522/8543; local bundle 0; server không có module/handler. |
| Puppet | **Thiếu hoàn toàn** | CN bundle 261 reference; local bundle 0; server không có module/handler. |
| RedEnvelope | **Thiếu hoàn toàn** | CN bundle 73 reference, có tag 1850/1851; local bundle 0; server không có module/handler. |
| OldTrekPuzzle | **Thiếu sub-feature** | CN bundle 20 reference; local không có tên module này. Server có OldTrek cũ nhưng chưa chứng minh có Puzzle contract. |
| BloodlineDevour | **Thiếu sub-feature** | CN bundle 29 reference; local không có tên module này. Server có `handlers/bloodline.js` cho hệ Bloodline hiện tại, không phải bằng chứng hỗ trợ Devour. |
| ArtifactForgeUp2 | **Thiếu** | CN bundle 18 reference; local bundle 0; server không có module tương ứng. |
| EverydayDesktop / EverydaySide | **Thiếu** | CN bundle lần lượt 10/10 reference; local bundle 0; server không có module tương ứng. |
| FreePass / Refining | **Có nền cũ, chưa parity** | CN bundle có lần lượt 28/136 reference; local có 5/71. Cần so contract và bảng config trước khi gọi là cùng phiên bản. |

## Config CN mới nhưng chưa thành tính năng

Raw config CN có các nhóm mới sau (ngoài fashion):

- `Activity64Config`, `Activity64TypeConfig`: activity 64; mẫu ID 64001/64051, chu kỳ 14 ngày và reward gắn `rechargeId=10302`.
- `BidKingStream*`: khoảng 3 Architecture, 30 Base, 9 Character, 70 Clue, 172 Effect, 63 Item, 11 Maps, 2 Open và 581 Treasure record.
- `RedEnvelopeBaseConfig`, `RedEnvelopeConfig`: mẫu daily count 3; type 1001 count 10 và reward có weight.

Các record này chỉ chứng minh dữ liệu tồn tại trong build Trung. Muốn chạy phải có client view/state, RPC/tag mapping, server-authoritative validation, persistence/reward ledger, language/assets và native/E2E QA. Không được nhập riêng config để mở menu hoặc cấp thưởng.

## Phân loại việc cần làm nếu muốn port

1. **Ưu tiên contract:** giải mã request/response, tag, ACK/replay/error và điều kiện mở từ CN client; lập fixture exact.
2. **Server:** tạo handler riêng cho từng module, kiểm ownership/cost/weight/time ở server, persistence và idempotency; không nối nhầm vào BidKing cũ.
3. **Client/assets:** port bundle hoặc viết native-equivalent có đủ view, state, icon/atlas/Spine, language và resource manifest.
4. **QA:** local fixture → Linux staging → native client login/list/server/WebSocket → create/load/relog/restart; kiểm reward ledger và rollback marker. Chỉ sau các gate này mới xem xét rollout.

## Giới hạn audit

Chưa có contract/server source chính thức của CN cho các module nêu trên; chưa chạy được gameplay CN live để xác nhận toàn bộ flow. Vì vậy kết luận “thiếu” nghĩa là không thấy implementation tương ứng trong bundle/server hiện hành, không phải khẳng định CN module không có thêm dependency ẩn.

## Quyết định phạm vi hiện tại

Theo yêu cầu hiện tại, toàn bộ module CN thiếu được **lưu làm backlog, chưa triển khai và chưa mở trong game**. Ưu tiên trước mắt là sửa và nghiệm thu các lỗi gameplay đang tồn tại.

Backlog giữ nguyên các nhóm:

1. BidKingStream.
2. CatchGoose.
3. Puppet.
4. RedEnvelope.
5. OldTrekPuzzle.
6. BloodlineDevour.
7. ArtifactForgeUp2.
8. EverydayDesktop.
9. EverydaySide.
10. So sánh parity FreePass/Refining sau khi lỗi hiện tại ổn định.

Điều kiện mở lại backlog: có yêu cầu riêng, contract CN đủ để đối chiếu, fixture server-authoritative, test native/E2E và kế hoạch rollback. Không tự nhập config, không tự bật menu và không tự cấp reward trong thời gian chờ.
