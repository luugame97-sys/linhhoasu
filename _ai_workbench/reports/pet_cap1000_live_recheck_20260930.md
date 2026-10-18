# Kiểm tra lại trần pet 1000 trên live — 30/09/2026

## Kết luận

- Bản live hiện vẫn đọc đúng `PetBaseConfig.levelMax=200`, `breakLimitPetQuality=[7,9,10]` và `CoercionConfig` stage 50: `coercion=35000`, `limitLevelUp=800`. Công thức live là `200 + bonus stage`; khi đạt stage 50, trần phẩm 7/9/10 = **1000**.
- Năm pet Hỗn Độn `810101/810201/810301/810401/810501` đều có `quality=10`, nên đủ điều kiện mở trần; không bị giới hạn cứng ở 200.
- Stage tạo ra trần **210** là stage 3 (`coercion=200`, `limitLevelUp=10`); stage 4–5 cũng còn bonus `+10`. Stage 6 (`coercion=500`) mới nâng trần lên 220. Vì vậy một pet dừng ở 210 thường là chưa đủ điểm linh hồn để sang stage 6, không tự chứng minh lỗi deploy.

## Read-back live

- ConfigService live tải 718 bảng; giá trị runtime ở trên đọc trực tiếp từ `/linhhoasu/lhs/newServer`.
- `pet.js` live SHA-256 `e6653487c1ad4c1ba71cf816fd6f3357dc9b282d68bd1e7c91f5cfe1200d7f46`; handler `3304`, `3311`, `3314` đều gọi `getPetLevelMax` theo pet/player soul state.
- Sáu `/ready` S1–S6 trả `status=ok`, Mongo/Redis true tại 20:39 ICT; PM2 các node game vẫn online.
- Chưa đọc dữ liệu người chơi cụ thể vì người dùng chưa gửi tài khoản/nhân vật/server. Muốn xác định “kẹt lỗi” hay “đúng stage 210”, cần đối chiếu `pet.id`, `pet.level` và tổng `petSoulInfo` của đúng nhân vật, read-only.

## Giải thích ảnh UI

- Ảnh là `PetDetailView`: nút nâng cấp cấp pet nằm cạnh vùng thuộc tính và dùng item 36 (Quả Linh); có thể bấm/giữ để gửi nâng cấp `3304` khi còn vật liệu.
- Dòng `Cấp 5` trong phần mô tả kỹ năng là bậc kỹ năng theo mốc level, không phải trần level. `Tẩy luyện bị động` chỉ đổi passive skill.
- Khi nút nâng cấp dừng ở 210, quay lại mục **Tinh Linh/Hồn Thú** để nâng sao bằng vật liệu (`6901`), tăng tổng coercion; cần đạt 500 để qua trần 220 và 35.000 để mở trần 1000.
