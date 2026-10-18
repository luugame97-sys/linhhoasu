# Kiểm tra toàn bộ danh mục item và rà sâu rương — 05/09/2026

Thời điểm xác minh production: 2026-09-05T06:00:46.856061+00:00. Chỉ đọc source/config và tồn kho; không deploy, không restart, không phát quà, không ghi MongoDB.

## 1. Kết luận và phạm vi

- Quét cấu hình **7.951 item** trong AssetsConfig; chạy **940 mục AssetsUseConfig / 2.439 case**, gồm từng lựa chọn của rương chọn.
- **311 ID lỗi trực tiếp cần fix**: 263 ID đang bị chặn và **48 ID vẫn trừ rương nhưng thưởng bị lưu sai/chưa resolve**.
- **2 ID bị ảnh hưởng gián tiếp** vì một lựa chọn phát ra rương đang bị khóa. Tổng danh sách cần xử lý trực tiếp/gián tiếp: **313 ID**.
- **5 ID chờ kiểm tra riêng**; **622 ID còn lại mới qua tiêu chí fixture cơ bản**, không khẳng định mọi pool, tỷ lệ, duplicate, quyền mở và native UI đều đúng.
- 7.020 asset không khai báo useType được rà cấu hình, không ép gọi tag 1300 vì nhiều loại phải dùng trong hệ riêng. Có 5 asset không khai báo useType nhưng vẫn có AssetsUseConfig (94821–94825); thêm 4 use row không có AssetsConfig (94355–94358). Vì vậy không được cộng đơn giản 7.020 + 940 thành tổng catalog.
- Không có item khai báo useType mà thiếu AssetsUseConfig; mọi reward id/count trong AssetsUseConfig đều có tham chiếu và số lượng hợp lệ theo kiểm tra tĩnh.

| Nhóm | ID | Hành vi đã quan sát |
|---|---:|---|
| Yêu linh / Bí bảo / Thần văn / Linh trục | 47 | 474 case trừ rương, có dòng reward nhưng không cập nhật ownership native |
| Rương 90151 | 1 | Option index 1 trả vật phẩm ảo 100721 ×2, không sinh Linh trục |
| Rương random thiếu pool chuẩn | 111 | Từ chối, không trừ item |
| Rương tự chọn thiếu option | 2 | 90021/90022 không có lựa chọn |
| Đan type 103 có reward | 150 | Tạm chặn, không trừ đan |
| Ảnh hưởng dây chuyền | 2 | 93065 / 100803 phát ra rương bị khóa |
| Chờ native/config nguồn | 5 | 227 và 94355–94358 |

## 2. Vì sao báo cáo cũ bỏ sót 48 ID?

Fixture cũ xem result=0 và rewardInfo có dòng là đạt. Điều này chưa đúng: các ID thân Yêu linh/Bí bảo/Thần văn/Linh trục bị rơi qua RewardGrantService thành item túi. Việc tăng items không thay cho elfData/curiosData/orbInfo/connect. Audit này kiểm tra cả loại đầu ra và collection tương ứng.

| Rương / lựa chọn | Đầu ra thực tế | State native |
|---|---|---|
| 90026, index 0 | items[154101] +1, trừ 1 rương | elfInfo.elfData không tăng |
| 90101, index 0 | items[131301] +1, trừ 1 rương | curiosInfo.curiosData không tăng |
| 90201, index 0 | items[9101] +1, trừ 1 rương | artifactInfo.orbInfo không tăng |
| 90211, index 0 | items[200101] +1, trừ 1 rương | valhallaFormationInfo.connect không tăng |
| 90151, index 1 | items[100721] +2, trừ 1 rương | Không resolve random_connect_01; 100721 không có use config |

Đối chiếu source: item.js:addRewardRowsToPlayer/handleUseItem; RewardGrantService.js:getRewardKind/grantRewardRow; native handlers elf.js:handleElfSummon, curios.js:applyCuriosSummonRewardRows, artifact.js:handleArtifactOrbSummon và valhalla-formation.js:handleValhallaFormationSet. Đây là lỗi server ở handler/config được tái hiện trên source production; chưa thao tác UI hoặc lưu/relog một nhân vật thật trong phiên này.

## 3. Danh sách đầy đủ 311 ID lỗi trực tiếp

Có thể tìm bằng Ctrl+F theo ID/tên. Bản TXT: [items_need_fix_deep_20260905.txt](items_need_fix_deep_20260905.txt).

### P0 — Rương Yêu linh phát sai nơi lưu (3 ID)

Trừ rương, cộng ID Yêu linh vào items nhưng elfInfo.elfData không tăng.

Cần fix: Grant Yêu linh native đúng ID; xử lý trùng thành mảnh và đồng bộ client theo contract.

| ID | Tên trong client | UseType |
|---:|---|---:|
| 90026 | Tự chọn tinh linh hiếm | 101 |
| 90027 | Tự chọn yêu linh Sử Thi | 101 |
| 90028 | Tự chọn yêu linh truyền thuyết | 101 |

