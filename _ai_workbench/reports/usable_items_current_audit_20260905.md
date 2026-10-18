# Audit toàn bộ item/rương hiện tại — 05/09/2026

> Audit này chạy lại trực tiếp trên source/config production hiện hành. Chỉ đọc source/config/MongoDB; không sửa người chơi, không phát quà và không restart server.

## 1. Kết luận

- Đã quét đủ **940/940** item có `AssetsUseConfig`.
- **263 ID cần fix chắc chắn**: 111 rương chưa có pool chuẩn, 150 đan thưởng tức thời chưa hoàn thiện cap/ngày, 2 rương thiếu lựa chọn.
- Cả 263 ID hiện được chặn trước consume: bấm dùng trả lỗi và **không trừ item**. Đây là bảo vệ an toàn, không phải đã phục hồi tính năng.
- **672 ID qua fixture hiện tại**; kết quả này chỉ chứng minh handler/state fixture, chưa thay cho kiểm hình và thao tác native trong game.
- **5 ID cần kiểm tra riêng**: 1 luồng client đặc biệt và 4 orphan thiếu `AssetsConfig`.

| Nhóm | Số lượng | Trạng thái hiện tại |
|---|---:|---|
| Rương type 102 chưa có pool xác thực | 111 | Bị chặn, không trừ rương |
| Đan type 103 có reward | 150 | Bị chặn, không trừ đan |
| Rương tự chọn thiếu option | 2 | Bị chặn, không trừ rương |
| Cần test native/orphan | 5 | Chưa kết luận lỗi gameplay |
| Qua fixture hiện tại | 672 | Chưa đồng nghĩa 100% native OK |

## 2. 111 rương chưa có pool chuẩn

Các rương này trước đây có nguy cơ bị trừ mà không có quà. Hiện server trả `ITEM_REWARD_POOL_UNVERIFIED` trước khi consume. Cần khôi phục đúng pool, tỷ lệ và duplicate conversion từ nguồn gốc trước khi mở lại.

