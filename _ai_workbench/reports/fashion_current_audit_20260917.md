# Kiểm tra thời trang hiện hành — 17/09/2026

## Kết luận và phạm vi

Còn lỗi client/server đã tái hiện được: addon bỏ khóa ngày mở, nhánh đặc biệt của Mặc Nhiễm Tinh Hà, và server chặn nhầm hiệu ứng kết liễu Kaká. Chưa có căn cứ gọi toàn bộ 65 entry thời trang, hoặc toàn bộ danh sách ngoại quan ở hội thoại, là lỗi.

Chỉ đọc VPS `103.116.105.154`, HTTP game cổng 81 và mã/config đang cài. Không đăng nhập/chơi bằng tài khoản, không cấp vật phẩm, ghi database, sửa game hay restart. Các lệnh mở/mặc/nâng cấp chạy trong process Node biệt lập với PlayerService lưu RAM, logger giả và network bị chặn; không gửi RPC tới phiên người chơi. Chỉ ghi tool và bằng chứng local trong `_ai_workbench`.

S1–S4 online, dùng chung `/linhhoasu/lhs/newServer`; PID/restart không đổi trong lúc probe. Client public `main.min_drop100.js` SHA-256 `9b030e70cdfd3ecd1655df13b9e13cb96f2fcf81761ef969fff9a4f8a58708cb`. File public trùng file VPS, index nạp các addon thời trang. Config client `assets/excel/config_fashion_20260909.bin` có 65 `FashionDressConfig` và 2.078 `FashionConfig`; 13 bảng Fashion cùng AssetsConfig/AppearanceConfig được so hash đều khớp kết quả loader server trong probe.

## Lỗi đã xác nhận bằng mã đang phục vụ

### 1. Addon hiển thị từ ngày đầu không cài được hook

- File `linhhoasu/webgame/game/js/lhs-fashion-day1-v1.js:12` lấy `manager.FashionModel.prototype`.
- Bootstrap native thực tế gán `this.FashionModel=new qV`; constructor được export riêng `v.FashionModel=qV`. `GlobalManager.FashionModel` là instance, không có `.prototype`.
- Replay đúng hình dạng native: `LhsFashionDay1V1.installed=false`, hàm cũ còn nguyên, lịch retry tiếp tục. Không thể dùng việc file HTTP trả 200 làm bằng chứng hook đã cài.
- Khi chưa sở hữu và server còn thiếu ngày, 46 biến thể thuộc 19 bộ tiếp tục bị gate. Kiểm bằng native `checkShowTypeOpenDay` tại ngày 1: 46/46 trả false.
- Các bộ: `28240,28340,29020,29040,29050,29060,29070,29080,29090,29100,29150,29160,29170,29180,29240,29250,29260,29270,29280`.
- 28340 yêu cầu ngày 8; 29020 ngày 29/43; 29050 màu 0 ngày 50; phần còn lại ngày 57. Với 29040 chỉ các màu 1–7 nằm trong nhóm gate. Đây là lỗi thực hiện chính sách hiển thị từ ngày đầu; không phải mọi bộ trong nhóm đều không mặc được khi đã sở hữu.

### 2. Mặc Nhiễm Tinh Hà 28340: nhánh đặc biệt 100–104 chưa tương thích client

- `lhs-fashion-content-v1.js` cũng lấy sai `manager.FashionModel.prototype`. Cờ `installed=true` của addon vẫn được bật dù `GetSuitFashions` không được bọc.
- Replay từ public main + public addon: gọi `GetSuitFashions(28340,100..104)` đều ném `TypeError: Cannot read properties of undefined (reading 'fashionIds')`.
- Native `getAllSuit()` chỉ liệt kê màu 0–4; `getShowInfoSuit()` nhận bản đồ bốn mảnh special đã mặc trả `{suitId:-1,dyeing:0}`. Không có native `suitHasSpFashion`.
- Backend vẫn mở quyền và mặc nhánh special thành công trong RAM. Cần phân biệt lỗi client chọn/nhận diện/preview với lỗi backend cấp quyền. Việc server trả ACK thành công không chứng minh giao diện native hỗ trợ đủ nhánh này.

### 3. Tinh La Trùng Ảnh 28410: thiếu đường client cho hiệu ứng vào trận 28416