### P0 — Rương Bí bảo phát sai nơi lưu (32 ID)

Trừ rương, cộng ID thân Bí bảo vào items nhưng curiosInfo.curiosData không tăng.

Cần fix: Phát thân Bí bảo vào collection native; phân biệt thân và mảnh, xử lý sở hữu sẵn.

| ID | Tên trong client | UseType |
|---:|---|---:|
| 90101 | Bí bảo Đồng Tinh xảo tự chọn | 101 |
| 90102 | Tự chọn bí bảo đồng hiếm | 101 |
| 90103 | Tự chọn bí bảo đồng Sử Thi | 101 |
| 90104 | Bí bảo truyền thuyết tự chọn | 101 |
| 90111 | Tự chọn Bí Bảo hải trân Tinh xảo | 101 |
| 90112 | Tự chọn bí bảo hải trân hiếm | 101 |
| 90113 | Bí bảo trân hải Sử Thi tự chọn | 101 |
| 90131 | Bí bảo ngọc thạch Tinh xảo tự chọn | 101 |
| 90132 | Bí bảo ngọc thạch hiếm tự chọn | 101 |
| 90133 | Bí bảo ngọc thạch Sử Thi tự chọn | 101 |
| 90141 | Tự chọn bí bảo sứ tinh xảo | 101 |
| 90142 | Tự chọn bí bảo sứ hiếm | 101 |
| 90143 | Tự chọn bí bảo sứ Sử Thi | 101 |
| 94203 | Hộp chọn tự do diều giấy bí bảo | 101 |
| 94204 | Hộp chọn tự do diều giấy bí bảo | 101 |
| 94302 | Hộp chọn tự do báu vật Thiên Cơ | 101 |
| 94303 | Hộp chọn tự do báu vật Thiên Cơ | 101 |
| 94901 | Tự chọn Long Châu Tứ Hải | 101 |
| 94906 | Tự chọn bảo khí Thần Nông | 101 |
| 94910 | Tự chọn tiên thảo linh thực | 101 |
| 94913 | Tự chọn mài giũa 4 cụ | 101 |
| 94915 | Tự chọn Lò Hỏa Trân Bảo · 1 | 101 |
| 94916 | Tự chọn lò lửa trân bảo·2 | 101 |
| 94917 | Trân bảo lò lửa tự chọn·3 | 101 |
| 94918 | Tự chọn lò lửa trân bảo · Tứ | 101 |
| 94925 | Tự chọn bắt 4 con | 101 |
| 94928 | Tự chọn đạo luyện tứ cụ | 101 |
| 94931 | Tự chọn 4 cụm thiền luyện | 101 |
| 94934 | Tự chọn 4 cụm bếp luyện | 101 |
| 94937 | Tự chọn đan luyện bốn cụ | 101 |
| 94940 | Tự chọn 4 cụm làm cỏ | 101 |
| 94943 | Tự chọn 4 món phong nẫm | 101 |

### P0 — Rương Thần văn phát sai nơi lưu (3 ID)

Trừ rương, cộng ID Thần văn vào items nhưng artifactInfo.orbInfo không nhận.

Cần fix: Grant Orb native đúng id/count/subCount, đồng bộ theo handler client thực tế.

| ID | Tên trong client | UseType |
|---:|---|---:|
| 90201 | Tự chọn thần văn Hiếm | 101 |
| 90202 | Tự chọn Sử Thi thần văn | 101 |
| 90203 | Tự chọn Thần văn Truyền Thuyết | 101 |

### P0 — Rương Linh trục phát sai nơi lưu (9 ID)

Trừ rương, cộng ID Linh trục vào items nhưng valhallaFormationInfo.connect không tăng.

Cần fix: Cộng connect native đúng cấp/hình/số lượng và sync; không phát vào túi thường.

| ID | Tên trong client | UseType |
|---:|---|---:|
| 90211 | Tự chọn linh trục cấp 1 | 101 |
| 90212 | Tự chọn linh trục cấp 2 | 101 |
| 90213 | Tự chọn linh trục cấp 3 | 101 |
| 90214 | Tự chọn linh trục cấp 4 | 101 |
| 90215 | Tự chọn Cấp 5 linh trục | 101 |
| 90216 | Tự chọn Cấp 6 linh trục | 101 |
| 90217 | Linh trục cấp 7 tự chọn | 101 |
| 90218 | Tự chọn 8 cấp Linh Xu | 101 |
| 90219 | Linh Sơ cấp 9 tự chọn | 101 |

### P0 — Rương trả vật phẩm trung gian chưa xử lý (1 ID)

90151 chọn option index 1 trả 100721 ×2 (type 99, random_connect_01), không sinh Linh trục.

Cần fix: Resolve 100721 bằng pool Linh trục cấp 1 có nguồn chuẩn; chưa có pool thì từ chối trước consume.

