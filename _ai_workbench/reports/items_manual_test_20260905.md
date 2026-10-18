# Hướng dẫn tự kiểm nghiệm item — 05/09/2026

## 1. Trạng thái bản hiện tại

- Đã triển khai tiếp trên S1/S2: sửa lại ánh xạ hồn ngọc cấp 1–6, mở nhiều viên chọn riêng từng lần; 6 item hồn ngọc trung gian được cấp native qua router chung; mở 8 hộp biểu cảm vĩnh viễn và Xích Viêm Tường Long.
- Các đợt trước đã phục hồi luồng server cho 47 rương native và 150 đan; đợt này thêm 9 item cố định, tổng 206 ID đã khôi phục chức năng server trong danh sách 311 lỗi trực tiếp.
- **Chưa phải toàn bộ item đã sửa xong.** Còn 105 ID fail-closed (102 random, 90021/90022 và option Linh trục của 90151), 2 rương cha bị ảnh hưởng, 5 ID pending và quy đổi Bí bảo trùng chưa có nguồn chuẩn. 830/940 qua fixture cơ bản không đồng nghĩa 830 ID đều đã được nghiệm thu UI hoặc tỷ lệ gốc.
- Bạn tự test trong game; agent không tiếp tục bấm mua/dùng/bán item hoặc đăng nhập QA. Source/test tự động vẫn được kiểm tra, không ghi nhân vật thật.

## 2. Đính chính hồn ngọc

**Hồn ngọc cấp 5 là item `100085`, không phải `100084`.** Nhận định trước rằng `random_gem_05` là cấp 5 đã sai: suffix là phẩm chất, tên/mô tả và item synthetic param xác nhận cấp thực thấp hơn 1. Bản sửa sai `073354` đã được thay bằng bản đúng `074023`, tiếp theo bản fixed-items `074307`.

| Item dùng trong túi | Cấp đúng | Item trung gian cùng cấp | Đầu ra native |
|---:|---:|---:|---|
| 100081 | 1 | 100091 | 25001–25004 |
| 100082 | 2 | 100092 | 25011–25014 |
| 100083 | 3 | 100093 | 25021–25024 |
| 100084 | 4 | 100094 | 25031–25034 |
| 100085 | 5 | 100095 | 25041–25044 |
| 100086 | 6 | 100096 | 25051–25054 |

Item trung gian type 99 dùng trong phần thưởng, không phải thứ cần phát vào túi rồi bấm dùng. Server giờ resolve chúng thành Hồn ngọc native qua các luồng cấp thưởng chung. Bốn loại hiện được chọn đều; chưa có bằng chứng xác suất giống server gốc, không dùng việc ra đủ bốn loại để xác nhận tỷ lệ chính thức.

## 3. Chuẩn bị

1. Đăng nhập lại một lần sau khi server cập nhật. Không cần xóa cache client vì không sửa client trong đợt này.
2. Dùng nhân vật test hoặc số item bạn chấp nhận tiêu. Chụp số lượng túi và số lượng trong hệ tương ứng trước mỗi ca.
3. Bắt đầu với **1 item**. Không bán đồ trong thời gian test. Không mua gói bằng tiền thật chỉ để thử; ưu tiên quà/rương đã có hoặc tài khoản kiểm thử riêng.
4. Mở đủ hệ tương ứng trước khi nghiệm thu UI (Hồn ngọc, Yêu linh, Bí bảo, Thần văn, Linh trục). Nhận đồ và tự mặc/xuất chiến là hai thao tác khác nhau.
5. Nếu trừ item mà không có thưởng đúng, dừng ca đó, ghi giờ + server + ID/tên + số lượng, không spam dùng tiếp.

## 4. Các ca test nên làm theo thứ tự

### A. Hồn ngọc cấp 5 — ưu tiên trước

1. Tìm đúng tên **Hồn ngọc cấp 5 ngẫu nhiên**, ID 100085. Ghi số lượng A trong túi và số Hồn ngọc cấp 5 B đang sở hữu.
2. Dùng 1 cái. Túi còn A−1; hệ Hồn ngọc thêm đúng 1 viên **cấp 5**, thuộc Sinh mệnh/Công/Thủ/Tốc (25041/25042/25043/25044).
3. Đóng/mở lại bảng Hồn ngọc; thử đặt/khảm viên đó vào vị trí phù hợp nếu có ô trống. Không ghi đè bố trí đang dùng nếu không muốn.
4. Nếu đã đạt, dùng nhiều 3 cái trong một lượt. Phải thêm đúng 3 viên, tất cả cấp 5, mỗi viên có định danh riêng. Có thể trùng loại; trùng 3 lần không đủ kết luận RNG lỗi.
5. Đăng xuất/đăng nhập lại; giữ nguyên số lượng và trạng thái khảm. Không yêu cầu đủ 4 loại trong một mẫu nhỏ.
6. Kiểm thêm 100084 phải ra **cấp 4**, 100086 phải ra **cấp 6**. Không chấp nhận tự nâng cấp vì nhìn có lợi hơn.

### B. Rương chọn Yêu linh / Bí bảo / Thần văn / Linh trục

| Nhóm | Item mẫu | Cách thử | Kết quả cần thấy |
|---|---|---|---|
| Yêu linh | 90027 | Chọn một Yêu linh đang chưa sở hữu, mở 1 | Đúng lựa chọn xuất hiện trong Yêu linh, có thể xếp đội khi đủ điều kiện; không chỉ hiện item thân trong túi |
| Bí bảo | 90101 hoặc quà trực tiếp 130601 | Nhận đúng 1 thân chưa sở hữu | Hiện trong Bí bảo, xem được thuộc tính/đặc quyền; relog vẫn sở hữu |
| Thần văn | 90202 | Chọn một loại, mở 1 | Hiện trong hệ Thần văn, có thể đặt vào slot phù hợp |
| Linh trục | 90214 | Chọn một hình, mở 1 | Số lượng hình/cấp đúng tăng 1 trong Linh trục, không nằm sai ở túi thường |

