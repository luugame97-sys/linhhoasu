# Kiểm tra ảnh màn hình đăng nhập (02/09/2026)

## Kết luận

Ảnh nền trắng trong ảnh người dùng gửi là **ảnh mặc định hợp lệ** của client, không phải asset bị ghi đè do rollback marquee.

Asset khớp với ảnh hiển thị:

`/linhhoasu/webgame/game/update/resource/assets/game_start/login_bg_4f696aaa.jpg`

Ảnh này có nền mây trắng, tháp phát sáng và nhân vật ngồi thiền, đúng với phần nền trong ảnh.

## Cơ chế đổi ảnh theo chủ đề/thời gian

Trong `js/start.min_52ac8d58.js`, client chọn nền theo mốc thời gian:

```text
Nếu đang trong khoảng linkageStartTime..linkageEndTime và chưa bật skipIntro:
    loadingBGImg = login_ld_bg
Nếu ngoài khoảng đó:
    inChina ? login_bg : login_bg_tw
```

Mốc đang có trong bundle:

- `linkageStartTime = 1784044800000` → 14/07/2026 23:00 (GMT+7).
- `linkageEndTime = 1788278400000` → 01/09/2026 23:00 (GMT+7).

Vì vậy sau 01/09/2026 23:00, client tự chuyển về `login_bg` (nền trắng) khi `inChina=true`. Đây là hành vi theo chủ đề/ngày, không phải lỗi.

## Đối chiếu asset production/local

| Asset | Kết quả |
|---|---|
| `login_bg_4f696aaa.jpg` | VPS/local khớp SHA-256 `8b4ff5c56b2262b44f61b02db04ee28cf78836a6c033ce3a505c9a603d6b8f5d` |
| `login_bg_tw_8d2e3139.jpg` | VPS/local khớp SHA-256 `2454583865e44d42ef2d50b46ef3820250ff9218fe02c91f2f690ef4ee806d5d` |
| `login_ld_bg_fa5c6746.jpg` | VPS/local khớp SHA-256 `c635a4b302aded75746494f42e7ad8bf163f054e6e37d16d8675f0ec8d054904` |
| `atlas_ui/9_login` | 96/96 file khớp, mismatch 0 |
| `gameEui` login skins | 30 skin được chọn so sánh, khác biệt 0 |
| `start.min_52ac8d58.js` | VPS/local khớp SHA-256 `e822365fca7b7380e60c0c80025d8efaeb798b19543067a609d0117a25ec9e24` |

## Những khác biệt không liên quan

- `index.html` production có các patch trước đó (cache token `20260831_tien_duyen_fix_v1`, hit-route V6) nên hash khác file local hiện tại.
- `main.min_a6195824.js` và `config_e5ac72c2.bin` production cũng là các bản production đã có thay đổi tính năng trước đây; không có thay đổi nào trong rollback marquee chạm các file này.
- Các khác biệt trên không làm đổi asset `login_bg` và không phải nguyên nhân ảnh trắng xuất hiện.

## Trạng thái

- Không sửa asset/client trong phiên này.
- Không rollback ảnh hoặc config theo cảm tính.
- Ảnh hiện tại là đúng theo lịch chủ đề của client.

Evidence: `_ai_workbench/temp/client_core_remote_audit_20260902.json`, `_ai_workbench/temp/login_skin_remote_local_diff_20260902.json`.
