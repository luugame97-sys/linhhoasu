# Báo cáo tổng kiểm kê Gói Vận Thế – Shop 11018000

## 1. Tổng kết mới nhất

Thời điểm snapshot production: **16:33:14 01/09/2026 (UTC+7)**, tương ứng ngày ledger GMT+8 số `20697`.

| Chỉ số | Kết quả |
|---|---:|
| Tài khoản duy nhất từng nhận | **37** |
| Nhân vật duy nhất từng nhận | **37** |
| Tổng lượt nhận thành công | **408.227** |
| Tổng bánh bao đã phát từ riêng gói này | **4.082.270** |
| Tổng số dư bánh bao hiện tại của 37 người | 5.205.399 |
| Người vượt giới hạn tối thiểu | 36 |
| Lượt vượt giới hạn tối thiểu | 408.100 |
| Bánh bao vượt giới hạn tối thiểu | 4.081.000 |
| Người đã nhận trong ngày GMT+8 hiện tại | 24 |
| Ledger hôm nay vượt quá 1 | **0** |
| Hai counter Mongo không khớp | **0** |
| UI và ledger hôm nay không khớp | **0** |

### Kết luận chính

- Có đúng **37 tài khoản / 37 nhân vật** từng nhận gói.
- Hai counter độc lập `shopInfo.buyRecords.11018000` và `rechargeInfo.records[id=11018000]` khớp **37/37**, nên tổng **408.227 lượt / 4.082.270 bánh bao** là số persisted chính xác.
- Tổng số dư hiện tại 5.205.399 không phải toàn bộ quà bug còn lại: nó bao gồm bánh bao từ nguồn khác và đã bị thay đổi do người chơi tiêu/nhận thêm.
- Cột “vượt tối thiểu” dùng phương án có lợi cho người chơi: cho phép tối đa 1 lượt ở mọi ngày GMT+8 mà activity của chính nhân vật có thể hoạt động. Vì vậy đây là mức tối thiểu chắc chắn, không phải phép suy đoán tối đa.

## 2. Trạng thái sau hotfix

- 23 người đã nhận trước hotfix được backfill ledger.
- Sau hotfix có 1 lượt thật được cấp hợp lệ; tài khoản: `u_Wk_1001_05f5ee_1788106502615`.
- Hiện có 24 người mang ledger hôm nay `count=1`.
- Không có ledger `count>1`; UI/ledger khớp 37/37.
- Source live vẫn đúng hash hotfix:
  - `item.js`: `6176b6ea089ee5b3609318edf24d81ee4906dc86c62d99063477d4481a89c922`
  - `activity.js`: `ef1406ca7045138fe4c4a98b1973bdca16725f6ecd6c55d1593d5e9f98b8f482`
- Server healthy; audit hoàn toàn read-only, không thay đổi dữ liệu người chơi.

## 3. Danh sách đầy đủ