| ID | Tên item | Icon | Trạng thái |
|---:|---|---|---|
| `412` | Hộp quà tuyển chọn Tuyết Bảo | `icon_412 ` | Từ chối, không trừ item |
| `413` | Hộp quà tuyển chọn Tuyết Bảo | `icon_413 ` | Từ chối, không trừ item |
| `94301` | Túi Phúc Thiên Cơ | `icon_bag1 ` | Từ chối, không trừ item |
| `94401` | Cẩm nang Nghê Thường | `icon_box22 ` | Từ chối, không trừ item |
| `94416` | Túi Phúc Trăng tròn | `icon_94416 ` | Từ chối, không trừ item |
| `94418` | Hộp quà phá kén·Nguyên Bảo | `icon_94418 ` | Từ chối, không trừ item |
| `94419` | Hộp quà phá kén·Đùi Gà | `icon_94419 ` | Từ chối, không trừ item |
| `94420` | Hộp quà Phá Kiển · Phù Tốc Độ | `icon_94420 ` | Từ chối, không trừ item |
| `94421` | Hộp quà Phá Kén · Baozi | `icon_94421 ` | Từ chối, không trừ item |
| `94422` | Hộp quà Phá Kién - Tiền bạc | `icon_94422 ` | Từ chối, không trừ item |
| `94515` | Dịch Lôi kiếp song phẩm ngẫu nhiên | `random_specSpiritRefine_17 ` | Từ chối, không trừ item |
| `94701` | Túi phúc Thu Ý Nồng | `icon_bag6 ` | Từ chối, không trừ item |
| `94702` | Biểu cảm Công Tử | `icon_emoji_gongzi ` | Từ chối, không trừ item |
| `94703` | Túi phúc Nguyên Tuế mãn | `icon_bag7 ` | Từ chối, không trừ item |
| `94704` | Biểu cảm rắn nhỏ | `icon_emoji_snake ` | Từ chối, không trừ item |
| `94705` | Túi Phúc Chúc Xuân | `icon_bag8 ` | Từ chối, không trừ item |
| `94706` | Túi Phúc Hoa Mệnh | `icon_bag9 ` | Từ chối, không trừ item |
| `94707` | Biểu cảm Pháp Hải | `icon_emoji_fahai ` | Từ chối, không trừ item |
| `94708` | Chăm chỉ luyện túi phúc | `icon_bag10 ` | Từ chối, không trừ item |
| `94709` | Thiên Diễn Bảo Sảo | `icon_bag11 ` | Từ chối, không trừ item |
| `94711` | Tông tình gia lễ | `icon_bag13 ` | Từ chối, không trừ item |
| `94712` | Biểu cảm Bát Giới | `icon_emoji_bajie ` | Từ chối, không trừ item |
| `94713` | Hộp quà kỷ niệm | `icon_bag15 ` | Từ chối, không trừ item |
| `94715` | Hộp quà Thu Ái | `icon_bag16 ` | Từ chối, không trừ item |
| `94716` | Biểu cảm Chồn Tuyết | `icon_emoji_xuediao ` | Từ chối, không trừ item |
| `94718` | Khánh lễ Nguyên Chính | `icon_bag17 ` | Từ chối, không trừ item |
| `94719` | Huyền Cơ Bảo Sao | `icon_94719 ` | Từ chối, không trừ item |
| `94720` | Biểu cảm tiểu mã | `icon_emoji_xiaoma ` | Từ chối, không trừ item |
| `94721` | Đại lễ năm mới | `icon_bag18 ` | Từ chối, không trừ item |
| `94722` | Biểu cảm Bà ngoại | `icon_emoji_laolao ` | Từ chối, không trừ item |
| `94724` | Quà ấm Thanh Dương | `icon_bag20 ` | Từ chối, không trừ item |
| `94725` | Bạc Tố Ngân Bảo Sào | `icon_94725 ` | Từ chối, không trừ item |
| `94726` | Mộc Lan đoan lễ | `icon_bag21 ` | Từ chối, không trừ item |
| `94727` | Biểu cảm Cửu U Tước | `icon_emoji_jiuyouque ` | Từ chối, không trừ item |
| `94729` | Hộp quà kỷ niệm 2 năm | `icon_bag22 ` | Từ chối, không trừ item |
| `94801` | Rương quyết đấu Bang hội | `icon_box26 ` | Từ chối, không trừ item |
| `94802` | Hộp Khởi Nguyên Thần Văn | `icon_94802 ` | Từ chối, không trừ item |
| `94821` | Kho báu Vùng biển tham lam | `icon_94821 ` | Từ chối, không trừ item |
| `94822` | Kho báu Nộ Hải hải vực | `icon_94822 ` | Từ chối, không trừ item |
| `94823` | Kho báu vùng biển Trí Vọng | `icon_94823 ` | Từ chối, không trừ item |
| `94824` | Kho báu hải vực ngạo mạn | `icon_94824 ` | Từ chối, không trừ item |
| `94825` | Kho báu vùng biển Nghi Cụ | `icon_94825 ` | Từ chối, không trừ item |
| `94902` | Mảnh Long Châu ngẫu nhiên | `random_curiosPiece_140700 ` | Từ chối, không trừ item |
| `94904` | Mảnh Thần Nông ngẫu nhiên | `random_curiosPiece_140705 ` | Từ chối, không trừ item |
| `94908` | Mảnh tiên thực ngẫu nhiên | `random_curiosPiece_140718 ` | Từ chối, không trừ item |
| `94911` | Mảnh mài ngẫu nhiên | `random_curiosPiece_140726 ` | Từ chối, không trừ item |
| `94923` | Mảnh bắt ngẫu nhiên | `random_curiosPiece_140730 ` | Từ chối, không trừ item |
| `94926` | Mảnh luyện đạo ngẫu nhiên | `random_curiosPiece_140738 ` | Từ chối, không trừ item |
| `94929` | Mảnh Thiền luyện ngẫu nhiên | `random_curiosPiece_140742 ` | Từ chối, không trừ item |
| `94932` | Mảnh tu luyện bếp ngẫu nhiên | `random_curiosPiece_140750 ` | Từ chối, không trừ item |
| `94935` | Mảnh đan luyện ngẫu nhiên | `random_curiosPiece_140758 ` | Từ chối, không trừ item |
| `94938` | Ngẫu nhiên nhận mảnh cỏ | `random_curiosPiece_140766 ` | Từ chối, không trừ item |
| `94941` | Mảnh phong thình ngẫu nhiên | `random_curiosPiece_140770 ` | Từ chối, không trừ item |
| `100019` | Xích Viêm Tường Long | `icon_85401 ` | Từ chối, không trừ item |
| `100020` | Mảnh yêu linh ngẫu nhiên | `random_elfPiece_01 ` | Từ chối, không trừ item |
| `100021` | Mảnh yêu linh ưu tú | `random_elfPiece_02 ` | Từ chối, không trừ item |
| `100022` | Mảnh tinh linh Tinh xảo | `random_elfPiece_03 ` | Từ chối, không trừ item |
| `100023` | Mảnh yêu tinh Hiếm | `random_elfPiece_04 ` | Từ chối, không trừ item |
| `100024` | Mảnh tinh linh Sử Thi | `random_elfPiece_06 ` | Từ chối, không trừ item |
| `100025` | Mảnh yêu linh Truyền Thuyết | `random_elfPiece_07 ` | Từ chối, không trừ item |
| `100026` | Mảnh Yêu linh cao cấp ngẫu nhiên | `random_elfPiece_01 ` | Từ chối, không trừ item |
| `100030` | Yêu linh ngẫu nhiên | `random_elf_01 ` | Từ chối, không trừ item |
| `100031` | Yêu linh Ưu tú ngẫu nhiên | `random_elf_02 ` | Từ chối, không trừ item |
| `100032` | Ngẫu nhiên Tinh linh tinh xảo | `random_elf_03 ` | Từ chối, không trừ item |
| `100033` | Yêu linh hiếm ngẫu nhiên | `random_elf_04 ` | Từ chối, không trừ item |
| `100034` | Yêu linh sử thi ngẫu nhiên | `random_elf_06 ` | Từ chối, không trừ item |
| `100035` | Yêu linh Truyền Thuyết ngẫu nhiên | `random_elf_07 ` | Từ chối, không trừ item |
| `100036` | Yêu linh cao cấp ngẫu nhiên | `random_elf_01 ` | Từ chối, không trừ item |
| `100040` | Thần binh ngẫu nhiên | `random_artifact_01 ` | Từ chối, không trừ item |
| `100060` | Thần binh đồng hành ngẫu nhiên | `random_artifactSoul_01 ` | Từ chối, không trừ item |
| `100061` | Thần binh đồng hành hiếm ngẫu nhiên | `random_artifactSoul_04 ` | Từ chối, không trừ item |
| `100062` | Thần binh đồng hành Sử Thi ngẫu nhiên | `random_artifactSoul_06 ` | Từ chối, không trừ item |
| `100063` | Ngẫu nhiên Thần binh đồng hành Truyền Thuyết | `random_artifactSoul_07 ` | Từ chối, không trừ item |
| `100139` | Mảnh huyết mạch ngẫu nhiên | `random_bloodlinePiece_01 ` | Từ chối, không trừ item |
| `100160` | Mảnh bí bảo ngẫu nhiên | `random_curiosPiece_01 ` | Từ chối, không trừ item |
| `100170` | Bí bảo Đồng ngẫu nhiên | `random_curios_shop1_01 ` | Từ chối, không trừ item |
| `100171` | Mảnh bí bảo đồng tinh xảo ngẫu nhiên | `random_curios_shop1_03 ` | Từ chối, không trừ item |
| `100172` | Bí bảo đồng hiếm ngẫu nhiên | `random_curios_shop1_04 ` | Từ chối, không trừ item |
| `100173` | Bí bảo Đồng Sử Thi ngẫu nhiên | `random_curios_shop1_06 ` | Từ chối, không trừ item |
| `100174` | Bí bảo Truyền Thuyết ngẫu nhiên | `random_curios_07 ` | Từ chối, không trừ item |
| `100185` | Mảnh bí bảo Đồng ngẫu nhiên | `random_curiosPiece_shop1_01 ` | Từ chối, không trừ item |
| `100190` | Mảnh bí bảo hải trân ngẫu nhiên | `random_curiosPiece_shop2_01 ` | Từ chối, không trừ item |
| `100200` | Bí bảo hải trân ngẫu nhiên | `random_curios_shop2_01 ` | Từ chối, không trừ item |
| `100201` | Bí bảo hải trân phẩm chất Hiếm ngẫu nhiên | `random_curios_shop2_03 ` | Từ chối, không trừ item |
| `100202` | Bí bảo hải trân quý hiếm ngẫu nhiên | `random_curios_shop2_04 ` | Từ chối, không trừ item |
| `100203` | Bí bảo hải trân sử thi ngẫu nhiên | `random_curios_shop2_06 ` | Từ chối, không trừ item |
| `100230` | Bí bảo ngẫu nhiên | `random_curios_01 ` | Từ chối, không trừ item |
| `100231` | Bí bảo tinh xảo ngẫu nhiên | `random_curios_03 ` | Từ chối, không trừ item |
| `100232` | Bí bảo hiếm ngẫu nhiên | `random_curios_04 ` | Từ chối, không trừ item |
| `100233` | Bí bảo Sử Thi ngẫu nhiên | `random_curios_06 ` | Từ chối, không trừ item |
| `100250` | Bí bảo ngẫu nhiên | `random_curios_01 ` | Từ chối, không trừ item |
| `100251` | Bí bảo tinh xảo ngẫu nhiên | `random_curios_03 ` | Từ chối, không trừ item |
| `100252` | Bí bảo hiếm ngẫu nhiên | `random_curios_04 ` | Từ chối, không trừ item |
| `100253` | Bí bảo Sử Thi ngẫu nhiên | `random_curios_06 ` | Từ chối, không trừ item |
| `100501` | Thần văn Hiếm ngẫu nhiên | `random_orb_04 ` | Từ chối, không trừ item |
| `100502` | Thần văn Sử Thi ngẫu nhiên | `random_orb_06 ` | Từ chối, không trừ item |
| `100503` | Ngẫu nhiên Thần văn Truyền Thuyết | `random_orb_07 ` | Từ chối, không trừ item |
| `100641` | Tài nguyên ngẫu nhiên 30 phút | `random_homeland_02 ` | Từ chối, không trừ item |
| `100642` | Tài nguyên ngẫu nhiên 2 giờ | `random_homeland_03 ` | Từ chối, không trừ item |
| `100643` | 8 giờ tài nguyên ngẫu nhiên | `random_homeland_04 ` | Từ chối, không trừ item |
| `100701` | Ngẫu nhiên 1 cấp Linh Trục | `random_connect_01 ` | Từ chối, không trừ item |
| `100702` | Tinh trục cấp 2 ngẫu nhiên | `random_connect_02 ` | Từ chối, không trừ item |
| `100703` | Trục linh cấp 3 ngẫu nhiên | `random_connect_03 ` | Từ chối, không trừ item |
| `100704` | Linh Xu cấp 4 ngẫu nhiên | `random_connect_04 ` | Từ chối, không trừ item |
| `100705` | Tinh linh 5 cấp ngẫu nhiên | `random_connect_05 ` | Từ chối, không trừ item |
| `100706` | Linh trục cấp 6 ngẫu nhiên | `random_connect_06 ` | Từ chối, không trừ item |
| `100707` | Linh trục cấp 7 ngẫu nhiên | `random_connect_07 ` | Từ chối, không trừ item |
| `100708` | Linh trục 8 cấp ngẫu nhiên | `random_connect_08 ` | Từ chối, không trừ item |
| `100709` | Ngẫu nhiên linh trục cấp 9 | `random_connect_09 ` | Từ chối, không trừ item |
| `101000` | Rương tiêu diệt Yêu Tôn tầng 1 | `syt_bossKilledBox ` | Từ chối, không trừ item |
| `101310` | Cẩm nang phòng thủ tranh phong | `icon_bag14 ` | Từ chối, không trừ item |

