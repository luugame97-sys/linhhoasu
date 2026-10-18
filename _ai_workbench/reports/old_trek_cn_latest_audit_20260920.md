# Đối chiếu client Trung mới nhất cho Hoang Cổ Mê Hàng — 20/09/2026

## Nguồn và hash

Đã đọc lại upstream tại `https://lhsi.guangzhougy.com/agent/70000001/index.html` lúc 20/09/2026, không dùng snapshot cũ làm kết luận cuối.

Ba artifact chính đều trả HTTP 200 và `Last-Modified: Fri, 11 Sep 2026 09:36:33 GMT`; đây là build public mới nhất quan sát được tại thời điểm audit, không phải suy đoán từ tên file.

| Artifact | Bản Trung hiện tại | Snapshot 09/09 | Bản local hiện hành |
|---|---|---|---|
| Entrypoint | `index.html` 8.899 bytes | `index.html` 8.865 bytes | — |
| Main JS | `main.min_35ffbb96.js`, SHA-256 `ecd39b1c20affc07445230cd0aa24b6258cea533933f48c6c2c55f0c4bd43731` | `main.min_dc9b2913.js`, SHA-256 `96cbbf44f53ae7a293f31d54c2780066ea9b47baf18d891f7939248c289043d3` | `main.min_drop100.js`, SHA-256 `88641780cc23147ee1404e316b0763b0534f90bf677f8713cd2fd8b8083f18a3` |
| Config | `config_5b59af5a.bin`, SHA-256 `1e9d5534a5f956e170adf1fe0cf91c44d9bb285a28a17c8ca2eada8d75bd8c8d` | `config_2f004ade.bin`, SHA-256 `40c6e371fbe90f423e29f91e519459632789f038326ab8fa8550114494b9c276` | `config_fashion_20260909.bin`, SHA-256 `b5216c257c2a0743b6acdfe8bb43f4b989d000beeaa46c8ffe0b3d4ec789671e` |
| Lang config | `config_lang_e9d48337.bin`, SHA-256 `126761a9c4599afeb8fa86a77d75d7fd60d667125dc1ea13ab71b03e7135f51b` | `config_lang_68850e48.bin` | local build riêng |
| Main resource | `default.res_main_9e3a9ddf.bin`, SHA-256 `fe1bb176643bce6011166171f3748914e521804f16db42cac47132bfd2b4b489` | `default.res_main_13ccf8e.bin` | local resource khác |

## Kết luận chính

### 1. Core OldTrek protocol vẫn dùng cùng nhóm tag

Client Trung mới nhất và client local đều gọi cùng các tag OldTrek chính: `7001–7012`, `7020–7054`, `7059`, `7060–7065`. Không thấy một bộ RPC mới thay thế core flow.

Điều này xác nhận các lỗi server đã audit trước đó vẫn có giá trị: cần sửa server-authoritative handler/state machine, không thể giải quyết chỉ bằng thay bundle client.

### 2. Client Trung mới nhất có nhiều mini-game OldTrek mà local thiếu

Client Trung hiện tại có các class/UI sau, local không có:

- `OldTrekMusicMaster*` — mini-game nhịp/âm nhạc.
- `OldTrekPinball*` — pinball.
- `OldTrekPuzzle*` — puzzle/mosaic.
- `OldTrekSpotDiff*` — tìm điểm khác.

Các mini-game này được mở từ `OldTrekCommonEventConfig` và khi kết thúc gửi lại `7002` với `eventUid`, `operate`, `param/score`. Vì vậy server hiện tại phải xử lý đúng event config, điểm, reward và event ledger; chỉ port UI mà giữ `7002` hiện tại sẽ không đủ an toàn.

Client mới có các dấu hiệu định lượng:

- `OldTrekPuzzle`: 21 reference.
- `OldTrekMiniGame`: 25 reference.
- `OldTrekCommonEventConfig`: 19 reference.
- Core tag count vẫn giống local, nên mini-game chủ yếu mở rộng payload/event semantics trên `7002`, không phải RPC riêng.

### 3. Config Trung mới có thay đổi gameplay OldTrek thật

So với snapshot Trung 09/09:

- `OldTrekBaseConfig` thêm:
  - `materialTransferQuality: [7]`
  - `materialTransferCost: { id: 1, count: 50 }`
- `OldTrekSkillEffectConfig` thay đổi 10 row, gồm:
  - `1200`, `1216`, `1227`, `1237`, `1240`, `3023`, `6008`: chuyển sang `lastBottomEff`, `effPos=5`.
  - `1223`: đổi type/args sang hiệu ứng mới `1437`.
  - `1238`, `1241`: thay đổi hiệu ứng hình ảnh/bottom effect.
  - thêm row `1437`.

Local config có đủ 62 bảng `OldTrek`, nhưng các thay đổi trên chưa có. Không được nhập riêng hai field hoặc vài skill effect mà chưa port semantics server/client.

### 4. Config mới có 34 bảng ngoài phạm vi OldTrek

CN hiện tại có 747 bảng, local có 714. 34 bảng chỉ có ở CN gồm `BidKingStream*`, `CatchGoose*`, `Puppet*`, `RedEnvelope*`, `Activity64*`, `BloodlineDevour`, `Refining*` và `PrivilegeParamConfig`. Đây là feature gap khác, không phải bằng chứng core OldTrek đã đổi RPC.

## Ý nghĩa đối với audit lỗi hiện tại

| Vấn đề | Client Trung mới nhất giúp xác nhận gì |
|---|---|
| Event không chạy | Có event view và mini-game đầy đủ; server phải sinh `currentEvent` và xử lý `7002`, không được để `currentEvent=null` mãi |
| Accelerate | Client vẫn nội suy `getCurDistance()` từ `lastUpdateTime`; server phải cộng elapsed distance trước khi ghi checkpoint |
| `7005` | Client chỉ nên gọi khi `getCurDistance() >= destination.distance`; server vẫn phải tự kiểm tra lại |
| Arena/rank | Client Trung dùng cùng nhóm `7050/7051/7052/7059`; stub thắng cố định hiện tại là lỗi backend, không phải khác protocol |
| Mini-game | Local thiếu UI/logic; đây là hạng mục port riêng sau khi core event engine ổn định |
| Material transfer/effect | Có chênh config upstream mới; cần fixture native trước khi đồng bộ |

## Cách dùng bản Trung tiếp theo

1. Giữ nguyên bộ artifact mới tải trong `_ai_workbench/temp/oldtrek_cn_latest_20260920/` làm baseline có hash.
2. Không thay client production bằng bundle Trung; build Trung có 34 bảng/module ngoài phạm vi và khác resource/lang/SDK.
3. Dùng client Trung để trích contract/payload/event semantics từng mini-game.
4. Sửa core server trước: elapsed checkpoint, event engine, destination/stage/cost gate, `7005` arrival validation, arena/rank/ledger.
5. Sau đó mới port bốn mini-game, kèm config/resource/language và native E2E.

## Bằng chứng

- Raw artifact mới: `_ai_workbench/temp/oldtrek_cn_latest_20260920/raw/`
- So sánh config/client: `_ai_workbench/temp/oldtrek_cn_latest_20260920/oldtrek_compare.json`
- Audit core server: `_ai_workbench/reports/old_trek_full_audit_20260920.md`
- Harness server contract: `_ai_workbench/tools/audit_oldtrek_contract_20260920.js`

Lượt này chỉ tải/đọc/so sánh; không sửa client, config, DB hoặc production.
