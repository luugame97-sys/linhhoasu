# Phân tích read-only payload/RPC quanh lỗi mất input - 01/09/2026

## Phạm vi

- Chỉ đọc source/log hiện hành của VPS test `192.168.200.151` và hai trace đã lưu.
- Không deploy, không restart, không đổi DB/cấu hình và không thao tác production.
- Mục tiêu: tìm payload/RPC/timer server khác `2150/2160` có quan hệ thời gian với lần hit-test rơi về root `Main`.

## Kết quả chính

Trong lượt A/B đã tắt `2150/2160`, **không có payload gameplay/broadcast server nào đến gần thời điểm lỗi**:

| Mốc UTC | Sự kiện | Bằng chứng |
|---|---|---|
| `18:10:37.087Z` | Packet non-heartbeat cuối: `tag=1400`, `msgUid=16`, `{result:0}` | Trace seq `1654` |
| `18:11:41.465Z` | Bốn điểm probe vẫn hit đúng avatar/trang bị/menu/map | Trace seq `1922` |
| `18:11:41.482Z` → `18:12:21.463Z` | Chỉ nhận heartbeat `tag=11`, payload hash cố định `4642b87c` (`{kick:false}`) | Seq `1925, 1928, 1931, 1934, 1937` |
| `18:12:22.306Z` | Cả bốn probe đồng thời đổi sang `Main` | Trace seq `1938` |

Khoảng `105,219 giây` từ packet gameplay cuối `1400` đến lỗi và `40,841 giây` từ probe tốt cuối tới probe xấu chỉ có heartbeat. Không có RPC gameplay, push map, task, rương, activity hoặc bot broadcast trong khoảng đó.

Hai snapshot probe tốt/xấu có cùng:

- `ViewManager openCount=2` và cùng tập key;
- `BoxLayerModel inStates=[3]`, `_targetEntityId=''`, `battle=null`;
- số layer và toàn bộ thuộc tính snapshot được ghi (`visible`, `alpha`, `touchEnabled`, `touchChildren`, `numChildren`, transform, mask, render node, onStage, contentBounds) không có diff;
- không có `view.call` hay `display.mutation` được instrumentation bắt giữa hai probe.

Tức lỗi quan sát được là hit-test/render-tree nội bộ đổi mà không có packet gameplay hay mutation thuộc tính được trace làm tiền đề.

## Đối chiếu lượt baseline có broadcast

Lượt baseline có `2150/2160` cũng xuất hiện snapshot hit `Main` lúc `17:49:01.657Z`:

- packet non-heartbeat cuối gần đó là `2150` lúc `17:48:23.544Z`;
- tiếp theo là heartbeat `11` lúc `17:48:36.017Z`, `17:48:46.020Z`, `17:48:56.020Z`;
- UI thao tác cuối là đóng `RealmView` lúc `17:48:45.347Z`;
- snapshot tốt cuối `17:48:45.457Z`, snapshot xấu đầu `17:49:01.657Z`;
- hai snapshot có cùng layer/view/gameplay và không có diff thuộc tính đã ghi.

Vì A/B tắt hoàn toàn `2150/2160` vẫn tái hiện cùng kiểu mất hit-test, các tag này là exception thật nhưng không giải thích root cause freeze.

## Timer và push phía server hiện hành

Source VPS test hiện có:

- Watchdog ping WebSocket chạy `setInterval`, chỉ gửi control frame `ping`; không gửi packet game vào handler client.
- `tag=11` là request từ client mỗi khoảng 10 giây; handler trả đúng `{kick:false}` và renew Redis session.
- Không có bot worker hoặc `BotPopulationService` trong cây test đang chạy; PM2 chỉ có `lhs-s1001`.
- Log cùng lượt A/B sau khi vào map xác nhận chỉ `tag=11`, queue depth `1`, response đều hoàn tất; không có handler stuck/deadline/queue backlog tại cửa sổ freeze.

## Candidate A/B server an toàn

Chỉ còn một candidate server-side có thể A/B trực tiếp từ trace là response heartbeat `tag=11`, nhưng độ ưu tiên **thấp** vì:

- payload hash `4642b87c` giống hệt trước và sau freeze;
- hàng chục heartbeat đã được xử lý thành công khi UI còn hoạt động;
- freeze không khóa socket: heartbeat tiếp tục sau khi hit-test đã rơi về `Main`.

Nếu vẫn cần đóng giả thuyết này bằng A/B:

1. Chỉ trên VPS test, thêm flag `LHS_TEST_HEARTBEAT_RESPONSE_MODE=empty` ở `basic.handleHeartbeat` để giữ ACK/msgUid nhưng trả data rỗng `{}` thay vì `{kick:false}`.
2. Không được bỏ ACK vì sẽ tạo biến mới là callback pending; không đổi interval và không chạm heartbeat control frame của `ws`.
3. Backup đúng `src/handlers/basic.js` và ecosystem; restart riêng `lhs-s1001`; verify `/ready`, PID/restart/listener.
4. Soak ba lượt, cùng account/map, trace hit-test. Nếu vẫn đơ, rollback ngay hai file và loại server heartbeat.
5. Nếu không đơ, đảo A → B → A để chứng minh tái lập trước khi coi heartbeat liên quan.

Không đề xuất tắt các login packet `500/1000/10001/1400` theo nhóm vì chúng là bootstrap bắt buộc, không đến tại thời điểm freeze và thay nhiều biến cùng lúc sẽ không chứng minh được nguyên nhân.

## Kết luận

Từ bằng chứng hiện có, không tìm thấy payload/RPC/timer gameplay server nào ngoài heartbeat trùng cửa sổ lỗi. Server process/queue không treo; lỗi biểu hiện ở client hit-test/render lifecycle. Bước A/B có giá trị cao hơn là client timer/render invalidation; A/B heartbeat chỉ nên dùng như phép loại trừ cuối với ACK được giữ nguyên.

## Artifact

- `_ai_workbench/notes/vusa_server_trigger_trace_raw_20260901.json`
- `_ai_workbench/notes/vusa_ab_no_box_broadcast_trace_20260901.json`
- `_ai_workbench/temp/test_payload_inventory_20260831_182729/`
- `_ai_workbench/temp/test_runtime_evidence_20260831_182919/`
- `_ai_workbench/tools/inspect_test_payloads_readonly.py`
- `_ai_workbench/tools/fetch_test_runtime_evidence_readonly.py`
