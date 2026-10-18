# A/B xác minh server-trigger - 01/09/2026

## Phạm vi

- Chỉ VPS test `192.168.200.151`, S1 `lhs-s1001`.
- Production `103.116.105.154` không bị thay đổi.
- A/B tắt riêng broadcast cross-user của tag `2150` và `2160`; không tắt request/response rương cá nhân, heartbeat, di chuyển, chat hoặc các RPC khác.

## Baseline có broadcast

- Client VUSA full asset + login local.
- `2150`/`2160` đến liên tục từ bot/player ID dạng `p_u_Wk_1001_...`.
- Handler VUSA ném lặp `TypeError: Cannot read properties of undefined (reading 'GetEntity')`.
- Fixed probe ghi lúc `18:03:35.845Z` cả bốn điểm avatar/weapon/menu/center đổi về target `Main` trong khi map đang hiện.

## A/B không broadcast

- Backend test flag `LHS_TEST_DISABLE_BOX_BROADCAST=1` trên S1.
- `/ready=200`, process online; sau khi chờ map ổn định:
  - `rpc.receive tag=2150`: 0.
  - `rpc.receive tag=2160`: 0.
  - `rpc.handler.throw`: 0.
- Lỗi hit-test vẫn tái hiện lúc `18:12:22.306Z` (~57 giây sau khi vào map): cả bốn điểm đổi đồng thời về `Main`; native pointer vẫn vào canvas; không có RPC ngoài heartbeat tag `11` trong cửa sổ 6 giây trước đó.
- `webglContextLost=false`, `document.visibilityState=visible`, canvas kích thước bình thường. Điều này loại broadcast rương và lỗi WebGL context-lost trong lượt A/B.

## Kết luận

- Tag `2150/2160` và bot broadcast là lỗi thật cần sửa riêng vì gây exception client, nhưng **không phải nguyên nhân duy nhất của mất input**.
- Việc tắt chúng không loại bỏ freeze; CentOS 9 cũng tái hiện theo thông tin người dùng.
- Không có bằng chứng server process, MongoDB, Redis, queue hoặc OS là nguyên nhân trực tiếp. Tác nhân còn lại nằm ở client Egret/View/render lifecycle hoặc một timer/state client độc lập với các broadcast trên.

## Phục hồi

- Đã khôi phục source server và ecosystem về pre-A/B backup `/linhhoasu/_ai_workbench/backups/ab_disable_box_broadcast_v2_pre_20260831_180858/`.
- Đã khôi phục hybrid index không instrumentation từ `/linhhoasu/_ai_workbench/backups/vusa_local_login_ui_pre_20260831_171039/index.html` và xóa trace khỏi web test.
- Sau phục hồi: `/ready=200`, không còn flag A/B, không còn file trace.