- Config đã có `FashionEndDressConfig[28410].beginEffectId=28416`, item thuộc slot `306`.
- Public main có 0 reference `beginEffectId`, không có `onClickOpeningEff`/`updateOpeningEff`; mapping `FashionTypeToShowType` không có slot 306. Các addon thời trang đang nạp không bổ sung phần xử lý này.
- Đây là thiếu tích hợp UI/hiệu ứng vào trận; rương và bốn mảnh outfit của 28410 vẫn qua probe backend. Chưa có video hoặc native visual E2E để đánh giá các hiệu ứng còn lại của bộ.

### 4. Ảnh Kaká: server chặn nhầm hiệu ứng kết liễu type 304

**Cập nhật sau audit:** lỗi304 đã được sửa/deploy S1–S4; xem `kaka_end_effect_release_20260917.md`. Các chi tiết dưới đây mô tả baseline trước sửa, không còn là kết luận current cho slot304.

- Ảnh người dùng: bộ `28320` Kaká – Con trai của cỏ, checkbox Đeo dưới icon kết liễu. `FashionEndDressConfig[28320].endEffectId=28324`; `FashionConfig[28324].type=304`, `dressId=28320`; bộ cha có `isSuit=4`.
- Native `DisguiseSuitPanel.onClickESCheckBox` kiểm tra đã sở hữu effect rồi gọi `sendChangeFshion(28324,304)`. Request thực tế dựng bởi hai hàm native: `tag1801`, `{id:28324,type:304,set:0}`. Nếu chưa sở hữu effect, client hiện thông báo language30033352 và không gửi request.
- `src/handlers/fashion.js:398` chấp nhận quyền sở hữu và type hợp lệ, nhưng sau đó dòng407 chặn mọi item có cha `isSuit` thuộc `[1,2,4]`, trả `{result:-1,code:'FASHION_WHOLE_SUIT_REQUIRED'}`. Slot306 được tách riêng ở dòng402; slot304 không có ngoại lệ và bị coi như mảnh trang phục phải mặc nguyên bộ.
- `lhs-fashion-gear-v1.js:204` đổi mọi response thất bại sang cùng câu “Không thể thực hiện: kiểm tra quyền sở hữu, đủ bộ và tài nguyên.”, đúng câu trong ảnh; câu này không chứng minh người chơi thiếu tài nguyên.
- Tái hiện trên mã/config live trong RAM: sở hữu đủ4mảnh + effect, mặc nguyên bộ ACK0, sau đó bật effect28324 vẫn ACK-1 với đúng code trên; 0save tại thao tác bị từ chối, player giữ nguyên. Chỉ sở hữu effect cũng bị cùng guard; bỏ hiệu ứng `id=-1,type304` được ACK0.
- Bộ `28330` Kaká Milan Quý Ông / effect`28334` bị cùng lỗi. Tổng8case trên2bộ và1case đối chứng slot306: kết quả đúng dự đoán,5save đềuRAM,networkAttempts0,productionWrites0. Không dùng tài khoản thật và không gửi RPC lên game.
- Rương28320/28330 chỉ cấp4mảnh, effect có ownership riêng. Đã xác nhận lỗi vẫn xảy ra khi ownership effect đầy đủ; không tự bổ sung effect vào reward hoặc cấp lại người chơi.
- Kiểm lại live SHA của fashion handler, RoleAppearanceService, FashionTransactionService, public main và addon gear: không đổi so với lần audit trước. Nguyên nhân này độc lập với lỗi addon prototype ở mục1–2.
- Khoảng trống audit trước: test338case kiểm mặc nguyên bộ; nhóm252ngoạiquan không gồm type304. Các PASS đó không bao phủ checkbox hiệu ứng kết liễu. Chưa kiểm phần render/combat sau bật effect vì server hiện từ chối.
- Hướng sửa khi được yêu cầu: xử lý type304 như một lựa chọn effect riêng, giữ kiểm ID/type/ownership và persistence/preset; không bỏ guard toàn bộ mảnh nguyên bộ. Lượt chẩn đoán này chưa sửa/deploy.
- Bằng chứng: `temp/fashion_current_audit_20260917/kaka-end-effect.json`; tool `tools/audit_kaka_end_effect_20260917.js`.