| ID | Tên trong client | UseType |
|---:|---|---:|
| 90151 | Tự chọn hồn ngọc linh trục | 101 |

### P1 — Rương ngẫu nhiên đang bị chặn (111 ID)

Server từ chối trước consume vì chưa có pool được xác minh.

Cần fix: Khôi phục bảng thưởng, tỷ lệ, số lượng, duplicate conversion từ nguồn chuẩn; không đoán theo tên/icon.

| ID | Tên trong client | UseType |
|---:|---|---:|
| 412 | Hộp quà tuyển chọn Tuyết Bảo | 102 |
| 413 | Hộp quà tuyển chọn Tuyết Bảo | 102 |
| 94301 | Túi Phúc Thiên Cơ | 102 |
| 94401 | Cẩm nang Nghê Thường | 102 |
| 94416 | Túi Phúc Trăng tròn | 102 |
| 94418 | Hộp quà phá kén·Nguyên Bảo | 102 |
| 94419 | Hộp quà phá kén·Đùi Gà | 102 |
| 94420 | Hộp quà Phá Kiển · Phù Tốc Độ | 102 |
| 94421 | Hộp quà Phá Kén · Baozi | 102 |
| 94422 | Hộp quà Phá Kién - Tiền bạc | 102 |
| 94515 | Dịch Lôi kiếp song phẩm ngẫu nhiên | 102 |
| 94701 | Túi phúc Thu Ý Nồng | 102 |
| 94702 | Biểu cảm Công Tử | 102 |
| 94703 | Túi phúc Nguyên Tuế mãn | 102 |
| 94704 | Biểu cảm rắn nhỏ | 102 |
| 94705 | Túi Phúc Chúc Xuân | 102 |
| 94706 | Túi Phúc Hoa Mệnh | 102 |
| 94707 | Biểu cảm Pháp Hải | 102 |
| 94708 | Chăm chỉ luyện túi phúc | 102 |
| 94709 | Thiên Diễn Bảo Sảo | 102 |
| 94711 | Tông tình gia lễ | 102 |
| 94712 | Biểu cảm Bát Giới | 102 |
| 94713 | Hộp quà kỷ niệm | 102 |
| 94715 | Hộp quà Thu Ái | 102 |
| 94716 | Biểu cảm Chồn Tuyết | 102 |
| 94718 | Khánh lễ Nguyên Chính | 102 |
| 94719 | Huyền Cơ Bảo Sao | 102 |
| 94720 | Biểu cảm tiểu mã | 102 |
| 94721 | Đại lễ năm mới | 102 |
| 94722 | Biểu cảm Bà ngoại | 102 |
| 94724 | Quà ấm Thanh Dương | 102 |
| 94725 | Bạc Tố Ngân Bảo Sào | 102 |
| 94726 | Mộc Lan đoan lễ | 102 |
| 94727 | Biểu cảm Cửu U Tước | 102 |
| 94729 | Hộp quà kỷ niệm 2 năm | 102 |
| 94801 | Rương quyết đấu Bang hội | 102 |
| 94802 | Hộp Khởi Nguyên Thần Văn | 102 |
| 94821 | Kho báu Vùng biển tham lam | 102 |
| 94822 | Kho báu Nộ Hải hải vực | 102 |
| 94823 | Kho báu vùng biển Trí Vọng | 102 |
| 94824 | Kho báu hải vực ngạo mạn | 102 |
| 94825 | Kho báu vùng biển Nghi Cụ | 102 |
| 94902 | Mảnh Long Châu ngẫu nhiên | 102 |
| 94904 | Mảnh Thần Nông ngẫu nhiên | 102 |
| 94908 | Mảnh tiên thực ngẫu nhiên | 102 |
| 94911 | Mảnh mài ngẫu nhiên | 102 |
| 94923 | Mảnh bắt ngẫu nhiên | 102 |
| 94926 | Mảnh luyện đạo ngẫu nhiên | 102 |
| 94929 | Mảnh Thiền luyện ngẫu nhiên | 102 |
| 94932 | Mảnh tu luyện bếp ngẫu nhiên | 102 |
| 94935 | Mảnh đan luyện ngẫu nhiên | 102 |
| 94938 | Ngẫu nhiên nhận mảnh cỏ | 102 |
| 94941 | Mảnh phong thình ngẫu nhiên | 102 |
| 100019 | Xích Viêm Tường Long | 102 |
| 100020 | Mảnh yêu linh ngẫu nhiên | 102 |
| 100021 | Mảnh yêu linh ưu tú | 102 |
| 100022 | Mảnh tinh linh Tinh xảo | 102 |
| 100023 | Mảnh yêu tinh Hiếm | 102 |
| 100024 | Mảnh tinh linh Sử Thi | 102 |
| 100025 | Mảnh yêu linh Truyền Thuyết | 102 |
| 100026 | Mảnh Yêu linh cao cấp ngẫu nhiên | 102 |
| 100030 | Yêu linh ngẫu nhiên | 102 |
| 100031 | Yêu linh Ưu tú ngẫu nhiên | 102 |
| 100032 | Ngẫu nhiên Tinh linh tinh xảo | 102 |
| 100033 | Yêu linh hiếm ngẫu nhiên | 102 |
| 100034 | Yêu linh sử thi ngẫu nhiên | 102 |
| 100035 | Yêu linh Truyền Thuyết ngẫu nhiên | 102 |
| 100036 | Yêu linh cao cấp ngẫu nhiên | 102 |
| 100040 | Thần binh ngẫu nhiên | 102 |
| 100060 | Thần binh đồng hành ngẫu nhiên | 102 |
| 100061 | Thần binh đồng hành hiếm ngẫu nhiên | 102 |
| 100062 | Thần binh đồng hành Sử Thi ngẫu nhiên | 102 |
| 100063 | Ngẫu nhiên Thần binh đồng hành Truyền Thuyết | 102 |
| 100139 | Mảnh huyết mạch ngẫu nhiên | 102 |
| 100160 | Mảnh bí bảo ngẫu nhiên | 102 |
| 100170 | Bí bảo Đồng ngẫu nhiên | 102 |
| 100171 | Mảnh bí bảo đồng tinh xảo ngẫu nhiên | 102 |
| 100172 | Bí bảo đồng hiếm ngẫu nhiên | 102 |
| 100173 | Bí bảo Đồng Sử Thi ngẫu nhiên | 102 |
| 100174 | Bí bảo Truyền Thuyết ngẫu nhiên | 102 |
| 100185 | Mảnh bí bảo Đồng ngẫu nhiên | 102 |
| 100190 | Mảnh bí bảo hải trân ngẫu nhiên | 102 |
| 100200 | Bí bảo hải trân ngẫu nhiên | 102 |
| 100201 | Bí bảo hải trân phẩm chất Hiếm ngẫu nhiên | 102 |
| 100202 | Bí bảo hải trân quý hiếm ngẫu nhiên | 102 |
| 100203 | Bí bảo hải trân sử thi ngẫu nhiên | 102 |
| 100230 | Bí bảo ngẫu nhiên | 102 |
| 100231 | Bí bảo tinh xảo ngẫu nhiên | 102 |
| 100232 | Bí bảo hiếm ngẫu nhiên | 102 |
| 100233 | Bí bảo Sử Thi ngẫu nhiên | 102 |
| 100250 | Bí bảo ngẫu nhiên | 102 |
| 100251 | Bí bảo tinh xảo ngẫu nhiên | 102 |
| 100252 | Bí bảo hiếm ngẫu nhiên | 102 |
| 100253 | Bí bảo Sử Thi ngẫu nhiên | 102 |
| 100501 | Thần văn Hiếm ngẫu nhiên | 102 |
| 100502 | Thần văn Sử Thi ngẫu nhiên | 102 |
| 100503 | Ngẫu nhiên Thần văn Truyền Thuyết | 102 |
| 100641 | Tài nguyên ngẫu nhiên 30 phút | 102 |
| 100642 | Tài nguyên ngẫu nhiên 2 giờ | 102 |
| 100643 | 8 giờ tài nguyên ngẫu nhiên | 102 |
| 100701 | Ngẫu nhiên 1 cấp Linh Trục | 102 |
| 100702 | Tinh trục cấp 2 ngẫu nhiên | 102 |
| 100703 | Trục linh cấp 3 ngẫu nhiên | 102 |
| 100704 | Linh Xu cấp 4 ngẫu nhiên | 102 |
| 100705 | Tinh linh 5 cấp ngẫu nhiên | 102 |
| 100706 | Linh trục cấp 6 ngẫu nhiên | 102 |
| 100707 | Linh trục cấp 7 ngẫu nhiên | 102 |
| 100708 | Linh trục 8 cấp ngẫu nhiên | 102 |
| 100709 | Ngẫu nhiên linh trục cấp 9 | 102 |
| 101000 | Rương tiêu diệt Yêu Tôn tầng 1 | 102 |
| 101310 | Cẩm nang phòng thủ tranh phong | 102 |

