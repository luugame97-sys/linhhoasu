# Kiểm kê và kế hoạch cập nhật toàn bộ thời trang — 09/09/2026

**Đã kiểm kê cấu hình và hợp đồng client/backend; đã lấy dữ liệu nguồn. Chưa tích hợp hoặc phát hành bản thời trang mới.**

## 1. Nguồn và phạm vi

- Nguồn Trung được lấy lại từ [entrypoint của APK đã cung cấp](https://lhsi.guangzhougy.com/agent/70000001/index.html): `js/main.min_dc9b2913.js`, cấu hình `config_2f004ade.bin`. Đây là build đang được entrypoint này công bố, không khẳng định mọi kênh Trung cùng phiên bản.
- Đã thay mốc so sánh cũ `main.min_97d2b812.js` bằng build hiện hành; bản cũ chỉ dùng truy nguyên. Không chép main bundle Trung đè bản Việt.
- Phạm vi: đủ 13 bảng Fashion*, 2.078 dòng FashionConfig, 65 khai báo bộ, quan hệ mảnh/biến thể, item/rương, appearance, kỹ năng/hiệu ứng liên quan, ngôn ngữ, manifest và pack tài nguyên.
- Local được đối chiếu live 14 file. Một file config server khác byte nén nhưng **20 bảng liên quan khớp nội dung** giữa local/server/client; những file code được kiểm đều khớp live.
- Kiểm thử hành vi bằng handler và hàm native thật trong RAM, cấm network; productionWrites=0. Không thử mọi model trên trình duyệt ở lượt kiểm kê này.

## 2. Thống kê chênh lệch

| Hạng mục | Bản Việt | Bản Trung | Phần cập nhật |
|---|---:|---:|---|
| Khai báo bộ, gồm bộ mặc định/hệ thống | 59 | 65 | Thêm 6 |
| FashionConfig | 1.976 | 2.078 | Thêm 102, sửa 46, không xóa |
| Bảng điểm sao màu | 151 | 201 | Thêm 50 dòng (151–200) |
| Ngoại quan lẻ mới | — | 25 | Không tính mảnh thuộc bộ |
| Biến thể đặc biệt bộ 28340 | 0 | 5 | 20 mảnh spFashionIds |
| Loại slot trong preset | 9 | 10 | Thêm 306: hiệu ứng vào trận |

**102 dòng mới = 57 mảnh thuộc 6 bộ mới + 20 mảnh đặc biệt của bộ 28340 + 25 ngoại quan lẻ.** Các con số mảnh không phải 102 bộ mới. Số biến thể cấp/màu của mỗi loại cần đọc đúng bảng; cấp nâng sao không được gọi chung là màu.

## 3. Sáu bộ cần bổ sung

| ID | Tên nguồn / tên Việt | Loại | Cấp hoặc biến thể | Cách nhận theo cấu hình |
|---|---|---|---:|---|
| 28310 | 陈曜苍穹 / Trần Diệu Thương Khung (tạm dịch) | Bộ liên động/nâng cấp | 1 | Rương 4 mảnh |
| 28370 | 炎帝萧炎 / Viêm Đế Tiêu Viêm | Bộ liên động/nâng cấp | 5 | Rương 4 mảnh |
| 28380 | 武祖林动 / Võ Tổ Lâm Động | Bộ liên động/nâng cấp | 5 | Rương 4 mảnh |
| 28410 | 星罗虫影 / Tinh La Trùng Ảnh (tạm dịch) | Bộ kết liễu | 1 | Rương 5 item: 4 mảnh + 28416 (slot 306) |
| 29280 | 飞雪洇墨 / Phi Tuyết Nhân Mặc (tạm dịch) | Bộ thường | 1 | Rương 4 mảnh |
| 29820 | 沧澜云梦 / Thương Lan Vân Mộng (tạm dịch) | Áo tắm | 1 | Mua tại áo tắm: 456 ×30; không có rương |

- 28370 và 28380 có cấp 0–4, mỗi cấp 4 mảnh; nguyên liệu riêng 837/838, yêu cầu 100 →150 →250 →500. Giữ quy tắc thay bằng nguyên liệu chung theo server.
- 28310 dùng skillId 28290 trong nguồn gốc; không tự đổi ID kỹ năng để trùng ID bộ.
- 29280 có điều kiện hiển thị theo ngày 57. Không bỏ điều kiện ngày hoặc mở miễn phí chỉ để test xanh.
- 29820 có phụ kiện mặt 29825, slot305, đặc quyền 38/50; phải kiểm cùng preset suối nóng 999.

## 4. Bộ cũ có thay đổi

- **28340 Mặc Nhiễm Tinh Hà**: mỗi màu 0–4 có thêm nhánh `spFashionIds` với 2844/8012844…8042844. Không phải thêm 5 màu thường. Client Trung gửi `color=100…104` để mặc nhánh này; client Việt không có hàm chọn và backend hiện từ chối cả 5 mã.
- **29070 Tiên nhân Thanh Khâu**: thêm/đổi điều kiện khu vực TW và ngày57; cần giữ chính sách khu vực hiện hành khi cập nhật.
- **29160 Điểm Mặc Đoạt Hồn**: thay showTypeTw của hai màu; không đổi quyền sở hữu.
- **46 FashionConfig cũ đổi**: chi tiết từng field ở `fashion-table-deltas.json`; gồm hiển thị khu vực/ngày và các metadata khác. Không áp đè tất cả chỉ vì cùng ID.
- **43 SkillEffectConfig khác cùng ID**, 32 node phụ thuộc mới trong đồ thị đã thu thập. Ví dụ 283700 đổi type42→54 và nhánh hiệu ứng; 284100 có args cuối 1000→100. Đây là khác biệt gameplay, phải kiểm nội dung và bộ giải kỹ năng trước nhập.
- Trong dữ liệu phụ thuộc: AppearanceConfig thêm108; EffectConfig thêm15/sửa5; SkillConfig và SkillBehaviorConfig mỗi bảng thêm1. Không được coi đủ ảnh là đủ kỹ năng.

## 5. Ngoại quan lẻ mới

Tên Việt dưới đây là tên làm việc/tạm dịch để kiểm kê, chưa nhập bảng dịch game.

| ID | Nhóm | Tên Trung | Tên Việt làm việc |
|---|---|---|---|
| 11291 | Danh hiệu | 画中仙境 | Họa Trung Tiên Cảnh |
| 11292 | Danh hiệu | 自在修行 | Tự Tại Tu Hành |
| 11466 | Khung đại diện | 鲲游动态头像框 | Khung đại diện động Côn Du |
| 11566 | Bong bóng chat | 鲲游动态气泡 | Bong bóng chat động Côn Du |
| 11837 | Ảnh đại diện | 炎帝萧炎头像 | Ảnh đại diện Viêm Đế Tiêu Viêm |
| 11838 | Ảnh đại diện | 武祖林动头像 | Ảnh đại diện Võ Tổ Lâm Động |
| 12078 | Nền | 灵画河山 | Linh Họa Hà Sơn |
| 12079 | Nền | 烟墨流金 | Yên Mặc Lưu Kim |
| 15002 | Ngoại quan giao diện phụ | 灵汐莲华 | Linh Tịch Liên Hoa |
| 15502 | Chủ đề giao diện | 泡泡鸭趣 | Bào Bào Áp Thú |
| 21141 | Cánh | 月相绕庭 | Nguyệt Tướng Nhiễu Đình |
| 21150 | Cánh | 苍松含曦 | Thương Tùng Hàm Hi |
| 22041 | Thú cưỡi | 月影成兔 | Nguyệt Ảnh Thành Thố |
| 22050 | Thú cưỡi | 浮舟渡墨 | Phù Chu Độ Mặc |
| 23038 | Vũ khí | 星河揽月 | Tinh Hà Lãm Nguyệt |
| 23046 | Vũ khí | 鲲啸苍穹·碧澜 | Côn Khiếu Thương Khung · Bích Lan |
| 23047 | Vũ khí | 鲲啸苍穹·霜耀 | Côn Khiếu Thương Khung · Sương Diệu |
| 23048 | Vũ khí | 鲲啸苍穹·玄烬 | Côn Khiếu Thương Khung · Huyền Tẫn |
| 23049 | Vũ khí | 煦曜墨松 | Hú Diệu Mặc Tùng |
| 24140 | Pháp bảo | 斟星酌月 | Châm Tinh Chước Nguyệt |
| 24142 | Pháp bảo | 鎏风破空 | Lưu Phong Phá Không |
| 24149 | Pháp bảo | 鲲游画境·碧澜 | Côn Du Họa Cảnh · Bích Lan |
| 24150 | Pháp bảo | 鲲游画境·霜耀 | Côn Du Họa Cảnh · Sương Diệu |
| 24151 | Pháp bảo | 鲲游画境·玄烬 | Côn Du Họa Cảnh · Huyền Tẫn |
| 24152 | Pháp bảo | 醉墨流觞 | Túy Mặc Lưu Thương |

Loại106 hiện ghi nhãn trung tính vì cần xác nhận đúng màn sử dụng; không tự gọi đó là skin chiến đấu. Chủ đề15502 dùng FashionBtnConfig/theme2, không có AppearanceConfig là hợp đồng riêng của renderer (tương tự15501), không phải tài nguyên bị mất.

## 6. Lỗi và điểm chặn đã tái hiện

| Mức | Phát hiện | Bằng chứng / việc phải làm |
|---|---|---|
| P0 | Chỉ số bộ bị cộng khi chưa sở hữu | Helper addFashionAttrs trong BattleService duyệt attrs của bộ mà thiếu gate ownership; nạp6 bộ mới trong RAM làm nhân vật không sở hữu tăng thêm attrs51=1900,52=1300,53=1800. Sửa và so sánh naked/partial/full trước nhập config. |
| P0 | Chọn chủ đề1812 thiếu kiểm tra | Gọi15502 chưa sở hữu hoặc ID99999999 đều ACK0; lưu vào officialActivity.mainPanel thay vì fashionInfo.mainPanel. Sửa quyền sở hữu/ID/expiry và save-sync-relog trước thêm theme2. |
| P1 | Rương28410 chưa mở được | Guard hiện yêu cầu rewards trùng đúng4parts. Nguồn có item28416 thứ5. Cần validate riêng reward hiệu ứng và giữ transaction/receipt. |
| P1 | Slot306 chưa dùng được | Client Việt thiếu beginEffectId/UI; server từ chối mặc28416 với WHOLE_SUIT_REQUIRED dù đã sở hữu. Phải tách quyền bật hiệu ứng khỏi mặc mảnh nguyên bộ. |
| P1 | Nhánh đặc biệt28340 | Native Việt trả mảnh thường khi yêu cầu special; backend trả lỗi color100–104 ngay cả khi đã cấp đủ mảnh trong RAM. Cần protocol/preset/sync và ownership của nhánh. |
| P1 | Mua áo tắm cấp0 bị từ chối | 29810 hiện có và29820 mới, đủ456×30 vẫn ACK-1, tiền được giữ. Handler1803 chặn isSuit3/color0; sau cấp ownership trong RAM thì mặc preset999 được. |
| P1 | Tăng trần sao màu | Có thêm50 dòng nhưng chưa chứng minh UI/handler/attribute aggregation dùng đúng tổng sao; kiểm cấp150/151/200 và hồi quy bộ liên động/bathrobe. |
| P1 | Icon/hiệu ứng unresolved | Có tên cấu hình không nằm trong manifest/pack, bao gồm các alias cũ; phải trace renderer hoặc fallback đúng loại trước nghiệm thu. Không tự lấy ID gần kề. |

Trong fixture cập nhật config cô lập, bốn rương28310/28370/28380/29280 mở và mặc được; 25 ngoại quan lẻ được grant ownership. Đây **không phải** xác nhận hình ảnh/hiệu ứng hiển thị đúng hoặc đủ hành vi shop/giftcode production.

## 7. Tài nguyên đã lấy và kiểm tra

- Đã resolve đồ thị 5,443 key tài nguyên file và 3,674 entry pack liên quan toàn hệ thống; so sánh theo manifest và payload pack.
- File: {'new-key': 319, 'same-url': 5085, 'changed-url': 39}; pack: {'same-payload': 3374, 'changed-payload': 18, 'new-key': 282}.
- Bộ chọn cập nhật: **394 file**, 60,769,394 byte (~60.8 MB); 28 file đã có local được xác minh CRC và tái dùng. Tất cả file đã kiểm SHA-256 và CRC từ tên manifest; 270 PNG kiểm chunk CRC + giải nén IDAT, không phải render gameplay.
- Đã trích 334 entry gốc vào 3 pack riêng atlas/skel/plist, giữ nguyên từng payload. Khi tích hợp phải merge entry, không thay pack toàn game.
- Có 50 chuỗi tài nguyên ở phần thay đổi chưa resolve trực tiếp. Danh sách trong resource-audit.json; một số là placeholder/alias/hiệu ứng tùy chọn đã có từ nguồn. Chưa được tính là lỗi download.
- Ngôn ngữ: 2900 ID được tham chiếu trong cấu hình đã chọn, 43 ID chưa có bản Việt. Cần dịch bổ sung và rà chuỗi UI mới trong bundle riêng; không thay mọi text Việt bằng tiếng Trung.
- Chưa kiểm trực quan toàn bộ ảnh, animation, âm thanh; chưa kết luận tất cả tài nguyên trong gói hoạt động với engine Việt.

## 8. Thứ tự thực hiện cập nhật

| Đợt | Công việc | Điều kiện qua |
|---|---|---|
| 0 | Chốt mốc source/config và nhóm diff; tạo candidate độc lập | Hash baseline và manifest khớp, không import bảng ngoài thời trang |
| 1 | Sửa tính attrs/ownership,1812,áo tắm0,slot306,special color | Negative/replay/save failure/expiry tests đạt; người chưa sở hữu không tăng chỉ số hay mặc được |
| 2 | Merge6bộ+102dòng+13bảngliênquan và ngôn ngữ | Parent/parts/appearance/reward mapping đạt; giữ delta khác đã có ở bản Việt |
| 3 | Merge manifest và selected pack, xử lý UI/renderer mới | Nam/nữ,0–4/special100–104,begin effect,theme2,bubble động render đúng |
| 4 | Đối chiếu gameplay kỹ năng và50bậc sao | Quyết định rõ43effect thay đổi, không áp số/loại hiệu ứng mù; damage/stat tests có oracle |
| 5 | Cập nhật catalog GM/webshop/giftcode/mail theo ID đã sẵn sàng | Chỉ phát item hỗ trợ; nhận≠mở; trùng đổi đúng swaps; không tự đổi gói bán/giá |
| 6 | QA hoàn chỉnh và phát hành có backup/CAS | Handler+native+browser+WS S2→S1; relog,preset,hot spring,timed,màu,rollback; không repair lịch sử tự động |

Chính sách mặc bộ thường/phối lẻ hiện tại, patch đánh xa và cơ chế receipt phải được giữ. Không cấp bù/di chuyển dữ liệu người chơi trong gói content. Kênh nhận mới (shop/sự kiện) cần xác định nơi phát hành dựa trên thiết kế hiện tại, không bê nguyên lịch thanh toán/sự kiện Trung.

## 9. Danh mục đầy đủ 65 khai báo bộ

Số biến thể là số row cấp/màu cơ bản, chưa cộng nhánh special. Có bộ mặc định/hệ thống không phải rương thương phẩm.

| ID | Tên Việt hoặc tên gốc | Loại | Việt→Trung | Tình trạng |
|---|---|---|---|---|
| 28000 | Bộ mặc định/hệ thống | Bộ thường | 3→3 | Có sẵn |
| 28010 | Thỏ Tiên | Bộ liên động/nâng cấp | 1→1 | Có sẵn |
| 28020 | Hàng lang | Bộ liên động/nâng cấp | 1→1 | Có sẵn |
| 28030 | Ngỗng | Bộ liên động/nâng cấp | 1→1 | Có sẵn |
| 28040 | Phượng Cầu Hoàng | Bộ liên động/nâng cấp | 1→1 | Có sẵn |
| 28050 | Hoàng Luyến Chi | Bộ liên động/nâng cấp | 1→1 | Có sẵn |
| 28060 | Bạch Tố Trinh | Bộ liên động/nâng cấp | 4→4 | Có sẵn |
| 28070 | Hứa Tiên | Bộ liên động/nâng cấp | 4→4 | Có sẵn |
| 28080 | Tiểu Thanh | Bộ liên động/nâng cấp | 4→4 | Có sẵn |
| 28090 | Pháp Hải | Bộ liên động/nâng cấp | 4→4 | Có sẵn |
| 28100 | Chí Tôn Bảo | Bộ liên động/nâng cấp | 4→4 | Có sẵn |
| 28110 | Tử Hà Tiên Tử | Bộ liên động/nâng cấp | 4→4 | Có sẵn |
| 28120 | Tôn Ngộ Không | Bộ liên động/nâng cấp | 4→4 | Có sẵn |
| 28130 | Bạch Tinh Tinh | Bộ liên động/nâng cấp | 4→4 | Có sẵn |
| 28140 | Anh ca phượng vũ | Bộ liên động/nâng cấp | 1→1 | Có sẵn |
| 28150 | Thu Phong Lạc Diệp | Bộ liên động/nâng cấp | 1→1 | Có sẵn |
| 28160 | Lãng đãng bất kham | Bộ liên động/nâng cấp | 1→1 | Có sẵn |
| 28170 | Thu Phong Ô Mộc | Bộ liên động/nâng cấp | 1→1 | Có sẵn |
| 28180 | Tiếu ngạo trần hoàn | Bộ liên động/nâng cấp | 1→1 | Có sẵn |
| 28190 | Trần Ngự Thiên Sơn | Bộ liên động/nâng cấp | 1→1 | Có sẵn |
| 28200 | Lăng Tuyết Trần | Bộ liên động/nâng cấp | 4→4 | Có sẵn |
| 28210 | Ngưng Sương Nguyệt | Bộ liên động/nâng cấp | 4→4 | Có sẵn |
| 28220 | Dương Sương Thần | Bộ liên động/nâng cấp | 4→4 | Có sẵn |
| 28230 | Âm Tuyết Ly | Bộ liên động/nâng cấp | 4→4 | Có sẵn |
| 28240 | Sư cổ kinh hồng | Bộ đổi màu | 5→5 | Có sẵn |
| 28250 | Ninh Thái Thần | Bộ liên động/nâng cấp | 4→4 | Có sẵn |
| 28260 | Nhiếp Tiểu Thiến | Bộ liên động/nâng cấp | 4→4 | Có sẵn |
| 28270 | Yến Xích Hà | Bộ liên động/nâng cấp | 4→4 | Có sẵn |
| 28280 | Bà ngoại | Bộ liên động/nâng cấp | 4→4 | Có sẵn |
| 28290 | Cái thế 1 đao | Bộ liên động/nâng cấp | 1→1 | Có sẵn |
| 28300 | Trùng chấn Hà Sơn | Bộ liên động/nâng cấp | 1→1 | Có sẵn |
| 28310 | Trần Diệu Thương Khung (tạm dịch) | Bộ liên động/nâng cấp | 0→1 | Thêm mới |
| 28320 | Kaká - Con trai của cỏ | Bộ kết liễu | 1→1 | Có sẵn |
| 28330 | Kaka Milan Quý Ông | Bộ kết liễu | 1→1 | Có sẵn |
| 28340 | Mực nhuộm ngân hà | Bộ đổi màu | 5→5 | Cần cập nhật nhánh đặc biệt |
| 28350 | Mục Trần | Bộ liên động/nâng cấp | 4→4 | Có sẵn |
| 28360 | Lạc Ly | Bộ liên động/nâng cấp | 4→4 | Có sẵn |
| 28370 | Viêm Đế Tiêu Viêm | Bộ liên động/nâng cấp | 0→5 | Thêm mới |
| 28380 | Võ Tổ Lâm Động | Bộ liên động/nâng cấp | 0→5 | Thêm mới |
| 28410 | Tinh La Trùng Ảnh (tạm dịch) | Bộ kết liễu | 0→1 | Thêm mới |
| 28990 | Công tử | Bộ liên động/nâng cấp | 1→1 | Có sẵn |
| 29000 | Thiên Ma Truyền Kỳ | Bộ thường | 3→3 | Có sẵn |
| 29010 | Mặt quỷ phong thái | Bộ thường | 3→3 | Có sẵn |
| 29020 | Tinh Tuyệt Mê Hoặc | Bộ thường | 2→2 | Có sẵn |
| 29030 | Cửu Thiên Phong Lôi | Bộ thường | 3→3 | Có sẵn |
| 29040 | Thời đại hàng hải | Bộ thường | 8→8 | Có sẵn |
| 29050 | Kiếm Tiên Phàm Trần | Bộ thường | 2→2 | Có sẵn |
| 29060 | Tinh Hải Ma Tổ | Bộ thường | 2→2 | Có sẵn |
| 29070 | Tiên nhân Thanh Khâu | Bộ thường | 2→2 | Có sẵn |
| 29080 | Đan Thanh Dật Mộng | Bộ thường | 2→2 | Có sẵn |
| 29090 | Xích Uyên Tư Tụ | Bộ thường | 2→2 | Có sẵn |
| 29100 | Xích Liên Linh Đồng | Bộ thường | 2→2 | Có sẵn |
| 29150 | Huyết Yểm Cuồng Đạo | Bộ thường | 2→2 | Có sẵn |
| 29160 | Điểm Mặc Đoạt Hồn | Bộ thường | 2→2 | Có sẵn |
| 29170 | Huyết Sát Lệ Ảnh | Bộ thường | 2→2 | Có sẵn |
| 29180 | Nguyệt Sương Ngân Nha | Bộ thường | 2→2 | Có sẵn |
| 29240 | Thanh Phong Ẩn Khách | Bộ thường | 2→2 | Có sẵn |
| 29250 | Kim ngọc chiêu hoa | Bộ thường | 2→2 | Có sẵn |
| 29260 | Thanh Nguyên Diệu Đạo | Bộ thường | 1→1 | Có sẵn |
| 29270 | Quải Soái Linh Sinh | Bộ thường | 1→1 | Có sẵn |
| 29280 | Phi Tuyết Nhân Mặc (tạm dịch) | Bộ thường | 0→1 | Thêm mới |
| 29800 | Tịnh Thủy Y | Áo tắm | 2→2 | Có sẵn |
| 29810 | Huyễn mộng vân y | Áo tắm | 1→1 | Có sẵn |
| 29820 | Thương Lan Vân Mộng (tạm dịch) | Áo tắm | 0→1 | Thêm mới |
| 29999 | Thời trang đặc sắc | Bộ thường | 4→4 | Có sẵn |

## 10. File để triển khai tiếp

- Báo cáo này: `_ai_workbench/reports/fashion_system_update_audit_20260909.md`.
- `fashion-inventory.json`: toàn bộ2078dòng với ID,tên,nhóm,parent,status vàrow gốc.
- `fashion-table-deltas.json`: thêm/sửa/xóa của13bảng, có cặp VN/CN cho từng row thay đổi.
- `fashion-cn-tables.json`, `fashion-related-cn.json`, `fashion-language-cn.json`: dữ liệu nguồn theo phạm vi.
- `native-method-reference.json`: hàm client gốc liên quan special/effect để đối chiếu, không phải patch.
- `resource-audit.json`, `assets-download.json`, `asset-verification.json`: tài nguyên, nguồn URL và hash.
- `compat-fixture.json`: kết quả handler/nativeRAM; `live-baseline.json`, `baseline-table-comparison.json`: đối chiếu live.
- Mọi artifact nằm trong `_ai_workbench/temp/fashion_cn_recovery_20260909/`; source gameplay/DB/live chưa đổi ở lượt này.
- Gói ZIP là **dữ liệu nguồn để tích hợp**, không phải bản thả vào server chạy ngay.
