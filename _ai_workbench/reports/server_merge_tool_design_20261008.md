# Tool gộp nhiều server an toàn — bản dormant

Ngày: 2026-10-08 (ICT)  
Trạng thái: **đã tạo tool local, chưa chạy inventory live, chưa backup live, chưa restart, chưa ghi Mongo/Redis/WebGM và chưa gộp server**.

## Kết quả

Tool chính: `_ai_workbench/tools/server_merge_tool.py`  
Test RAM/staging: `_ai_workbench/tools/test_server_merge_tool.py`

Tool nhận `root-server` và `source-servers`, tự sinh manifest versioned với database mapping, identity DB, policy xung đột, precondition hash/count, power invariant và receipt/checkpoint. Snapshot input dùng JSONL/JSON:

```text
<snapshot>/<database>/<collection>.jsonl
```

Các collection đã có quy tắc riêng cho Player, Guild, Mail, Transaction, DistCallbackTask, RedemptionCode, RechargeProductConfig, GlobalConfig, ItemDictionary, AdminAgent/ActionLog, Account, GameServer, Arena/Cross/Event/Battle settlement-log. Collection lạ không bị bỏ qua: mặc định chuyển thành conflict và chặn apply.

## Safety gates

- `inventory` và `dry-run` là read-only, báo `productionWrites=0`, `networkAttempts=0`.
- Dedupe chỉ khi payload giống hệt; unique key khác payload chuyển quarantine. Không drop unique index, không restore toàn bộ identity DB dùng chung.
- `serverId` residue/mismatch, trùng `userId`/`playerId`, mail eventKey, orderId, settlement/event receipt hoặc unknown collection đều chặn mặc định.
- Tên người chơi trùng mặc định quarantine. Nếu được duyệt, `--rename-suffix '·S{serverId}'` tạo mapping deterministic và cập nhật tên trong Player/Guild; tên cùng một source vẫn chặn.
- Player giữ nguyên Mixed fields; chỉ remap trường server rõ nghĩa. Settlement/event/battle history immutable không bị đổi lịch sử.
- Apply chỉ materialise **staging snapshot mới**; không có live Mongo adapter, không tự gọi PM2/nginx/Redis/WebGM. Cần đủ `dry-run` không conflict, backup + restore rehearsal, native power read-back PASS, maintenance token và xác nhận `APPLY:<mergeId>`.
- Target lỗi không bị xoá khi rollback; `rollback` chỉ copy preserve để điều tra. Không có lệnh destructive restore.

## Luồng vận hành sáng mai

1. Tạo manifest/inventory (chưa có snapshot thì chỉ tạo kế hoạch):

   ```text
   python _ai_workbench/tools/server_merge_tool.py inventory \
     --root-server 1001 --source-servers 1001,1002,1003,1004 \
     --out _ai_workbench/temp/server_merge_manifest.json
   ```

2. Sau khi có export read-only đã freeze, thêm `--snapshot-dir <dir>` khi inventory hoặc chạy:

   ```text
   python _ai_workbench/tools/server_merge_tool.py dry-run \
     --manifest _ai_workbench/temp/server_merge_manifest.json \
     --snapshot-dir <snapshot> --out _ai_workbench/temp/server_merge_dry_run.json \
     --update-manifest
   ```

   `--update-manifest` là cờ ghi rõ ràng; nếu bỏ, tool vẫn phân tích nhưng apply sẽ từ chối vì manifest chưa nhận precondition mới.

3. Backup không ghi đè và bắt buộc thử restore trước apply:

   ```text
   python _ai_workbench/tools/server_merge_tool.py backup \
     --manifest _ai_workbench/temp/server_merge_manifest.json \
     --snapshot-dir <snapshot> \
     --destination _ai_workbench/backups/server_merge_<mergeId> \
     --restore-test _ai_workbench/temp/server_merge_restore_test
   ```

4. Native power report phải được tính bằng `BattleService.calcPlayerPower` + `ArenaReadModelService.displayPower` trên full player trước/sau, không dùng field power từ client. Mọi delta âm hoặc thay đổi `attrsHash` chặn apply; mặc định cần strict read-back.

   Có worker offline đã kèm sẵn. Sau khi materialise staging, chạy `native-power` với config `.bin` được chọn rõ ràng; worker chặn Mongo/Redis/network/dotenv, deep-freeze input và chỉ trả JSON:

   ```text
   python _ai_workbench/tools/server_merge_tool.py native-power \
     --manifest <manifest> --report <dry-run-report> \
     --source-snapshot-dir <snapshot> --target-snapshot-dir <staging> \
     --config-path linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin \
     --runtime-root linhhoasu/lhs/newServer --out <native-power.json>
   ```

   Worker nền: `_ai_workbench/tools/server_merge_native_power.js`; test độc lập dùng config thật và kết quả `productionWrites=0`, `networkAttempts=0`, `databaseAttempts=0`.

5. Apply staging chỉ khi người vận hành đã mở maintenance gate và tạo file token có đúng nội dung `MERGE-READY:<mergeId>`:

   ```text
   python _ai_workbench/tools/server_merge_tool.py apply \
     --manifest <manifest> --report <dry-run-report> --snapshot-dir <snapshot> \
     --target-snapshot-dir <new-empty-staging-dir> --journal <journal.json> \
     --backup-manifest <backup>/backup_manifest.json \
     --native-power-report <native-power.json> \
     --maintenance-token-file <maintenance.token> \
     --confirm APPLY:<mergeId> --i-understand-staging-writes
   ```

   Đây vẫn là staging materialisation; chưa phải production cut-over. `resume` dùng lại journal, receipt và planHash; `verify --report <dry-run-report>` đọc lại expected counts/economy/reference/hash/power; `rollback --target-snapshot-dir <staging>` giữ nguyên target lỗi để điều tra.

## Phần chưa được coi là hoàn tất

Tool hiện chưa nối live Mongo/MySQL/Redis, WebGM/nginx, freeze session, scheduler/outbox, native runtime cut-over hoặc route alias. Các phần đó chỉ được thêm sau khi inventory live xác nhận schema/index/validator/TTL, policy target/name/guild/reward được duyệt và có restore rehearsal thật. Báo cáo kế hoạch nền trước đó: `_ai_workbench/reports/s1_s4_merge_plan_20260928.md`.

Đặc biệt, Account/roles dùng identity DB chung `lhs_s1001`; CrossArena/CrossEvent/settlement có receipt immutable theo cycle; WebGM `config.php` và MySQL server-scoped tables không có đủ trong checkout. Vì vậy tool chưa tự đổi `GameServer`, session/token, WS alias, Redis rank, scheduler hay gift/reward routing. Đây là stop gate bắt buộc, không phải phần có thể “đoán” từ tên server.