### P1 — Rương tự chọn thiếu lựa chọn (2 ID)

AssetsUseConfig.rewards rỗng; rương không mở được, không bị trừ.

Cần fix: Cần option/catalog gốc đúng chất lượng; không tự nâng phẩm chất để lấp dữ liệu.

| ID | Tên trong client | UseType |
|---:|---|---:|
| 90021 | Tự chọn Mảnh tinh linh Ưu tú | 101 |
| 90022 | Tự chọn Mảnh yêu tinh tinh xảo | 101 |

### P2 — Đan thưởng tức thời đang bị chặn (150 ID)

Chặn để tránh mất đan trong khi contract thưởng, hạn mức chung/ngày chưa hoàn chỉnh.

Cần fix: Hoàn thiện reward thực, cap -802/-804, đặc quyền, reset ngày và đồng bộ login/relog trước bỏ chặn.

| ID | Tên trong client | UseType |
|---:|---|---:|
| 110122 | Bậc 1 phẩm xanh tu vi đan | 103 |
| 110123 | Đan tu vi phẩm xanh bậc 1 | 103 |
| 110124 | Đan dược tu vi phẩm Tím bậc 1 | 103 |
| 110126 | Bậc 1 phẩm cam tu vi đan | 103 |
| 110127 | Đan tu vi phẩm đỏ Bậc 1 | 103 |
| 110142 | Bậc 1 phẩm xanh Tịch Cốc Đan | 103 |
| 110143 | Bậc 1 phẩm xanh Tịch Cốc Đan | 103 |
| 110144 | Đan tịch cốc phẩm tím bậc 1 | 103 |
| 110146 | Bức cốc đan phẩm cam bậc 1 | 103 |
| 110147 | Đan dược Tích Cốc phẩm đỏ bậc 1 | 103 |
| 110222 | Tu vi đan phẩm xanh bậc 2 | 103 |
| 110223 | Đan tu vi phẩm xanh bậc 2 | 103 |
| 110224 | Đan dược tu vi Phẩm Tím Bậc 2 | 103 |
| 110226 | Đan dược tu vi phẩm cam bậc 2 | 103 |
| 110227 | Đan tu vi phẩm đỏ bậc 2 | 103 |
| 110242 | Bậc 2 phẩm xanh đan Tịch Cốc | 103 |
| 110243 | Tịch Cốc đan Phẩm xanh Bậc 2 | 103 |
| 110244 | Bậc 2 Phẩm Tím Tịch Cốc Đan | 103 |
| 110246 | Phẩm cam Trúc Cơ Đan bậc 2 | 103 |
| 110247 | Bậc 2 phẩm Đỏ Tịch Cốc Đan | 103 |
| 110322 | Đan tu vi 3 cấp Phẩm xanh | 103 |
| 110323 | bậc 3 phẩm xanh linh đan tu vi | 103 |
| 110324 | Đan tu vi phẩm tím Bậc 3 | 103 |
| 110326 | Đan dược tu vi phẩm cam bậc 3 | 103 |
| 110327 | Đan dược tu vi phẩm Đỏ Bậc 3 | 103 |
| 110342 | Đan Tịch Cốc phẩm xanh bậc 3 | 103 |
| 110343 | Đan Tịch Cốc phẩm xanh Bậc 3 | 103 |
| 110344 | Đan Tịch Cốc Phẩm Tím Bậc 3 | 103 |
| 110346 | Đan dược Tích Cốc phẩm cam bậc 3 | 103 |
| 110347 | Đan Tịch Cốc phẩm Đỏ bậc 3 | 103 |
| 110422 | Tu vi đan Phẩm xanh Bậc 4 | 103 |
| 110423 | Đan tu vi Luyện khí phẩm xanh Bậc 4 | 103 |
| 110424 | Đan tu vi phẩm Tím bậc 4 | 103 |
| 110426 | Đan tu vi phẩm Cam bậc 4 | 103 |
| 110427 | Đan tu vi phẩm Đỏ 4 bậc | 103 |
| 110442 | Bậc 4 Phẩm xanh Tịch Cốc đan | 103 |
| 110443 | Tịch Cốc Đan phẩm xanh bậc 4 | 103 |
| 110444 | Bịch Tịch Cốc phẩm Tím bậc 4 | 103 |
| 110446 | Phẩm cam Bậc 4 Tịch Cốc Đan | 103 |
| 110447 | Đan dược Tích Cốc phẩm đỏ bậc 4 | 103 |
| 110522 | Đan tu vi phẩm xanh 5 bậc | 103 |
| 110523 | Đan tu vi phẩm xanh bậc 5 | 103 |
| 110524 | 5 bậc Phẩm Tím tu vi đan | 103 |
| 110526 | Đan dược tu vi phẩm cam Bậc 5 | 103 |
| 110527 | Đan dược tu vi phẩm Đỏ 5 bậc | 103 |
| 110542 | Tịch Cốc đan 5 bậc phẩm xanh | 103 |
| 110543 | Bạch Dương Phẩm xanh 5 Bậc Tịch Cốc Đan | 103 |
| 110544 | Tịch Cốc đan phẩm tím 5 bậc | 103 |
| 110546 | Đan Tịch Cốc phẩm cam bậc 5 | 103 |
| 110547 | Đan Tịch Cốc phẩm Đỏ 5 bậc | 103 |
| 110622 | Đan dược tu vi phẩm xanh Bậc 6 | 103 |
| 110623 | Đan tu vi Phẩm xanh bậc 6 | 103 |
| 110624 | Tu vi đan phẩm tím bậc 6 | 103 |
| 110626 | Phẩm cam tu vi đan Bậc 6 | 103 |
| 110627 | Bậc 6 phẩm Đỏ linh đan tu vi | 103 |
| 110642 | Bậc 6 phẩm xanh Tịch Cốc Đan | 103 |
| 110643 | Bậc 6 Phẩm xanh Tịch Cốc đan | 103 |
| 110644 | Linh đan diệu dược Tịch Cốc phẩm tím Bậc 6 | 103 |
| 110646 | Đan Tịch Cốc Phẩm Cam Bậc 6 | 103 |
| 110647 | Bịch Cốc Đan phẩm Đỏ bậc 6 | 103 |
| 110722 | Đan tu vi bậc 7 phẩm xanh | 103 |
| 110723 | Đan dược tu vi phẩm lam cấp 7 | 103 |
| 110724 | Đan dược tu vi phẩm Tím bậc 7 | 103 |
| 110726 | Đan tu vi bậc 7 phẩm cam | 103 |
| 110727 | Đan tu vi phẩm Đỏ bậc 7 | 103 |
| 110742 | Tịch Cốc đan bậc 7 phẩm xanh | 103 |
| 110743 | Tịch Cốc Đan phẩm xanh bậc 7 | 103 |
| 110744 | Đan Tịch Cốc Phẩm Tím bậc 7 | 103 |
| 110746 | 7 cấp Phẩm cam Tịch Cốc đan | 103 |
| 110747 | bậc 7 phẩm Đỏ Tịch Cốc Đan | 103 |
| 110822 | Đan dược tu vi bậc 8 Phẩm xanh | 103 |
| 110823 | Bậc 8 phẩm xanh tu vi đan | 103 |
| 110824 | Đan tu vi phẩm Tím bậc 8 | 103 |
| 110826 | Đan tu vi phẩm cam bậc 8 | 103 |
| 110827 | Đan tu vi phẩm Đỏ bậc 8 | 103 |
| 110842 | Đan dược Tịch Cốc bậc 8 phẩm xanh | 103 |
| 110843 | Tịch Cốc Đan phẩm xanh bậc 8 | 103 |
| 110844 | Bậc 8 Phẩm Tím Tịch Cốc Đan | 103 |
| 110846 | Đan Tịch Cốc phẩm cam bậc 8 | 103 |
| 110847 | bậc 8 phẩm Đỏ Tịch Cốc đan | 103 |
| 110922 | Đan dược tu vi phẩm xanh bậc 9 | 103 |
| 110923 | Đan tu vi phẩm xanh bậc 9 | 103 |
| 110924 | 9 bậc Phẩm Tím tu vi đan | 103 |
| 110926 | Tu vi đan Phẩm cam bậc 9 | 103 |
| 110927 | Đan tu vi phẩm Đỏ bậc 9 | 103 |
| 110942 | Đan Tịch Cốc bậc 9 Phẩm xanh | 103 |
| 110943 | bậc 9 Phẩm xanh Tịch Cốc Đan | 103 |
| 110944 | 9 bậc Phẩm Tím linh đan tịch cốc | 103 |
| 110946 | Đan Pịch Cốc phẩm cam bậc 9 | 103 |
| 110947 | Đan Tích Cốc phẩm đỏ bậc 9 | 103 |
| 111022 | Cấp 10 Phẩm xanh Đan tu vi | 103 |
| 111023 | Đan dược tu vi phẩm xanh bậc 10 | 103 |
| 111024 | Đan tu vi Phẩm Tím Bậc 10 | 103 |
| 111026 | Đan tu vi phẩm cam Cấp 10 | 103 |
| 111027 | Đan tu vi phẩm Đỏ Bậc 10 | 103 |
| 111042 | Bậc 10 linh đan tịch cổ phẩm xanh | 103 |
| 111043 | Bậc 10 Phẩm xanh Tịch Cốc đan | 103 |
| 111044 | Đan Tịch Cốc phẩm Tím bậc 10 | 103 |
| 111046 | Đan Tịch Cốc phẩm Cam bậc 10 | 103 |
| 111047 | Bậc 10 phẩm Đỏ Tịch Cốc đan | 103 |
| 111122 | Tu vi đan phẩm xanh Bậc 11 | 103 |
| 111123 | Tu vi đan phẩm xanh bậc 11 | 103 |
| 111124 | Đan tu vi Phẩm Tím bậc 11 | 103 |
| 111126 | Đan dược tu vi Phẩm cam Bậc 11 | 103 |
| 111127 | Đan tu vi phẩm Đỏ Bậc 11 | 103 |
| 111142 | Bậc 11 phẩm xanh Tịch Cốc Đan | 103 |
| 111143 | Đan Tịch Cốc phẩm xanh Bậc 11 | 103 |
| 111144 | 11BậcPhẩm TímTịch CốcĐan | 103 |
| 111146 | Bậc 11 phẩm cam tích cốc đan | 103 |
| 111147 | Tịch Cốc đan phẩm Đỏ bậc 11 | 103 |
| 111222 | Tu vi đan Bậc 12 phẩm xanh | 103 |
| 111223 | Đan tu vi phẩm xanh Bậc 12 | 103 |
| 111224 | Đan dược tu vi phẩm tím bậc 12 | 103 |
| 111226 | Đan Tu Vi, Phẩm Cam, Bậc 12 | 103 |
| 111227 | Tu vi đan phẩm Đỏ Bậc 12 | 103 |
| 111242 | Đan Tịch Cốc phẩm xanh Bậc 12 | 103 |
| 111243 | Linh đan Tịch Cốc phẩm xanh Bậc 12 | 103 |
| 111244 | Đan Tịch Cốc phẩm tím Bậc 12 | 103 |
| 111246 | Bậc 12 phẩm cam Tịch Cốc Đan | 103 |
| 111247 | Đan Dược Tịch Cốc phẩm Đỏ Bậc 12 | 103 |
| 111322 | Đan tu vi phẩm xanh bậc 13 | 103 |
| 111323 | Đan tu vi phẩm xanh Bậc 13 | 103 |
| 111324 | Đan tu vi Phẩm Tím bậc 13 | 103 |
| 111326 | Đan phương tu vi Phẩm cam Bậc 13 | 103 |
| 111327 | Tu vi đan phẩm Đỏ 13 bậc | 103 |
| 111342 | Đan Tịch Cốc phẩm xanh Bậc 13 | 103 |
| 111343 | Đan Tịch Cốc phẩm xanh 13 bậc | 103 |
| 111344 | 13 bậc Phẩm Tím Tịch Cốc Đan | 103 |
| 111346 | Đan tịch cốc phẩm cam 13 bậc | 103 |
| 111347 | Đan Pịch Cốc phẩm Đỏ cấp 13 | 103 |
| 111422 | Đan tu vi phẩm lục bậc 14 | 103 |
| 111423 | Đan tu vi phẩm xanh Bậc 14 | 103 |
| 111424 | Đan tu vi Phẩm Tím bậc 14 | 103 |
| 111426 | Tu vi đan phẩm cam Bậc 14 | 103 |
| 111427 | Đan tu vi phẩm Đỏ Bậc 14 | 103 |
| 111442 | Bậc 14 Phẩm xanh Tịch Cốc Đan | 103 |
| 111443 | Đan dược Tịch Cốc phẩm xanh bậc 14 | 103 |
| 111444 | Đan dược Tịch Cốc phẩm tím 14 bậc | 103 |
| 111446 | Tịch Cốc Đan phẩm cam bậc 14 | 103 |
| 111447 | Bậc 14 phẩm Đỏ Tịch Cốc Đan | 103 |
| 111522 | Tu vi đan phẩm xanh Bậc 15 | 103 |
| 111523 | Đan tu vi phẩm xanh bậc 15 | 103 |
| 111524 | Đan tu vi phẩm tím bậc 15 | 103 |
| 111526 | Đan tu vi phẩm cam Bậc 15 | 103 |
| 111527 | Bậc 15 đan dược tu vi phẩm Đỏ | 103 |
| 111542 | Đan tịch cốc 15 bậc phẩm xanh | 103 |
| 111543 | Bậc 15 Tịch Cốc Dan Phẩm Xanh | 103 |
| 111544 | Bậc 15 Phẩm Tím Tịch Cốc đan | 103 |
| 111546 | Đan Phục Cốc 15 cấp Phẩm cam | 103 |
| 111547 | Đan Tịch Cốc phẩm Đỏ bậc 15 | 103 |