Chỉ kiểm duplicate Yêu linh nếu bạn đồng ý nhận mảnh: cấu hình ElfConfig.piece của ID được chọn dùng làm full-body conversion. Bí bảo đã sở hữu nhận thêm hiện được giữ ở `unconvertedRewardCopies`, **chưa quy đổi chính thức**; không dùng ca Bí bảo trùng làm tiêu chí hoàn thành hoặc thử tiêu số lượng lớn.

### C. Gói nạp, mail và code

- Bốn gói ưu tiên: **11000015 → 130601**, **11000016 → 90027**, **11000017 → 90202**, **11000020 → 90214**.
- Trên tài khoản kiểm thử/nguồn quà đã có: nhận gói → nếu là rương thì mở/chọn → vào đúng hệ và kiểm ownership. Không yêu cầu rương tự mở ngay khi nhận.
- Code/mail chứa item native trực tiếp phải cấp đúng hệ; chứa rương thường thì vào túi chờ dùng. Nhận lại cùng code/mail không được tăng thưởng thêm.
- Gói đặc quyền/thẻ khác cần kiểm cả trạng thái được kích hoạt và mốc claim; không chỉ nhìn record nạp hoặc popup.
- Không reset đơn/code thật, không gửi mã code còn dùng được trong báo lỗi. Chỉ gửi tên gói/payId hoặc item ID và giờ.

### D. Đan EXP và đan bánh bao

1. Dùng 1 đan EXP (ví dụ 110122); trừ đúng 1, EXP/thanh cấp thay đổi theo thưởng và luật lên cấp. Nếu lên cấp, EXP hiện tại có thể reset theo logic game, không chỉ so số EXP trước/sau.
2. Dùng 1 đan bánh bao (ví dụ 110142); trừ đúng 1, bánh bao tăng theo mô tả/cấu hình.
3. Hạn mức cơ bản mỗi nhóm là 10/ngày; bonus thẻ/Bí bảo/áo tắm có thể tăng. Dùng xen kẽ hai ID cùng nhóm phải dùng **chung** hạn mức, không được reset bằng đổi ID.
4. Hết hạn mức: bị từ chối và không trừ đan. Relog không reset; qua ngày server mới reset. Hai nhóm EXP và bánh bao độc lập.

### E. Tám hộp biểu cảm

| ID | Nhóm | Emoji nhận |
|---:|---|---|
| 94702 | Công Tử | 50–59 |
| 94704 | Rắn nhỏ | 60–69 |
| 94707 | Pháp Hải | 70–79 |
| 94712 | Bát Giới | 80–89 |
| 94716 | Chồn Tuyết | 90–99 |
| 94720 | Tiểu mã | 100–109 |
| 94722 | Bà ngoại | 110–119 |
| 94727 | Cửu U Tước | 120–129 |

Dùng **1 hộp mỗi lần**: mở khóa 10 biểu cảm vĩnh viễn, không trừ Nguyên bảo. Vào bảng chọn emoji để xem, không cần gửi chat. Nếu đã có một phần, chỉ thêm phần thiếu. Đã đủ 10 hoặc dùng nhiều hộp một lúc: từ chối, giữ nguyên hộp. Các emoji đã sở hữu phải còn sau relog.

### F. Xích Viêm Tường Long

Dùng 100019 ×1 → hệ Linh sủng/Pet nhận **85401** đúng phẩm chất 5, không rơi vào túi và không biến thành một Yêu linh ngẫu nhiên khác. Khi dùng 2 cái trên nhân vật test, phải có 2 UID riêng. Chỉ bố trí xuất chiến nếu bạn muốn.

### G. Item chưa có dữ liệu chuẩn

Không mua gói có chứa các item này để thử. 100139, 90021/90022, 90151 option Linh trục và các ID trong [danh sách 105 ID](items_remaining_manual_20260905.txt) chưa khôi phục hoàn chỉnh. Nếu kiểm an toàn bằng 1 cái sẵn có: server phải từ chối và giữ item. **Đây không phải ca PASS gameplay**.

## 5. Gửi kết quả lại

```text
Server:
Nhân vật/ID nhân vật:
Giờ thao tác (UTC+7):
Item ID + tên / PayId:
Nguồn: túi / code / mail / gói
Số lượng mở hoặc nhận:
Túi trước → sau:
Hệ sở hữu trước → sau:
Thưởng mong đợi / thực tế:
Sau đăng nhập lại:
Ảnh trước/sau hoặc clip:
```

Không gửi mật khẩu/token/mã code còn hiệu lực. Nếu không biết ID, chụp tên/mô tả item và màn hình nguồn nhận.

## 6. Việc agent chưa tự làm

- Không kiểm bằng cách dùng/bán item trên nhân vật nicky; không sửa đăng nhập/client vì bạn xác nhận game chạy được.
- Không chuyển/bù dữ liệu 2 người / 5 bản sao khi preview chưa được duyệt.
- Không tự dựng pool cho 105 item còn thiếu. Cần bảng thưởng/tỷ lệ/option gốc; nếu chủ game muốn thiết kế khác thì phải chốt giá trị/phân bố riêng trước khi implement.