## 3. 150 đan type 103 chưa hoàn thiện

Các item này có `rewards` nhưng cần triển khai đúng bộ đếm dùng chung `-802/-804`, reset ngày và cộng giới hạn đặc quyền. Hiện trả `ITEM_PILL_PENDING_VERIFICATION` và không trừ đan.

| ID | Tên item | Icon | Trạng thái |
|---:|---|---|---|
| `110122` | Bậc 1 phẩm xanh tu vi đan | `icon_110121 ` | Từ chối, không trừ item |
| `110123` | Đan tu vi phẩm xanh bậc 1 | `icon_110121 ` | Từ chối, không trừ item |
| `110124` | Đan dược tu vi phẩm Tím bậc 1 | `icon_110121 ` | Từ chối, không trừ item |
| `110126` | Bậc 1 phẩm cam tu vi đan | `icon_110121 ` | Từ chối, không trừ item |
| `110127` | Đan tu vi phẩm đỏ Bậc 1 | `icon_110121 ` | Từ chối, không trừ item |
| `110142` | Bậc 1 phẩm xanh Tịch Cốc Đan | `icon_110141 ` | Từ chối, không trừ item |
| `110143` | Bậc 1 phẩm xanh Tịch Cốc Đan | `icon_110141 ` | Từ chối, không trừ item |
| `110144` | Đan tịch cốc phẩm tím bậc 1 | `icon_110141 ` | Từ chối, không trừ item |
| `110146` | Bức cốc đan phẩm cam bậc 1 | `icon_110141 ` | Từ chối, không trừ item |
| `110147` | Đan dược Tích Cốc phẩm đỏ bậc 1 | `icon_110141 ` | Từ chối, không trừ item |
| `110222` | Tu vi đan phẩm xanh bậc 2 | `icon_110121 ` | Từ chối, không trừ item |
| `110223` | Đan tu vi phẩm xanh bậc 2 | `icon_110121 ` | Từ chối, không trừ item |
| `110224` | Đan dược tu vi Phẩm Tím Bậc 2 | `icon_110121 ` | Từ chối, không trừ item |
| `110226` | Đan dược tu vi phẩm cam bậc 2 | `icon_110121 ` | Từ chối, không trừ item |
| `110227` | Đan tu vi phẩm đỏ bậc 2 | `icon_110121 ` | Từ chối, không trừ item |
| `110242` | Bậc 2 phẩm xanh đan Tịch Cốc | `icon_110141 ` | Từ chối, không trừ item |
| `110243` | Tịch Cốc đan Phẩm xanh Bậc 2 | `icon_110141 ` | Từ chối, không trừ item |
| `110244` | Bậc 2 Phẩm Tím Tịch Cốc Đan | `icon_110141 ` | Từ chối, không trừ item |
| `110246` | Phẩm cam Trúc Cơ Đan bậc 2 | `icon_110141 ` | Từ chối, không trừ item |
| `110247` | Bậc 2 phẩm Đỏ Tịch Cốc Đan | `icon_110141 ` | Từ chối, không trừ item |
| `110322` | Đan tu vi 3 cấp Phẩm xanh | `icon_110121 ` | Từ chối, không trừ item |
| `110323` | bậc 3 phẩm xanh linh đan tu vi | `icon_110121 ` | Từ chối, không trừ item |
| `110324` | Đan tu vi phẩm tím Bậc 3 | `icon_110121 ` | Từ chối, không trừ item |
| `110326` | Đan dược tu vi phẩm cam bậc 3 | `icon_110121 ` | Từ chối, không trừ item |
| `110327` | Đan dược tu vi phẩm Đỏ Bậc 3 | `icon_110121 ` | Từ chối, không trừ item |
| `110342` | Đan Tịch Cốc phẩm xanh bậc 3 | `icon_110141 ` | Từ chối, không trừ item |
| `110343` | Đan Tịch Cốc phẩm xanh Bậc 3 | `icon_110141 ` | Từ chối, không trừ item |
| `110344` | Đan Tịch Cốc Phẩm Tím Bậc 3 | `icon_110141 ` | Từ chối, không trừ item |
| `110346` | Đan dược Tích Cốc phẩm cam bậc 3 | `icon_110141 ` | Từ chối, không trừ item |
| `110347` | Đan Tịch Cốc phẩm Đỏ bậc 3 | `icon_110141 ` | Từ chối, không trừ item |
| `110422` | Tu vi đan Phẩm xanh Bậc 4 | `icon_110121 ` | Từ chối, không trừ item |
| `110423` | Đan tu vi Luyện khí phẩm xanh Bậc 4 | `icon_110121 ` | Từ chối, không trừ item |
| `110424` | Đan tu vi phẩm Tím bậc 4 | `icon_110121 ` | Từ chối, không trừ item |
| `110426` | Đan tu vi phẩm Cam bậc 4 | `icon_110121 ` | Từ chối, không trừ item |
| `110427` | Đan tu vi phẩm Đỏ 4 bậc | `icon_110121 ` | Từ chối, không trừ item |
| `110442` | Bậc 4 Phẩm xanh Tịch Cốc đan | `icon_110141 ` | Từ chối, không trừ item |
| `110443` | Tịch Cốc Đan phẩm xanh bậc 4 | `icon_110141 ` | Từ chối, không trừ item |
| `110444` | Bịch Tịch Cốc phẩm Tím bậc 4 | `icon_110141 ` | Từ chối, không trừ item |
| `110446` | Phẩm cam Bậc 4 Tịch Cốc Đan | `icon_110141 ` | Từ chối, không trừ item |
| `110447` | Đan dược Tích Cốc phẩm đỏ bậc 4 | `icon_110141 ` | Từ chối, không trừ item |
| `110522` | Đan tu vi phẩm xanh 5 bậc | `icon_110121 ` | Từ chối, không trừ item |
| `110523` | Đan tu vi phẩm xanh bậc 5 | `icon_110121 ` | Từ chối, không trừ item |
| `110524` | 5 bậc Phẩm Tím tu vi đan | `icon_110121 ` | Từ chối, không trừ item |
| `110526` | Đan dược tu vi phẩm cam Bậc 5 | `icon_110121 ` | Từ chối, không trừ item |
| `110527` | Đan dược tu vi phẩm Đỏ 5 bậc | `icon_110121 ` | Từ chối, không trừ item |
| `110542` | Tịch Cốc đan 5 bậc phẩm xanh | `icon_110141 ` | Từ chối, không trừ item |
| `110543` | Bạch Dương Phẩm xanh 5 Bậc Tịch Cốc Đan | `icon_110141 ` | Từ chối, không trừ item |
| `110544` | Tịch Cốc đan phẩm tím 5 bậc | `icon_110141 ` | Từ chối, không trừ item |
| `110546` | Đan Tịch Cốc phẩm cam bậc 5 | `icon_110141 ` | Từ chối, không trừ item |
| `110547` | Đan Tịch Cốc phẩm Đỏ 5 bậc | `icon_110141 ` | Từ chối, không trừ item |
| `110622` | Đan dược tu vi phẩm xanh Bậc 6 | `icon_110121 ` | Từ chối, không trừ item |
| `110623` | Đan tu vi Phẩm xanh bậc 6 | `icon_110121 ` | Từ chối, không trừ item |
| `110624` | Tu vi đan phẩm tím bậc 6 | `icon_110121 ` | Từ chối, không trừ item |
| `110626` | Phẩm cam tu vi đan Bậc 6 | `icon_110121 ` | Từ chối, không trừ item |
| `110627` | Bậc 6 phẩm Đỏ linh đan tu vi | `icon_110121 ` | Từ chối, không trừ item |
| `110642` | Bậc 6 phẩm xanh Tịch Cốc Đan | `icon_110141 ` | Từ chối, không trừ item |
| `110643` | Bậc 6 Phẩm xanh Tịch Cốc đan | `icon_110141 ` | Từ chối, không trừ item |
| `110644` | Linh đan diệu dược Tịch Cốc phẩm tím Bậc 6 | `icon_110141 ` | Từ chối, không trừ item |
| `110646` | Đan Tịch Cốc Phẩm Cam Bậc 6 | `icon_110141 ` | Từ chối, không trừ item |
| `110647` | Bịch Cốc Đan phẩm Đỏ bậc 6 | `icon_110141 ` | Từ chối, không trừ item |
| `110722` | Đan tu vi bậc 7 phẩm xanh | `icon_110121 ` | Từ chối, không trừ item |
| `110723` | Đan dược tu vi phẩm lam cấp 7 | `icon_110121 ` | Từ chối, không trừ item |
| `110724` | Đan dược tu vi phẩm Tím bậc 7 | `icon_110121 ` | Từ chối, không trừ item |
| `110726` | Đan tu vi bậc 7 phẩm cam | `icon_110121 ` | Từ chối, không trừ item |
| `110727` | Đan tu vi phẩm Đỏ bậc 7 | `icon_110121 ` | Từ chối, không trừ item |
| `110742` | Tịch Cốc đan bậc 7 phẩm xanh | `icon_110141 ` | Từ chối, không trừ item |
| `110743` | Tịch Cốc Đan phẩm xanh bậc 7 | `icon_110141 ` | Từ chối, không trừ item |
| `110744` | Đan Tịch Cốc Phẩm Tím bậc 7 | `icon_110141 ` | Từ chối, không trừ item |
| `110746` | 7 cấp Phẩm cam Tịch Cốc đan | `icon_110141 ` | Từ chối, không trừ item |
| `110747` | bậc 7 phẩm Đỏ Tịch Cốc Đan | `icon_110141 ` | Từ chối, không trừ item |
| `110822` | Đan dược tu vi bậc 8 Phẩm xanh | `icon_110121 ` | Từ chối, không trừ item |
| `110823` | Bậc 8 phẩm xanh tu vi đan | `icon_110121 ` | Từ chối, không trừ item |
| `110824` | Đan tu vi phẩm Tím bậc 8 | `icon_110121 ` | Từ chối, không trừ item |
| `110826` | Đan tu vi phẩm cam bậc 8 | `icon_110121 ` | Từ chối, không trừ item |
| `110827` | Đan tu vi phẩm Đỏ bậc 8 | `icon_110121 ` | Từ chối, không trừ item |
| `110842` | Đan dược Tịch Cốc bậc 8 phẩm xanh | `icon_110141 ` | Từ chối, không trừ item |
| `110843` | Tịch Cốc Đan phẩm xanh bậc 8 | `icon_110141 ` | Từ chối, không trừ item |
| `110844` | Bậc 8 Phẩm Tím Tịch Cốc Đan | `icon_110141 ` | Từ chối, không trừ item |
| `110846` | Đan Tịch Cốc phẩm cam bậc 8 | `icon_110141 ` | Từ chối, không trừ item |
| `110847` | bậc 8 phẩm Đỏ Tịch Cốc đan | `icon_110141 ` | Từ chối, không trừ item |
| `110922` | Đan dược tu vi phẩm xanh bậc 9 | `icon_110121 ` | Từ chối, không trừ item |
| `110923` | Đan tu vi phẩm xanh bậc 9 | `icon_110121 ` | Từ chối, không trừ item |
| `110924` | 9 bậc Phẩm Tím tu vi đan | `icon_110121 ` | Từ chối, không trừ item |
| `110926` | Tu vi đan Phẩm cam bậc 9 | `icon_110121 ` | Từ chối, không trừ item |
| `110927` | Đan tu vi phẩm Đỏ bậc 9 | `icon_110121 ` | Từ chối, không trừ item |
| `110942` | Đan Tịch Cốc bậc 9 Phẩm xanh | `icon_110141 ` | Từ chối, không trừ item |
| `110943` | bậc 9 Phẩm xanh Tịch Cốc Đan | `icon_110141 ` | Từ chối, không trừ item |
| `110944` | 9 bậc Phẩm Tím linh đan tịch cốc | `icon_110141 ` | Từ chối, không trừ item |
| `110946` | Đan Pịch Cốc phẩm cam bậc 9 | `icon_110141 ` | Từ chối, không trừ item |
| `110947` | Đan Tích Cốc phẩm đỏ bậc 9 | `icon_110141 ` | Từ chối, không trừ item |
| `111022` | Cấp 10 Phẩm xanh Đan tu vi | `icon_110121 ` | Từ chối, không trừ item |
| `111023` | Đan dược tu vi phẩm xanh bậc 10 | `icon_110121 ` | Từ chối, không trừ item |
| `111024` | Đan tu vi Phẩm Tím Bậc 10 | `icon_110121 ` | Từ chối, không trừ item |
| `111026` | Đan tu vi phẩm cam Cấp 10 | `icon_110121 ` | Từ chối, không trừ item |
| `111027` | Đan tu vi phẩm Đỏ Bậc 10 | `icon_110121 ` | Từ chối, không trừ item |
| `111042` | Bậc 10 linh đan tịch cổ phẩm xanh | `icon_110141 ` | Từ chối, không trừ item |
| `111043` | Bậc 10 Phẩm xanh Tịch Cốc đan | `icon_110141 ` | Từ chối, không trừ item |
| `111044` | Đan Tịch Cốc phẩm Tím bậc 10 | `icon_110141 ` | Từ chối, không trừ item |
| `111046` | Đan Tịch Cốc phẩm Cam bậc 10 | `icon_110141 ` | Từ chối, không trừ item |
| `111047` | Bậc 10 phẩm Đỏ Tịch Cốc đan | `icon_110141 ` | Từ chối, không trừ item |
| `111122` | Tu vi đan phẩm xanh Bậc 11 | `icon_110121 ` | Từ chối, không trừ item |
| `111123` | Tu vi đan phẩm xanh bậc 11 | `icon_110121 ` | Từ chối, không trừ item |
| `111124` | Đan tu vi Phẩm Tím bậc 11 | `icon_110121 ` | Từ chối, không trừ item |
| `111126` | Đan dược tu vi Phẩm cam Bậc 11 | `icon_110121 ` | Từ chối, không trừ item |
| `111127` | Đan tu vi phẩm Đỏ Bậc 11 | `icon_110121 ` | Từ chối, không trừ item |
| `111142` | Bậc 11 phẩm xanh Tịch Cốc Đan | `icon_110141 ` | Từ chối, không trừ item |
| `111143` | Đan Tịch Cốc phẩm xanh Bậc 11 | `icon_110141 ` | Từ chối, không trừ item |
| `111144` | 11BậcPhẩm TímTịch CốcĐan | `icon_110141 ` | Từ chối, không trừ item |
| `111146` | Bậc 11 phẩm cam tích cốc đan | `icon_110141 ` | Từ chối, không trừ item |
| `111147` | Tịch Cốc đan phẩm Đỏ bậc 11 | `icon_110141 ` | Từ chối, không trừ item |
| `111222` | Tu vi đan Bậc 12 phẩm xanh | `icon_110121 ` | Từ chối, không trừ item |
| `111223` | Đan tu vi phẩm xanh Bậc 12 | `icon_110121 ` | Từ chối, không trừ item |
| `111224` | Đan dược tu vi phẩm tím bậc 12 | `icon_110121 ` | Từ chối, không trừ item |
| `111226` | Đan Tu Vi, Phẩm Cam, Bậc 12 | `icon_110121 ` | Từ chối, không trừ item |
| `111227` | Tu vi đan phẩm Đỏ Bậc 12 | `icon_110121 ` | Từ chối, không trừ item |
| `111242` | Đan Tịch Cốc phẩm xanh Bậc 12 | `icon_110141 ` | Từ chối, không trừ item |
| `111243` | Linh đan Tịch Cốc phẩm xanh Bậc 12 | `icon_110141 ` | Từ chối, không trừ item |
| `111244` | Đan Tịch Cốc phẩm tím Bậc 12 | `icon_110141 ` | Từ chối, không trừ item |
| `111246` | Bậc 12 phẩm cam Tịch Cốc Đan | `icon_110141 ` | Từ chối, không trừ item |
| `111247` | Đan Dược Tịch Cốc phẩm Đỏ Bậc 12 | `icon_110141 ` | Từ chối, không trừ item |
| `111322` | Đan tu vi phẩm xanh bậc 13 | `icon_110121 ` | Từ chối, không trừ item |
| `111323` | Đan tu vi phẩm xanh Bậc 13 | `icon_110121 ` | Từ chối, không trừ item |
| `111324` | Đan tu vi Phẩm Tím bậc 13 | `icon_110121 ` | Từ chối, không trừ item |
| `111326` | Đan phương tu vi Phẩm cam Bậc 13 | `icon_110121 ` | Từ chối, không trừ item |
| `111327` | Tu vi đan phẩm Đỏ 13 bậc | `icon_110121 ` | Từ chối, không trừ item |
| `111342` | Đan Tịch Cốc phẩm xanh Bậc 13 | `icon_110141 ` | Từ chối, không trừ item |
| `111343` | Đan Tịch Cốc phẩm xanh 13 bậc | `icon_110141 ` | Từ chối, không trừ item |
| `111344` | 13 bậc Phẩm Tím Tịch Cốc Đan | `icon_110141 ` | Từ chối, không trừ item |
| `111346` | Đan tịch cốc phẩm cam 13 bậc | `icon_110141 ` | Từ chối, không trừ item |
| `111347` | Đan Pịch Cốc phẩm Đỏ cấp 13 | `icon_110141 ` | Từ chối, không trừ item |
| `111422` | Đan tu vi phẩm lục bậc 14 | `icon_110121 ` | Từ chối, không trừ item |
| `111423` | Đan tu vi phẩm xanh Bậc 14 | `icon_110121 ` | Từ chối, không trừ item |
| `111424` | Đan tu vi Phẩm Tím bậc 14 | `icon_110121 ` | Từ chối, không trừ item |
| `111426` | Tu vi đan phẩm cam Bậc 14 | `icon_110121 ` | Từ chối, không trừ item |
| `111427` | Đan tu vi phẩm Đỏ Bậc 14 | `icon_110121 ` | Từ chối, không trừ item |
| `111442` | Bậc 14 Phẩm xanh Tịch Cốc Đan | `icon_110141 ` | Từ chối, không trừ item |
| `111443` | Đan dược Tịch Cốc phẩm xanh bậc 14 | `icon_110141 ` | Từ chối, không trừ item |
| `111444` | Đan dược Tịch Cốc phẩm tím 14 bậc | `icon_110141 ` | Từ chối, không trừ item |
| `111446` | Tịch Cốc Đan phẩm cam bậc 14 | `icon_110141 ` | Từ chối, không trừ item |
| `111447` | Bậc 14 phẩm Đỏ Tịch Cốc Đan | `icon_110141 ` | Từ chối, không trừ item |
| `111522` | Tu vi đan phẩm xanh Bậc 15 | `icon_110121 ` | Từ chối, không trừ item |
| `111523` | Đan tu vi phẩm xanh bậc 15 | `icon_110121 ` | Từ chối, không trừ item |
| `111524` | Đan tu vi phẩm tím bậc 15 | `icon_110121 ` | Từ chối, không trừ item |
| `111526` | Đan tu vi phẩm cam Bậc 15 | `icon_110121 ` | Từ chối, không trừ item |
| `111527` | Bậc 15 đan dược tu vi phẩm Đỏ | `icon_110121 ` | Từ chối, không trừ item |
| `111542` | Đan tịch cốc 15 bậc phẩm xanh | `icon_110141 ` | Từ chối, không trừ item |
| `111543` | Bậc 15 Tịch Cốc Dan Phẩm Xanh | `icon_110141 ` | Từ chối, không trừ item |
| `111544` | Bậc 15 Phẩm Tím Tịch Cốc đan | `icon_110141 ` | Từ chối, không trừ item |
| `111546` | Đan Phục Cốc 15 cấp Phẩm cam | `icon_110141 ` | Từ chối, không trừ item |
| `111547` | Đan Tịch Cốc phẩm Đỏ bậc 15 | `icon_110141 ` | Từ chối, không trừ item |