## 4. Hai rương bị ảnh hưởng gián tiếp

| ID | Tên | Lựa chọn lỗi dây chuyền | Xử lý |
|---:|---|---|---|
| 93065 | Hộp quà Tự chọn tọa kỵ | Index 13 → 94719 ×1; 94719 đang bị chặn | Fix pool 94719 rồi test lại; không kết luận mọi lựa chọn của 93065 đều hỏng |
| 100803 | Hộp quà mê hạm | Index 2 → 94709 ×3; 94709 đang bị chặn | Fix pool 94709 rồi test lại |

## 5. Chờ xác minh, không trộn vào 311 lỗi trực tiếp

| ID | Hiện trạng |
|---:|---|
| 227 | Chỉ đoản tình trường; useType 108, flow client riêng, không kết luận lỗi từ tag 1300 |
| 94355 / 94356 / 94357 / 94358 | Có AssetsUseConfig nhưng không có AssetsConfig, chưa biết có được phát thực tế hay là cấu hình dư |

- 94821–94825 đã nằm trong 111 rương bị chặn. Đồng thời AssetsConfig không khai báo useType/ẩn hiển thị; cần xác nhận luồng kho báu câu cá, không tự bật useType.
- Tra cứu trong file ngôn ngữ cho thấy 569 ID thiếu chuỗi tên, 2.866 ID thiếu chuỗi mô tả. Đây chỉ là cảnh báo lookup/cấu hình có cả asset ẩn; chưa chứng minh từng ID bị lỗi hiển thị trên client, không cộng vào lỗi mở rương.
- Chưa audit E2E mọi hệ tiêu nguyên liệu, trang bị, ngoại quan, limit/conditions, mua/bán, expiry, concurrent/retry/save-failure. Danh sách là lỗi đã chứng minh trong phạm vi trên, không phải bảo đảm các ID ngoài danh sách hoàn toàn tốt.