| STT | Tài khoản | Nhân vật | User ID | Lượt nhận | Bánh bao từ gói | Số dư hiện tại | Ngày được phép | Lượt vượt tối thiểu | Bánh bao vượt tối thiểu | Hôm nay |
|---:|---|---|---|---:|---:|---:|---:|---:|---:|---|
| 1 | zerovip28n | Hỗn Độn Thần Đế | u_Wk_1001_5d7d2c_1788064420643 | 310.035 | 3.100.350 | 3.103.794 | 4 | 310.031 | 3.100.310 | Đã nhận |
| 2 | nhutpq20277 | nhutpq20277 | u_Wk_1001_e2c73a_1788008957902 | 24.997 | 249.970 | 231.560 | 5 | 24.992 | 249.920 | Đã nhận |
| 3 | tuanchoc928 | FangZi | u_Wk_1001_7a948e_1788008560635 | 24.990 | 249.900 | 326.708 | 5 | 24.985 | 249.850 | Đã nhận |
| 4 | hoang0 | Tịnh Liên Yêu Hỏa | u_Wk_1001_adf3aa_1788092299132 | 10.761 | 107.610 | 132.730 | 4 | 10.757 | 107.570 | Đã nhận |
| 5 | phongpg01051994 | Lazada | u_Wk_1001_d90580_1788129989390 | 10.303 | 103.030 | 50.442 | 3 | 10.300 | 103.000 | Đã nhận |
| 6 | tttttt | gc__2_988a | u_Wk_1001_a7b50c_1788013281963 | 9.490 | 94.900 | 105.959 | 5 | 9.485 | 94.850 | Đã nhận |
| 7 | phuhoitrung | VươngLâm | u_Wk_1001_e0c020_1788057145675 | 5.936 | 59.360 | 27.541 | 4 | 5.932 | 59.320 | Đã nhận |
| 8 | cung | Diệp Gia Đại Trưởng Lão | u_Wk_1001_05f5ee_1788106502615 | 4.742 | 47.420 | 70.764 | 3 | 4.739 | 47.390 | Đã nhận |
| 9 | thanhcung | gc__8 | u_Wk_1001_92bc51_1788005398694 | 2.413 | 24.130 | 49.909 | 5 | 2.408 | 24.080 | Chưa nhận |
| 10 | vitnee | Tiểu Thuý Thuý | u_Wk_1001_1124e3_1788105461988 | 1.282 | 12.820 | 15.078 | 4 | 1.278 | 12.780 | Chưa nhận |
| 11 | hop274 | Kiều Huyền | u_Wk_1001_e738c8_1788005468139 | 865 | 8.650 | 14.891 | 5 | 860 | 8.600 | Đã nhận |
| 12 | louie3531 | Đế | u_Wk_1001_71d681_1788234572626 | 742 | 7.420 | 8.197 | 2 | 740 | 7.400 | Đã nhận |
| 13 | dq198x | Hồn Kính | u_Wk_1001_e1e65f_1788235724524 | 641 | 6.410 | 62.141 | 2 | 639 | 6.390 | Đã nhận |
| 14 | daihuy | daihuy | u_Wk_1001_302364_1788083608038 | 202 | 2.020 | 23.295 | 4 | 198 | 1.980 | Đã nhận |
| 15 | tavuong | Tà Đế | u_Wk_1001_88c657_1788190845641 | 192 | 1.920 | 20.445 | 2 | 190 | 1.900 | Đã nhận |
| 16 | minhtoan3120 | Nạp Lan Yên Nhiên | u_Wk_1001_b4ab5f_1788094482156 | 95 | 950 | 41.393 | 4 | 91 | 910 | Chưa nhận |
| 17 | cumcum001 | Vạn Tiểu Sơn | u_Wk_1001_ca0b90_1788165940661 | 74 | 740 | 21.858 | 3 | 71 | 710 | Đã nhận |
| 18 | hieu12345 | Cực Âm Tổ Sư | u_Wk_1001_99b5ed_1788234027377 | 55 | 550 | 22.229 | 2 | 53 | 530 | Đã nhận |
| 19 | dntn0906 | chichchoe | u_Wk_1001_0e9258_1788043345820 | 43 | 430 | 211.962 | 4 | 39 | 390 | Chưa nhận |
| 20 | phongpg151994 | MiMi | u_Wk_1001_d7b56e_1788094701494 | 43 | 430 | 5.594 | 4 | 39 | 390 | Chưa nhận |
| 21 | vanduc97 | nicky | u_Wk_1001_d7b1ec_1787996263464 | 39 | 390 | 16.565 | 5 | 34 | 340 | Đã nhận |
| 22 | baby993 | Lôi Động | u_Wk_1001_8882bf_1788196130897 | 37 | 370 | 22.413 | 2 | 35 | 350 | Đã nhận |
| 23 | tanthutu | Cổ Hà | u_Wk_1001_1bd728_1788232865614 | 35 | 350 | 21.705 | 2 | 33 | 330 | Đã nhận |
| 24 | hoangthiende | Nguyên Yểm Thánh Tổ | u_Wk_1001_41b565_1788236229759 | 29 | 290 | 20.996 | 2 | 27 | 270 | Đã nhận |
| 25 | camdoia12 | gc__6 | u_Wk_1001_4f8629_1788004891118 | 23 | 230 | 20.291 | 5 | 18 | 180 | Chưa nhận |
| 26 | hoangbkvn05 | Thiên Minh Lão Yêu | u_Wk_1001_46b5ac_1788233355369 | 21 | 210 | 21.236 | 2 | 19 | 190 | Đã nhận |
| 27 | yeupevit | Mộc Thần | u_Wk_1001_b74d1f_1788183420669 | 21 | 210 | 22.160 | 3 | 18 | 180 | Chưa nhận |
| 28 | truong051298 | Hàn Nguyệt | u_Wk_1001_8bcec1_1788105451979 | 20 | 200 | 1.666 | 4 | 16 | 160 | Chưa nhận |
| 29 | duyhung | gc_ | u_Wk_1001_9fe422_1788021658929 | 19 | 190 | 41.913 | 4 | 15 | 150 | Chưa nhận |
| 30 | h26042007 | Triệu Trường Chinh | u_Wk_1001_aa17b3_1788176908804 | 15 | 150 | 29.616 | 3 | 12 | 120 | Đã nhận |
| 31 | guest_4616858ef1 | Tây Long Vương | u_Wk_1001_289aec_1788166475907 | 13 | 130 | 25.945 | 3 | 10 | 100 | Chưa nhận |
| 32 | nguyenngoc | NGOCCCC | u_Wk_1001_4a38d3_1788073964732 | 13 | 130 | 155.382 | 4 | 9 | 90 | Chưa nhận |
| 33 | pinponsu | pinponsu | u_Wk_1001_0779e4_1788027204396 | 12 | 120 | 20.043 | 4 | 8 | 80 | Chưa nhận |
| 34 | vjtneee | Tề Vân Tiêu | u_Wk_1001_5b82d5_1788183606537 | 12 | 120 | 22.574 | 3 | 9 | 90 | Đã nhận |
| 35 | baothanga_113 | Tiểu Y Tiên | u_Wk_1001_dee83b_1788177472925 | 9 | 90 | 25.671 | 3 | 6 | 60 | Chưa nhận |
| 36 | duyanhlaanh | Tiêu Viêm | u_Wk_1001_23f9ed_1788137288732 | 7 | 70 | 21.550 | 3 | 4 | 40 | Đã nhận |
| 37 | kawaiino1 | Bắc Long Vương | u_Wk_1001_669477_1788237596763 | 1 | 10 | 169.183 | 2 | 0 | 0 | Đã nhận |

## 4. Cách đọc số liệu

- **Lượt nhận**: counter persisted, chỉ tăng sau khi server phát quà và save thành công.
- **Bánh bao từ gói**: `lượt nhận × 10`, không lấy từ số dư hiện tại.
- **Số dư hiện tại**: toàn bộ bánh bao còn trong túi, có thể đến từ nhiều nguồn và có thể đã tiêu.
- **Ngày được phép**: số ngày GMT+8 activity có thể cho nhận hợp lệ đến thời điểm snapshot.
- **Vượt tối thiểu**: `max(0, lượt nhận - ngày được phép)`.
- **Hôm nay**: đọc từ ledger server-authoritative sau hotfix.

## 5. Độ toàn vẹn và evidence

- Counter mismatch: `0`.
- Account mapping thiếu: `0`.
- Ledger hôm nay vượt 1: `0`.
- Audit JSON: `I:\Linhhoasu\server\server\_ai_workbench\temp\fortune_package_audit\fortune_package_totals_20260901_093320.json`.
- SHA-256 JSON: `8363fc791a9e6f09c4b3f62390c91d422a51122799e3d16ffe7c1dd84dfdf42e`.
- Công cụ audit: `_ai_workbench/tools/audit_fortune_package_totals_remote.py`.
