# Lỗi giao diện phong cách 15502 — 22/09/2026

## Tái hiện trực tiếp trên Codex In-app Browser

- URL: `http://103.116.105.154:81/`
- Bundle live: `main.min_drop100.js?v=20260921_attr_units_v1`
- Console lỗi chính:

```text
TypeError: Cannot read properties of undefined (reading 'bg')
  at f.updateTheme (...main.min_drop100.js:366:1176415)
```

- Stack cho thấy lỗi xảy ra khi `MainPanel.updateTheme()` chạy, trước khi giao diện phong cách render hoàn chỉnh.
- Có thêm lỗi renderer `TypeError: Cannot read properties of undefined (reading 'id')` trong cùng bundle khi danh sách UI được validate; đây là lỗi phụ sau khi view/config đã ở trạng thái không hợp lệ.
- `NotAllowedError play()` và cảnh báo spine tải chậm là lỗi âm thanh/tải tài nguyên riêng, không phải nguyên nhân trực tiếp của 15502.

## Nguyên nhân chính

`FashionBtnConfig[15502].theme = 2`, nhưng bundle live chỉ định nghĩa `MainThemeDataMap` cho theme `0` và `1`. Code hiện tại tương đương:

```js
var theme = Y.FashionModel.getMainPanelThemeType();
var data = MainThemeDataMap[theme];
this.themePanelBg.source = data.bg;
```

Khi chọn/đang sở hữu 15502, `data` là `undefined`, nên đọc `data.bg` làm crash view.

## Thiếu tài nguyên/config đối chiếu

- Có config/banner `15502` (`ztqh_bm_qhbanner_02`) và `FashionConfig.type=107`.
- Chưa có mapping runtime `MainThemeDataMap[2]` trong bundle.
- Không thấy bộ resource nền/icon `main_bm_scroll_02`, `main_bm_scroll_jz_02`, `main_bt_attack_02` tương ứng trong catalog resource hiện có.
- Server ownership gate vẫn đúng: RPC `1812` kiểm `FashionConfig.type=107` và `hasFashionOwnership`; không phải lỗi cấp quyền.

## Kết luận và hướng sửa an toàn

Đây là **lỗi thiếu theme runtime cho ID 15502**, không phải do item tăng chỉ số hay do account. Không nên chỉ sửa server ownership.

Có hai hướng:

1. Bổ sung đầy đủ asset + `MainThemeDataMap[2]` đúng thiết kế 15502, rồi kiểm UI/native resource.
2. Tạm fallback theme2 → theme1 để không crash, nhưng khi đó 15502 chỉ hiển thị giống 15501; phải ghi rõ đây là fallback, không gọi là giao diện 15502 hoàn chỉnh.

## Fallback tạm thời đã triển khai

- Addon `lhs-theme2-fallback-v1.js?v=20260922_theme2_fallback_v2` bổ sung `MainThemeDataMap[2]` bằng bản sao mapping theme1 (`bg`, `bgPole`, `newBg`, `icon`, `iconSp`).
- Giữ nguyên `getMainPanelThemeType() = 2`, ownership và RPC 1812; chỉ thay mapping hiển thị, nên item vẫn là 15502.
- Backup: `/linhhoasu/_ai_workbench/backups/theme2_fallback_20260922`.
- Không restart PM2, không ghi player/DB. Static index/addon được read-back hash; quyền đọc Nginx đã được khôi phục `644` sau lần stage đầu đặt `600`.
- Browser reload lúc `04:40:55Z`: log xác nhận `Theme2Fallback ... ready; render=theme1`; không còn `undefined (reading 'bg')` hoặc `reading 'id'`. Chỉ còn `NotAllowedError` audio autoplay.

15502 hiện hiển thị tạm theo giao diện 15501; khi có asset theme2 thật có thể thay mapping mà không đổi ownership/RPC.