## 6. Tồn kho hiện tại và thứ tự nên sửa

Read-only MongoDB lúc 2026-09-05T06:00:45.814Z; scope 313 ID.

| Server | Người thật được đọc | Người giữ ID trong danh sách | Item đang giữ |
|---|---:|---:|---|
| lhs_s1001 | 621 | 4 | 90027 ×1; 90202 ×1; 90214 ×1; 100139 ×823 |
| lhs_s1002 | 1 | 0 | Không thấy |

- Không thấy attachment mail chưa nhận hoặc GiftCode active chứa 313 ID trong các collection được kiểm tra.
- Tồn kho không chứng minh lịch sử đã mất quà. Không bù/thu hồi tự động nếu thiếu ledger giao dịch.
1. Ưu tiên 90027, 90202, 90214 đang có trên người thật và vẫn tiêu rương; sửa chung router cho 47 ID native cùng 90151.
2. Khôi phục 100139 vì 3 người giữ tổng 823 cái; sau đó 110 rương bị chặn còn lại. 100139 là mảnh huyết mạch, không tự đổi thành nguyên thân.
3. Sửa contract 150 đan, bổ sung option gốc 90021/90022; test 93065/100803 sau khi rương con chạy đúng.
4. Mỗi nhóm: đúng ID/count/quality/level; đã sở hữu; mở nhiều; selection sai; retry; lỗi save; relog; native client. Chỉ bỏ chặn sau khi đạt contract.