## Điểm cần theo dõi, chưa tính là bộ hỏng

- 44 mảnh có `FashionConfig.colorId` khác key của biến thể chứa nó: 32 mảnh thuộc `28240,28340,29000,29010,29040`, 12 mảnh thuộc entry đặc biệt `29999`. Mặc/normalize các biến thể vẫn PASS; không tự suy ra 44 lỗi mặc hay 44 bộ lỗi từ metadata này. 28340 gồm cả màu 4 thường và special 104.
- Hai case mở màu `29999/2` và `29999/3` trả -1 vì không có cost để mở qua handler màu; showType lần lượt 0 và 2. Đây là entry đặc biệt/điều kiện cấp khác, không phải bằng chứng skin thường bị lỗi.
- Bảng tên trong addon nội dung còn 7 nhãn chứa `Bộ NaN` (`11291,11837,11838,12078,23046,23047,23048`) và 20 nhãn mảnh special dùng `Bộ 28340`. Xác nhận placeholder trong mã, chưa kiểm trực tiếp nhãn sau đầy đủ lifecycle tải LanguageConfig trên UI.
- Danh sách ở hội thoại lấy một phần catalog ngày 04/09. Các nhãn lỗi trong audit đó đã có nhiều bản sửa sau ngày 05–09/09; không dùng làm danh sách lỗi hiện tại. Các tổng ngoại quan cánh/pháp tướng/thú cưỡi cũ cũng chưa cộng đủ các item CN đã bổ sung.

## Kiểm chứng đạt và giới hạn

| Phạm vi | Kết quả hiện tại |
|---|---|
| Rương cố định: mở, trừ hộp và nhận đủ quyền | 61/61 PASS trong RAM |
| Mặc và normalize sau clone dữ liệu | 338/338 PASS; 169 biến thể × 2 lựa chọn giới tính/võ học |
| Nâng sao liên động | 62/62 PASS trong RAM |
| Mở màu/áo tắm có đường hợp lệ | 46/46 PASS; 2 case entry 29999 nêu riêng |
| Nhận và chọn ngoại quan cánh/thú cưỡi/pháp tướng/vũ khí | 252/252 PASS trong RAM; không phải QA toàn bộ collection gameplay |
| Native lấy mảnh cho các biến thể thông thường | 164/164 PASS trong VM |
| Config Fashion client/server | 13/13 bảng khớp hash; AssetsConfig/AppearanceConfig cũng khớp |
| Manifest và file | 3 manifest public khớp disk; 44.774 key registry, không có URL khai báo bị thiếu trên disk |
| Model nguyên bộ | 115 reference thân/quần có skeleton + atlas trong registry/pack |
| Hình ảnh/animation trên tài khoản thật, thiết bị thật | Chưa nghiệm thu trong lượt này |

Network attempts của fixture = 0; 759 lần lưu đều vào RAM. Không có production player/DB writes. Sự tồn tại của skeleton/atlas và file không chứng minh mọi animation/bone/texture hoặc cách phối đồ đã hiển thị chuẩn trên thiết bị thật.

## Bằng chứng và bước tiếp theo

- `_ai_workbench/temp/fashion_current_audit_20260917/manifest.json`: process và hash mã đang cài/public.
- `probe.json`: config hiện hành, kết quả từng nhóm RAM và metadata lệch.
- `client-probe.json`: tái hiện lỗi addon, special, slot 306, native methods và thống kê resource.
- `client-config.json`, `resources.json`, `client/`: bằng chứng config/resource và bản client đã kiểm.
- Tool: `audit_fashion_current_20260917.py`, `audit_fashion_current_20260917.js`, `audit_fashion_client_20260917.js` trong `_ai_workbench/tools`.

Nếu được yêu cầu sửa: ưu tiên sửa đúng đối tượng prototype ở hai addon, hoàn thiện đường UI/preview/nhận diện special 28340 và hiệu ứng 28416; sau đó kiểm native trên tài khoản QA và tài nguyên thật. Không cần cấp lại skin hoặc tự sửa ownership người chơi chỉ từ kết quả audit này. Lượt này chưa thực hiện sửa/deploy.
