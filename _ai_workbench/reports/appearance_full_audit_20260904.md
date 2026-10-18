# Audit toàn bộ ngoại quan game — 04/09/2026

## 1. Tóm tắt công việc

- Đã quét đúng source/config production: `FashionConfig` 1.976 dòng, `FashionDressConfig` 59 bộ và 219 dòng collection native.
- Tổng catalog phân tích: **2.254 dòng**, tương ứng **2.189 ID gửi test duy nhất**.
- Phân loại: **1.718 ID tĩnh ổn**, **162 ID lỗi code đã xác nhận**, **309 ID cần test hiển thị native**.
- Đã mô phỏng riêng đường nhận thư trên **2.192 ID catalog** bằng player giả trong bộ nhớ, không kết nối Mongo: 59 item bộ đồ được định tuyến vào túi; thú cưỡi, pháp bảo, linh thú đi đúng collection; còn 58 ID lỗi state/route trực tiếp qua mail.
- Đã audit Mongo production chỉ đọc, ẩn danh account/UID; không gửi vật phẩm, không sửa dữ liệu, không restart.

## 2. Phạm vi catalog

| Nhóm | Số dòng catalog |
|---|---:|
| Bong bóng chat | 60 |
| Danh hiệu | 85 |
| Danh thiếp/phông nền | 75 |
| Dấu chân | 4 |
| Giao diện chính/theme | 1 |
| Khung ảnh đại diện | 65 |
| Linh thú | 41 |
| Nét mặt | 1 |
| Pháp bảo | 54 |
| Pháp bảo đặc biệt | 49 |
| Pháp trận/cánh | 55 |
| Pháp tướng | 58 |
| Phụ kiện ngoại quan type 304 | 2 |
| Phụ kiện đầu | 281 |
| Quần | 280 |
| Thú cưỡi đặc biệt | 6 |
| Thú cưỡi/phi kiếm | 107 |
| Thú hồn | 25 |
| Thú vị/đồ chơi | 1 |
| Thời trang/bộ đồ | 57 |
| Vũ khí | 346 |
| Áo choàng ngoài/thân | 280 |
| Áo choàng tắm | 2 |
| Ảnh đại diện | 319 |

Ba suit nội bộ `28000`, `29810`, `29999` không có item gửi trực tiếp. Riêng `113114` và `113115` dùng chung `itemId=113113` trong config nhưng có Fashion ID riêng; danh sách test cố ý giữ cả `113113`, `113114`, `113115`.

## 3. Lỗi đã xác nhận

| Nhóm | ID duy nhất | Lỗi |
|---|---:|---|
| Danh hiệu | 44 | Kích hoạt ownership nhưng thiếu dữ liệu thời hạn. |
| Pháp trận/cánh | 7 | Mail/reward mở hình nhưng không tạo collection pháp trận. |
| Thú cưỡi/phi kiếm | 30 | Reward/activity generic ưu tiên Fashion; mail đã đi đúng collection. |
| Pháp bảo | 18 | Reward/activity generic ưu tiên Fashion; mail đã đi đúng collection. |
| Pháp tướng | 7 | Mail/reward mở hình nhưng không tạo collection pháp tướng. |
| Thời trang/bộ đồ | 55 | Mặc suit không áp các component; một số bộ còn lỗi màu/nâng sao. |
| Áo choàng tắm | 1 | Mặc suit không áp các component; lỗi mở màu. |

### Kết quả đường nhận thư

- Route đúng: 1.914 Fashion đi vào Fashion; 36 thú cưỡi; 54 pháp bảo; 49 pháp bảo đặc biệt; 41 linh thú; 25 thú hồn; 59 item bộ đồ được chuyển sang nhánh túi.
- Lỗi state/route: trong 1.914 Fashion có 44 danh hiệu thời hạn thiếu `fashionData.limitValues`; 7 pháp trận và 7 pháp tướng chỉ mở Fashion mà không tạo object collection native.
- Thú cưỡi/pháp bảo nhận qua mail hiện đúng vì `mail.js` có special-case. Nhưng các đường activity/reward/shop generic gọi `addRewardRowsToPlayer()` vẫn xét Fashion trước native, nên 30 thú cưỡi và 18 pháp bảo có thể chỉ mở hình.

### Lỗi handler toàn cục

- `1801`: cho mặc và tự ghi sở hữu ID chưa có.
- `1811`: tin danh sách hết hạn do client gửi, không tự kiểm thời gian server.
- Mở màu suit không kiểm ownership/cost; fixture mở được màu khi không sở hữu.
- Nâng sao suit nhận `star=999`, không kiểm ownership/cost/cap và lưu `dress` dạng object trong khi client dùng array.
- Emoji group `999` không có config/cost vẫn mua thành công.

## 4. Danh sách 162 ID lỗi chắc chắn

### Danh hiệu (44 ID)