## 7. Bằng chứng và giới hạn

- Fixture được chạy trực tiếp với source/config production trong tiến trình riêng qua SSH stdin; savePlayer/savePlayerDeferred chỉ ghi vào object fixture, không kết nối DB. Các filesystem write API bị chặn; không upload script lên VPS.
- Manifest 142 file source/package và 2 config kiểm trước/sau không đổi. Local khác production ở 49 file và base config; kết luận cuối dùng production, không dùng local để thay thế.
- Contract safe-release local chạy lại PASS: 42 option P0, 42 random hỗ trợ, 111 random bị chặn, 150 đan giữ nguyên. Đây chỉ là hồi quy bản thu hẹp, không phủ nhận 48 lỗi vừa phát hiện.
- Source game, client, tài khoản/người chơi và dịch vụ không chỉnh sửa; chỉ thêm tool, evidence và báo cáo dưới _ai_workbench.

| Artifact | SHA-256 |
|---|---|
| temp/items_recheck_production_fixture_20260905.json | fc938ab5e4fe11e5c2a46845cff3ab5f85b5a683a745003d42e907af4d185fba |
| temp/item_catalog_production_recheck_20260905.json | e4e925f34761920eac05abc4b944305b5ea7c635275ca14f623906548ccce796 |
| temp/items_recheck_live_20260905.json | 5d464baf6ab992ec06a0d894410f041a26f2371f3d1264da668b077f6160d6ca |

