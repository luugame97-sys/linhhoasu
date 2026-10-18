# Lỗi mất tương tác toàn màn hình - TẠM DỪNG

Thời điểm chốt: 2026-08-31 16:50:37 +07:00

## 1. Triệu chứng cần nhớ

- Sau khoảng 2–5 phút chơi/để game chạy, nhân vật, hoạt ảnh và âm thanh vẫn hoạt động nhưng người chơi không bấm/chạm được bất kỳ vị trí nào trong canvas game.
- Lỗi ảnh hưởng toàn bộ game, không chỉ Pháp tướng/Pháp bảo hay một popup cụ thể.
- Có lần touch vẫn tới Egret stage nhưng hit-test trả về root `Main` thay vì control được bấm.

## 2. Kết luận hiện tại

- Chưa xác định được nguyên nhân gốc duy nhất.
- Server có thể là tác nhân gián tiếp nếu RPC thiếu/chậm làm client giữ mask hoặc trạng thái chờ, nhưng `target=Main` xảy ra trước khi gửi RPC nên bằng chứng hiện tại nghiêng về lifecycle/hit-test client.
- Không được coi `target=Main`, `UI_Main.alpha=0`, PowerSaving, GuideMask, warning Spine hoặc queue server riêng lẻ là root cause khi chưa có chuỗi thời gian nhân quả.

## 3. Đối chiếu APK Trung đã biết

- APK Trung là native Egret và tải bundle/tài nguyên từ CDN; APK không chứa trực tiếp bundle game dùng để chép sang bản Việt.
- Bundle Trung và local là hai build khác nhau.
- Hit-test lõi Egret tương đương.
- `PowerSavingModePanelSkin`, `GuideMaskSkin`, `CloudCompSkin` và `ClickCloseTipLayerSkin` có cấu trúc/thuộc tính touch tương ứng giống nhau.
- Khác biệt ở `GuideHandSkin`, `LoadingLayerSkin`, `MainPanelSkin`, `MainPanelNewSkin`, `ItemIconSkin` đã kiểm tra chỉ là text Trung/Việt, không phải thuộc tính touch/layer.
- Các khác biệt cần A/B riêng: loader XHR/fetch, action completion guard, socket-send guard, top-combat guard, popup DOM và lifecycle `ViewManager`/cloud/RPC.

## 4. Những việc không được làm khi tiếp tục

- Không thêm guard touch/alpha hoặc dispatch tap thủ công mới khi chưa bắt được mutation đầu tiên.
- Không chép `main.min_97d2b812.js`, `gameEui_29fcdea7.bin` hoặc resource Trung đè production.
- Không rollback server, bot, auth, MongoDB/Redis hoặc dữ liệu người chơi chỉ dựa trên lỗi touch.
- Không tuyên bố đã fix chỉ vì test tĩnh PASS, `/ready=200`, animation warning biến mất hoặc một lần soak ngắn không tái hiện.

## 5. Tiêu chí xác định đúng nguyên nhân

Phải thu được trong cùng một lần tái hiện và cùng timestamp:

1. Touch target trước/sau lỗi và kết quả `stage.$hitTest`.
2. `ViewManager._opens`, popup/loading children, `visible`, `alpha`, `touchEnabled`, `touchChildren`, mask/scrollRect và transform.
3. Lời gọi đầu tiên vào `open/close/checkFullScreenDialog/hideMainUI/showMainUI/showCloud/hideCloud` làm trạng thái đổi sai.
4. Nếu có RPC: `msgUid`, tag, thời điểm gửi, ACK/error/timeout và RepeatRpc state.
5. Chuỗi chứng minh được: `mutation đầu tiên -> hit-test/overlay sai -> click thất bại`.

## 6. Quy trình tiếp tục sau này

1. Chụp hash/token/PID hiện tại trước khi làm; không dùng hash cũ trong ghi chú này như trạng thái hiện hành.
2. Dựng candidate ngoài production, giữ nguyên bundle/resource Việt hóa.
3. A/B từng wrapper một; không thay nhiều biến cùng lúc.
4. Soak 5–10 phút cùng tài khoản, map và thao tác kiểm tra; đóng DevTools khi đo trải nghiệm, chỉ export trace một lần.
5. Chỉ sau khi đạt tiêu chí mục 5 mới viết kế hoạch patch, test và rollback.

## 7. Artifact tham chiếu

- `_ai_workbench/reports/session_report.md`
- `_ai_workbench/temp/cn_origin_70000001_20260831/`
- `_ai_workbench/temp/client_touch_version_summary_20260831.txt`
- `_ai_workbench/temp/engine_touch_function_compare_20260831.txt`
- `_ai_workbench/temp/gamesocket_methods_20260831.txt`
- `_ai_workbench/temp/index_loader_compare_20260831.txt`
- `_ai_workbench/temp/resource_config_compare_20260831.txt`
- `_ai_workbench/temp/gameeui_skin_compare_20260831.txt`

