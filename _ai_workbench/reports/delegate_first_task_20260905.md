# Mở Ủy thác tự động sau nhiệm vụ đầu tiên

## 1. Tóm tắt công việc

Đã triển khai S1/S2: **nhận thưởng nhiệm vụ chính tuyến đầu tiên (`10001`) là có thể mở Ủy thác tự động**. Không cần chờ tới nhiệm vụ10028 như trước. Khi nhận thưởng10001, nhiệm vụ hiện tại chuyển10002, thỏa điều kiện mới.

Chỉ mở quyền sử dụng; không tự bật chế độ ủy thác, tự mặc/bán đồ hoặc thay cấu hình mà người chơi đã chọn.

## 2. File/thư mục đã thay đổi

- Source local/production: `linhhoasu/lhs/newServer/src/handlers/task.js`: nhiệm vụ10001 phải ở trạng thái hoàn thành trước khi claim; chờ lưu reward/task/unlock trước trả thành công.
- Config production server: `/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin`.
- Config client local/production: `linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin`.
- Hai config chỉ đổi `SystemConfig[107].conditions`: `[{type:2,value:10028,cond:4}]` → `[{type:2,value:10002,cond:4}]`. Các chunk bảng khác giữ byte nguyên vẹn; bảngSystemConfig roundtrip và chỉ đổi đúng field này.
- `linhhoasu/webgame/game/index.html`: cache version `20260905_delegate_first_task_v1`; không thay logic client JS, UI hoặc wrapper WebSocket.
- Cây config CN tham chiếu local `linhhoasu/lhs/update` không ghi đè; test backend dùng snapshot config production đã sửa trong workbench.
- Tool mới: `snapshot_delegate_first_task.py`, `patch_delegate_first_task_config.js`, `test_delegate_first_task.js`, `test_delegate_client_condition.js`, `deploy_delegate_first_task.py` dưới `_ai_workbench/tools/`.
- Evidence: `_ai_workbench/temp/delegate_first_task_20260905/manifest.json`, `deploy_20260905_091316.json` và config trước/sau.
- Backup production: `/linhhoasu/_ai_workbench/backups/delegate_first_task_20260905_091316/` gồm4artifact trước sửa; local `_ai_workbench/backups/delegate_first_task_local/`.

## 3. Lỗi đã gặp & giải pháp

| Phát hiện | Nguyên nhân | Xử lý | Chống lặp |
|---|---|---|---|
| Ủy thác mở muộn | System107 đợi current main task≥10028 | Đổi cùng điều kiện server/client thành10002 | Không đổi thành10001 vì sẽ mở trước nhận thưởng |
| Có thể claim nhiệm vụ đầu chưa hoàn thành | Claim cũ chỉ kiểm chưa nhận | Riêng10001 bắt status20 | Test request sớm không nhận quà/không unlock |
| Báo unlock trước lưu dữ liệu | Claim thường background save | Riêngclaim10001 awaitsave, failure invalidate session | Test lỗi save không trảsuccess |
| Test menu cũ thiếu tham số | Cần cảbundleJS vàindexHTML | Chạy lại đủ2path,27checksPASS | Đọc entrypoint test trước chạy |

## 4. Kỹ năng / kinh nghiệm mới

- Điều kiện type2 với nhiệm vụ chính tuyến đo ID nhiệm vụ đang làm; target10002 bảo đảm đã qua bước nhận thưởng10001.
- Client thật gọi sendConditionSystems(2) khi nhận update task và cập nhật nút qua SYSTEM_UNLOCK_UPDATE+107. Không cần thêm packet tùy ý hay mở mọi hệ.
- Hệ107 còn được client dùng cho điều kiện hiện icon commentGift; phụ thuộc này cũng đạt sớm hơn theo config107, không cấp thêm phần thưởng/comment entitlement.
- Các ràng buộc vận hành bình thường còn nguyên: có đồ chờ xử lý có thể cần giải quyết trước khi bật ủy thác. Không bỏ điều kiện của tính năng trả phí riêng như fast-mode/thẻ.

## 5. Kiểm tra và trạng thái

- Test server30assertions: trước nhận thưởng khóa; nhiệm vụ hoàn thành nhưng chưa claim vẫn khóa; haihandler claim đều mở107 sau10001; bánhbao+5 đúng một lần; retry không thưởng thêm; settingautoEquipUpgrade giữ nguyên; JSON/reload giữunlock; savefailure khôngsuccess.
- Test hàm điều kiện trích client thật: currentTask10001=false,10002=true,10083=true,null=false; có task update recheck và event107.
- Config server/client714bảng, chỉ1SystemConfig field thay; HTTP clientconfig servedhash khớp candidate.
- Regression menuủy thác27checksPASS; nhiệm vụHồnngọc12casePASS; core714bảngPASS.
- Staging và fixture productionPASS;4artifact deployedhashkhớp;S1/S2ready200,PM2online. Chỉ restart gameS1/S2 vì chungsource, khôngrestartdist/admin/DB/Nginx. Bot reconnect theo evidence, không gọi đủ580 nếu chưa đo.
- Không sửaDB người thật hoặc tự thao tác game. UI acceptance do người dùng tự kiểm theo yêu cầu trước.

## 6. Hướng dẫn test

1. Tải lại game một lần (Ctrl+F5) để nhận config mở khóa mới, rồi đăng nhập.
2. Nhân vật mới: trước khi nhận thưởng nhiệm vụ đầu, Ủy thác còn khóa.
3. Làm xong và **nhận thưởng nhiệm vụ10001**; mở nútỦy thác và bấmBắt đầu. Không cần đợi level cao hoặc nhiệm vụ10028.
4. Nhân vật cũ đã qua nhiệm vụ đầu: dùng được sau khi tải config mới; thiết lập ủy thác cũ không bị reset.
5. Đăng nhập lại kiểm vẫn mở. Nếu nút vẫn xám, gửi ảnhnhiệmvụ hiện tại và thời điểm để đối chiếu cache/config; không reset nhiệm vụ người thật để test.