## 8. Nhật ký lỗi và chống lặp

| Lỗi/phát hiện | Nguyên nhân | Xử lý trong phiên audit | Cách tránh lặp |
|---|---|---|---|
| Fixture xanh giả cho reward native | Chỉ kiểm có dòng reward, không kiểm collection | Phân loại lại 47 ID và 1 ID synthetic | Assert đúng nơi sở hữu, output contract và duplicate |
| Local khác production | Cây source/config chưa đồng nhất | Đọc manifest, chạy fixture trên production | Gắn mọi kết luận với hash/time/scope |
| Quét JS minify trả output quá lớn | Một dòng chứa cả bundle | Không dùng kết quả bị cắt để kết luận | Giới hạn match/substrings hoặc parser, không in cả dòng minify |
| Mongoose cảnh báo isNew | Tên field model trùng thuộc tính reserved | Ghi nhận; không sửa model ngoài scope | Tách task model và migration nếu cần |
| HTML session cũ thiếu cập nhật cuối | Markdown mới hơn HTML | Render lại đầy đủ sau append | Luôn sinh và kiểm cả MD/HTML |
| Lệnh kiểm HTML one-liner lỗi escape | PowerShell truyền dấu nháy sang node -e sai | Chuyển kiểm tra vào verify_item_deep_audit_report_20260905.js | Dùng script với assertion cho chuỗi HTML có nháy |