```text
11201,11212,11213,11214,11220,11221,11222,11223,11226,11228,11229,11230,11232,11233,11237,11238,11239,11240,11241,11246,11247,11248,11249,11250,11251
11257,11258,11259,11260,11261,11262,11263,11264,11265,11266,11267,11268,11269,11270,11271,11272,11273,11280,11284
```

### Pháp trận/cánh (7 ID)

```text
21001,21101,21102,21103,21104,21105,21106
```

### Thú cưỡi/phi kiếm (30 ID)

```text
22101,22102,22103,22104,22105,22106,22201,22202,22203,22204,22205,22206,22301,22302,22303,22304,22305,22306,22401,22402,22403,22404,22405,22406,22501
22502,22503,22504,22505,22506
```

### Pháp bảo (18 ID)

```text
23101,23102,23103,23111,23112,23113,23121,23122,23123,23131,23132,23133,23141,23142,23143,23151,23152,23153
```

### Pháp tướng (7 ID)

```text
24001,24101,24102,24103,24104,24105,24106
```

### Thời trang/bộ đồ (55 ID)

```text
28010,28020,28030,28040,28050,28060,28070,28080,28090,28100,28110,28120,28130,28140,28150,28160,28170,28180,28190,28200,28210,28220,28230,28240,28250
28260,28270,28280,28290,28300,28320,28330,28340,28350,28360,28990,29000,29010,29020,29030,29040,29050,29060,29070,29080,29090,29100,29150,29160,29170
29180,29240,29250,29260,29270
```

### Áo choàng tắm (1 ID)

```text
29800
```


File thuần để copy/gửi test: `appearance_confirmed_problem_ids_20260904.txt`.

## 5. Asset cần test trực tiếp trong client

- Có **309 ID** chưa thể kết luận lỗi chỉ từ manifest: nhiều icon/Spine nằm trong atlas hoặc pack và tên resource không ánh xạ 1:1.
- Không phát hiện bằng chứng đủ chắc để gọi là “mất asset vật lý”. Các ID này giữ trạng thái `CAN_TEST_NATIVE` cho tới khi gửi vào acc test và xem icon/model/animation trong game.
- Phân bố: Bong bóng chat 3, Khung ảnh đại diện 2, Pháp bảo 27, Phụ kiện đầu 27, Quần 24, Thú cưỡi/phi kiếm 31, Vũ khí 102, Áo choàng ngoài/thân 75, Ảnh đại diện 18.

### Bong bóng chat (3 ID)

```text
11531,11563,11564
```

### Khung ảnh đại diện (2 ID)

```text
11463,11464
```

### Pháp bảo (27 ID)

```text
23501,23502,23503,23504,23511,23512,23513,23514,23521,23522,23523,23524,23531,23532,23533,23534,23541,23542,23543,23544,23551,23552,23553,23554,23561
23562,23563
```

### Phụ kiện đầu (27 ID)

```text
28132,30202,30212,80228132,80328132,90010102,90010202,90010302,90010402,90010502,90010602,90010702,90010802,90010902,90011002,90011102,90020102,90020202,90020302,90020402,90020502,90020602,90020702,90020802,90020902
90021002,90021102
```

### Quần (24 ID)

```text
30209,30219,90010109,90010209,90010309,90010409,90010509,90010609,90010709,90010809,90010909,90011009,90011109,90020109,90020209,90020309,90020409,90020509,90020609,90020709,90020809,90020909,90021009,90021109
```

### Thú cưỡi/phi kiếm (31 ID)

```text
22001,22002,22004,22006,22007,22010,22012,22014,22017,22018,22019,22020,22024,22025,22026,22027,22028,22029,22030,22031,22032,22033,22035,22036,22037
22038,22039,22046,22047,22048,22049
```

### Vũ khí (102 ID)

```text
28041,28051,28061,28071,28081,28091,28101,28111,28121,28131,28141,28151,28161,28171,28181,28191,28201,28211,28221,28231,28241,28251,28261,28271,28281
28291,28301,28321,28331,28341,28351,28361,30201,30211,80128041,80128051,80128061,80128071,80128081,80128091,80128101,80128111,80128121,80128131,80128201,80128211,80128221,80128231,80128241,80128251
80128261,80128271,80128281,80128341,80128351,80128361,80228041,80228051,80228061,80228071,80228081,80228091,80228101,80228111,80228121,80228131,80228201,80228211,80228221,80228231,80228241,80228251,80228261,80228271,80228281
80228341,80228351,80228361,80328041,80328051,80328061,80328071,80328081,80328091,80328101,80328111,80328121,80328131,80328201,80328211,80328221,80328231,80328241,80328251,80328261,80328271,80328281,80328341,80328351,80328361
80428241,80428341
```

### Áo choàng ngoài/thân (75 ID)