## 4. Hai rương thiếu lựa chọn

| ID | Tên item | Icon | Trạng thái |
|---:|---|---|---|
| `90021` | Tự chọn Mảnh tinh linh Ưu tú | `select_elfPiece_02 ` | Từ chối, không trừ item |
| `90022` | Tự chọn Mảnh yêu tinh tinh xảo | `select_elfPiece_03 ` | Từ chối, không trừ item |

`90021/90022` có `AssetsUseConfig.rewards=[]`; catalog Elf hiện không có lựa chọn phẩm chất 2/3 tương ứng. Không nên tự nâng lên phẩm chất 4.

## 5. Năm item cần kiểm tra native/orphan

| ID | Tên item | Icon | Trạng thái |
|---:|---|---|---|
| `227` | Chỉ đoản tình trường | `icon_227 ` | SPECIAL_CLIENT_FLOW_NOT_TAG1300 |
| `94355` | (không có tên AssetsConfig) | `- ` | MISSING_ASSETS_CONFIG |
| `94356` | (không có tên AssetsConfig) | `- ` | MISSING_ASSETS_CONFIG |
| `94357` | (không có tên AssetsConfig) | `- ` | MISSING_ASSETS_CONFIG |
| `94358` | (không có tên AssetsConfig) | `- ` | MISSING_ASSETS_CONFIG |

