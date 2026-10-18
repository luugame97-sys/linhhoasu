# Fulu client follow-up — 08/10/2026

## Candidate, chưa deploy

- Baseline fresh `fulu_qa_20261008/before/webgame/game/js/lhs-fulu-safe-v1.js` SHA256 `5afd8377be87a2e6e214233e3e30c51fa83c3a7d1a0e282f223e6d40f80e9f4b`, trùng bản07.
- Candidate `fulu_qa_20261008/candidate/webgame/game/js/lhs-fulu-safe-v1.js`, version `20261008_fulu_safe_v2`.
- Lỗi1: callback timeout draw bỏ qua khi owner/cycle đổi nhưng không giải phóng active; cả draw/select/task bị khóa vô hạn nếu không có OnSocketClose. Fix release pending, giữ nonce unresolved cũ; không rollback lựa chọn vào owner/cycle mới.
- Lỗi2: task ACK hợp lệ theo ngày gửi nhưng đã qua GMT+7 midnight vẫn apply status30 vào task mới; retry cũng gửi intent ngày cũ. Fix check current taskDay ở correlation/send/callback, release pending khi session/ngày đổi, không apply taskInfo cũ.
- Không sửa packet contract, rewards/rates, native minified main, maintenance addon, index hay server. Không hot-inject v2 vào page đã wrap v1; dùng full reload khi root publish.

## Kiểm chứng

- `_ai_workbench/tools/test_fulu_client_followup_20261008.js`: baseline 7 PASS/5 FAIL, candidate12/12 PASS.
- Existing safe-client suite12/12 PASS qua module compilation dùng candidate, không sửa test cũ.
- Node syntax PASS. Diff so fresh chỉ6 hunks: version, rollback context guard, draw timeout cleanup, taskDay correlation/send/callback.
- RAM native-extracted functions: 1775 trước/sau1700,1701 row không settle draw, ACK trước đó settle retry cùng nonce một lần, animation throw/timeout, skip checkbox/reward dismissal lock, actor/cycle/day transitions.
- Không kiểm chứng browser Spine animation, popup hình ảnh, RPC thực, native event dispatch toàn bộ, inventory/DB production hoặc real midnight. Item/model harness không thay thế live E2E.

## Auto init / maintenance

- Addon boot chỉ tìm model/class và wrap prototype (retry tối đa30giây), không tự gửi login/operate/task RPC. Native draw gửi1700 sau summon; callback dispatch `ACTIVITY_FULU_DRAW_HULU`;1775 qua `onDrawResult`.
- Fresh maintenance addon chỉ toast khi server response `code=EVENT_MAINTENANCE && result!==0`. Diagnostic tag/id/module/type/ids là tọa độ sanitized; không đủ căn cứ nói toast từ Phúc Lộc nếu chưa capture.
- Fulu handler chỉ nhận maintenance đúng nonce/cycle (v2 task thêm current day); addon maintenance generic vẫn có thể toast cho stale/unrelated rejected request khi Fulu trảfalse. Không mở gate/bypass hoặc sửa toast toàn cục vì chưa có bằng chứng live.
- Native UI: `FuluMainPanel`, `ActivityFuluData`; controls `summonBtn`, `chooseHulu`, `skipCheckBox`, `closeBtn`; `yp.getActivityData()` chọn event.

## User báo đơ khi chọn x2–x5

- Native pipeline extracted bổ sung8 ca: x2/x3/x4/x5 × skipfalse/true, từ onDrawResult qua background,generate/shuffle,5drop,finalJudgment,rewardcleanup và dismissal. BEFORE8/8 PASS khi giả lập đủ Spine/drop callbacks; candidate tổng20/20 PASS. Chưa tái hiện nguyên nhân lỗi UI thực theo multiplier, không gán prior actor/day fix cho lỗi này.
- Server vẫn trả colorCount tổng5 ở mọi multiple; multiple nhân cost/reward/score, lưu extra.currentMultiple. Native cũng dựng5 hulu, không phải20/25.
- Rủi ro native: spineBg a_1 không complete; FuluItem loadEnsure reject chỉconsole.error không callback; drop complete trước timer HIT166ms có thể lỡ judgment cuối. Cần root console/stage/counter live xác định trước sửa; test hiện mock asset callbacks, không chứng minh assets/Spine runtime.

## Lifecycle candidate v3

- Candidate bổ sung state `__lhsFuluAnim` (5 hit/5 complete), idempotent `performFinalJudgment`, và late-HIT fallback chỉ gọi judgment khi đủ cả hai bộ callback. Không đổi server packet, reward, rate, số hulu hoặc controls popup.
- Hash hiện tại `2424e6c4d40317a28dbb1821eee45cc52c20fc2f22bd1430d955d68827e70cb2`.
- Existing follow-up suite: 20/20 PASS, syntax PASS. Harness hiện không expose native `onHuluDropHit/onHuluDropComplete/performFinalJudgment` methods nên race-specific browser/Spine callback chưa được chứng minh trong RAM suite; root cần live console hoặc native harness mở rộng trước deploy.