```text
28043,28053,28103,28113,28123,28133,28143,28153,28163,28203,28213,28223,28243,28253,28263,28273,30203,30213,80128043,80128053,80128103,80128113,80128123,80128133,80128203
80128213,80128223,80128243,80128253,80128263,80228043,80228053,80228103,80228113,80228123,80228133,80228203,80228213,80228223,80228243,80228253,80328043,80328053,80328103,80328123,80328133,80328203,80328213,80328223,80328243
80328253,80328273,80428243,90010103,90010203,90010303,90010403,90010503,90010603,90010703,90010803,90010903,90011003,90011103,90020103,90020203,90020303,90020403,90020503,90020603,90020703,90020803,90020903,90021003,90021103
```

### Ảnh đại diện (18 ID)

```text
11302,12179,12180,12181,12182,12183,12184,12185,12186,12187,12188,12189,12190,112837,112838,113021,113114,113115
```


## 6. Bằng chứng state lỗi trên production

- S1: 1757 player, 597 người thật; 144 người thật có state ngoại quan lệch.
- S2: 581 player, 1 người thật; 0 người thật có state lệch.
- Pháp trận `21101–21106`: 6 người.
- Thú cưỡi `22403–22406`, `22501–22506`: 83 người.
- Pháp bảo `23103`, `23113`, `23123`, `23133`, `23143`, `23153`: 120 người.
- Pháp tướng `24101–24106`: 10 người.
- Suit nội bộ `28000` bị ghi sai vào slot Fashion: 22 người; ID này không có item gửi trực tiếp.

Một người có thể xuất hiện trong nhiều nhóm. Có 29 ID nhận dạng state lỗi, trong đó 28 ID gửi test được và `28000` chỉ dùng nhận dạng state. Danh sách nằm ở `appearance_runtime_affected_ids_20260904.txt`.

## 7. File/thư mục đã thay đổi

- Source game production/local: **không thay đổi**.
- Tool hỗ trợ: `audit_all_appearance_catalog_20260904.js`, `build_appearance_test_inventory_20260904.py`, `run_appearance_catalog_prod_20260904.py`, `audit_appearance_runtime_remote_20260904.js`, `run_appearance_runtime_audit_20260904.py`, `audit_appearance_mail_route_20260904.js`, `run_appearance_mail_route_prod_20260904.py`, `build_appearance_audit_report_20260904.py`.
- Evidence đặt trong `_ai_workbench/temp/`; danh sách và báo cáo đặt trong `_ai_workbench/reports/`.

## 8. Lỗi đã gặp & giải pháp

| Lỗi/phát hiện | Nguyên nhân | Cách xử lý trong audit | Cách tránh lặp lại |
|---|---|---|---|
| Asset không có key trực tiếp trong manifest | Resource có thể nằm trong atlas/pack | Giữ `CAN_TEST_NATIVE`, không kết luận mất asset | Test icon/model/animation native trước khi sửa asset |
| Local `fashion.js` lệch production | Source local cũ hơn source đang chạy | Chạy fixture trên source production | Luôn dùng hash/source live làm chuẩn trước kết luận/deploy |
| 4 Fashion mặc định nhìn như không grant | Player fixture chưa chạy normalize mặc định | Gọi `ensureRoleAppearance()` trước khi đo ownership | So sánh state trước/sau trên fixture đúng lifecycle |
| Cùng ID xuất hiện ở Fashion và native | Catalog dùng một item cho hình và collection | Dedupe theo ID gửi nhưng giữ đủ route | Audit mail và reward generic tách riêng |

## 9. Kỹ năng / kinh nghiệm mới

- Ngoại quan có hai lớp: Fashion hiển thị và collection gameplay; mở hình không đồng nghĩa đã sở hữu pháp trận/thú cưỡi/pháp bảo/pháp tướng.
- Test bộ đồ phải gồm ba bước: nhận item → dùng item → mặc suit/đổi màu/nâng sao.
- ID trong atlas không thể được đánh giá chỉ bằng tên file hoặc key manifest.

## 10. Trạng thái hiện tại

- Audit catalog, mail fixture và runtime read-only: PASS.
- Mail fixture: 2192 ID, 58 ID có lỗi; không kết nối database.
- Danh sách toàn bộ 2.189 ID, 162 ID lỗi chắc chắn, 309 ID cần test native và ID đã thấy lỗi runtime đã được xuất.
- Chưa sửa handler, chưa repair player, chưa gửi vật phẩm, chưa restart S1/S2.

## 11. Bước tiếp theo

1. Dùng `appearance_test_ids_20260904.txt` để gửi toàn bộ catalog vào **acc test riêng**, mỗi ID số lượng 1 và test theo nhóm nhỏ.
2. Ưu tiên 28 ID gửi được trong `appearance_runtime_affected_ids_20260904.txt` (bỏ `28000`), sau đó 162 ID lỗi chắc chắn, rồi 309 ID cần native test.
3. Nếu triển khai fix, cần hợp nhất router Fashion/native, sửa thời hạn title, suit ownership/cost/state và thêm contract cho mail + activity + webshop + giftcode trước khi repair player.
