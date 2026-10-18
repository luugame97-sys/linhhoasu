# Kiểm tra trần cấp câu cá và ngư trường — 22/09/2026

## Kết luận

- **Linh Hải Vô Biên là ngư trường thường cuối cùng hiện có**: `FishSceneConfig` ID7, yêu cầu cấp câu cá **28**, tên `30030286` (`灵海无垠`). Các ngư trường thường ID1–7; ID6 yêu cầu25, ID7 yêu cầu28.
- **Cấp 28 không phải cấp câu cá tối đa**. Runtime có `FishLevelConfig` **1–40**; cấp40 là dòng cuối, không có EXP yêu cầu tiếp và không có cấp41. Cấp29–39 vẫn tồn tại và có thể tiếp tục tăng.
- Các ID101/201/301/401/501 là **ngư trường sự kiện** (`isActivity=1`), không phải mốc ngư trường thường; việc mở chúng phụ thuộc lịch/sự kiện hiện hành.
- Bản sửa trước đã bỏ `openDay` khỏi gate server cho ngư trường thường. Vì vậy hiện tại ID7 cần cấp28, không còn phải chờ ngày71.

## Bằng chứng thực tế

- Đọc cấu hình runtime trên VPS S2 (`lhs-s1002`), không ghi DB/player: `FishLevelConfig` 40 dòng, max id40; `FishSceneConfig` ID7 `{cond:28, openDay:71, isActivity:0}`.
- Source production `FishingIntegrityService.js` khớp local; `canUseScene` cho map thường chỉ kiểm `fishInfo.level >= row.cond`, không kiểm tuổi server.
- Runtime source/config read-back và hash HTTP đã được đọc trực tiếp; không sửa/deploy trong lượt audit này.