- `227` là luồng client đặc biệt type 108, không dùng tag 1300 như item thường.
- `94355–94358` có `AssetsUseConfig` nhưng thiếu `AssetsConfig`, nên cần xác minh client/config gốc trước khi sửa.

## 6. Ảnh hưởng người chơi hiện tại

- S1: 621 người thật; 3 người đang giữ item thuộc nhóm cần fix, tổng `100139 ×823`.
- S2: 1 người thật; 0 người bị ảnh hưởng, không thấy item lỗi đang giữ.
- Không thấy mail chưa nhận hoặc GiftCode active chứa 263 ID này.
- Không tự phát bù: tồn kho chưa mở không phải giao dịch mất quà; cần ledger cụ thể nếu xử lý lịch sử.

## 7. File bằng chứng và danh sách

- JSON production: `_ai_workbench/temp/usable_item_audit_prod_20260905.json` — SHA-256 `c068982dd14344669a43cdb80ab6dc88375bbaa3d7b3e9e4077ce4bf380e8a44`.
- Runtime Mongo read-only: `_ai_workbench/temp/usable_item_runtime_audit_20260905_054552.json` — SHA-256 `e6fd8154606999cacf3ff095c020020c32baa7ec773459cb515c80cb61b4a0e1`.
- CSV 268 dòng (263 cần fix + 5 pending): `_ai_workbench/reports/usable_items_need_fix_current_20260905.csv`.
- TXT 263 ID cần fix: `_ai_workbench/reports/usable_items_need_fix_current_20260905.txt`.
- TXT 5 pending: `_ai_workbench/reports/usable_items_pending_native_current_20260905.txt`.

## 8. Thứ tự fix đề xuất

1. `100139` vì đang có 823 rương trên 3 người thật; khôi phục đúng mảnh huyết mạch, không phát nguyên huyết mạch.
2. Rương được event/shop tham chiếu nhiều: `412`, `413`, `94401`, `94416`, `94801`, `94802`.
3. Các họ random native: Elf/Curios/Orb/Linh Trục/ArtifactSoul; mỗi họ cần contract riêng và relog.
4. Hoàn thiện 150 đan với cap chung/ngày và đặc quyền, rồi mới bỏ chặn.
5. Xác minh nguồn gốc `90021/90022`, `227`, `94355–94358` trước khi thay config.

> Tạo báo cáo lúc 2026-09-05T12:49:21+07:00.
