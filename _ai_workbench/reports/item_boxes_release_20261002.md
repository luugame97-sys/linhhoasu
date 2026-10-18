# Sửa các rương tương tự 100802 — 02/10/2026 10:37–10:41 ICT

## Đã triển khai

- Rà catalog live: 183 vật phẩm thưởng trung gian type99 và 154 rương type102. Không coi tất cả type99 là rương lỗi; nhiều mã được mở ngay bởi luồng thưởng riêng.
- Sửa/mở đường dùng cho **95 ID**: **68 mã bổ sung resolver phần thưởng**, **27 mã có handler cũ nhưng thiếu đường dùng client**. Client thêm đúng **61 AssetsUseConfig còn thiếu**, giữ 34 cấu hình đã có. Các mã đã xác minh và đang bị ẩn trong túi được hiện lại khi có tồn kho.
- Thay 3 file server + index và addon client mới. S1–S6 rolling restart một lượt; 6/6 ready Mongo/Redis true. Admin/dist/bot/supervisor giữ PID/restart. Read-back5/5 file và public/loopback hash khớp.
- Không sửa player/DB, không phát bù hoặc mở hộ rương. Rương100802 và bản tăng sao/OldTrek trước giữ nguyên.

## Nguyên nhân đã tái hiện

`100511` và `100721` thiếu AssetsUseConfig, handler vẫn trừ rương rồi không vào nhánh phát thưởng. Fixture source live mở2 trả result0, mất2 rương, reward arrays rỗng. Type102 chưa có pool như100701 lại bị từ chối đúng và giữ rương.

Đã bổ sung resolver danh sách cụ thể, kiểm metadata nguồn/đích và tập ID phần thưởng đầy đủ trước consume. Rương thiếu cấu hình/không có nhánh phát thưởng hợp lệ bị từ chối trước trừ. Pool thay đổi hoặc thiếu một mục cũng bị từ chối, không âm thầm đổi xác suất.

## Nhóm đã sửa

| Nhóm | Số mã | Ví dụ |
|---|---:|---|
| Thần văn | 6 | 100501–100503,100511–100513 |
| Linh trục cấp1–9 | 18 | 100701–100709,100721–100729 |
| Yêu linh và mảnh theo phẩm | 6 | 100023–100025,100033–100035 |
| Thần binh đồng hành | 6 | 100061–100063,100071–100073 |
| Bí bảo theo phẩm/chủ đề | 26 | 100171–100174,100233,100253 và các mã tương ứng |
| Hộp nguyên liệu cố định | 6 | 406,408,432,434,444,446 |
| Pet/Võ hồn/Huyết mạch/Thần binh/Hồn ngọc có handler cũ | 27 | 100001–100007,100121–100125,100151–100156,100051–100053,100091–100096 |

Danh sách đủ ID/tên: `_ai_workbench/reports/item_boxes_fixed_20261002.txt`.

Các rương ngẫu nhiên mới dùng phân phối đều trong đúng phẩm/cấp được mô tả, theo quy ước tương thích đã dùng cho100802; **không phải trọng số server CN gốc được khôi phục**. Bí bảo Đồng/Bạc giữ materialType1/2; Bí bảo không ghi chủ đề chọn toàn bộ cùng phẩm. Không suy luận generic100231/100251 thành materialType3/4. Thần binh đồng hành dùng ArtifactConfig.type2 và AssetsConfig.type16. Các mảnh nhận1 mảnh/lần, không nhận số lượng ghép thân.

Hộp cố định dùng số lượng từ mô tả ngôn ngữ hiện hành và ID nguyên liệu khớp catalog:406=(401×4,402×4,403×3),408=(401×8,402×8,403×6,404×2); tương tự432/434 nhóm427–430 và444/446 nhóm439–442. Các hộp này ở trong túi để người chơi mở; bản này chưa thay luồng nhận thành auto-open như mô tả gốc.

## Mã chưa mở lại

Không tự đặt phần thưởng cho các mã thiếu cơ sở:

- **95001:** rương thách đấu Bang hội; GuildBossConfig phát rương nhưng không có bảng loot bên trong.
- **101390–101399 và nhóm thủy thủ101321:** thiếu mapping thành→pool và grant/đổi trùng đồng bộ đầy đủ.
- **101352–101467, các mã mảnh công trình:** có trong thưởng nhưng thiếu module/bảng công trình tương ứng; không thay bằng vật liệu khác.
- **100021/100022/90021/90022 và các rương Yêu linh phẩm2/3:** catalog Yêu linh hiện chỉ có phẩm4/6/7, pool tương ứng rỗng.
- **100054 và các túi trộn phẩm hoặc thêm thưởng hiếm** như407/433/445; không có trọng số chuẩn.100054 bị loại khỏi whitelist mới, giữ nguyên handler legacy ở các đường đã tồn tại.
- Những rương khác có pool chưa xác minh như100139/94802 cần bảng thưởng/tỷ lệ cụ thể; bản này không gọi là đã sửa toàn bộ337 mã.

Guard mới ngăn các request thiếu route được trừ rồi trả thưởng rỗng; không biến các mã trên thành rương dùng được.

## Kiểm chứng

- `test_verified_boxes_20261002.js`: **435 ca PASS**, config và các module phụ thuộc từ snapshot production; mở1/3/55, kho/ownership đúng loại, sync native, sai metadata/mất pool/count sai, giữ100802, lựa chọn90151→100721 không nhân đôi. Socket bị chặn, save giả lập; không phải gameplay E2E trên người thật.
- `test_item_boxes_client_20261002.js`: **61 route** qua native getBagItems→ItemTips→ItemUseView→1300; thử tồn7, chọn55/3 theo fixture, vượt kho không gửi; giữ cấu hình chọn quà101/104/106/110 và điều kiện/giới hạn có sẵn. Addon khớp chính xác whitelist95 ID.
- Syntax tất cả candidate PASS; independent review không có blocker. 5 file live/read-back khớp; S1–S6 online hậu kiểm10:41.
- Browser phiên thử riêng tải tới canvas/AX client, log chỉ có autoplay NotAllowedError; chưa mở rương thật trong game. Không tuyên bố mọi ca dùng đồ đã chạy E2E.
- Read-only aggregate kho thật S1–S6 xác nhận có các mã bị ảnh hưởng như100073,100233,100512/513,100701/721; không xuất danh tính người chơi. Số tồn không chứng minh đã mất thưởng trong quá khứ.

## Bằng chứng và khôi phục

- Snapshot/candidate/definitions/inventory/validation/postcheck: `_ai_workbench/temp/item_boxes_20261002/`.
- Receipt server `release_server/deployment.json`, static `release_client/deployment.json` trong thư mục trên.
- Backup server `/linhhoasu/_ai_workbench/backups/item_boxes_20261002_103747`; client `/linhhoasu/_ai_workbench/backups/item_boxes_client_20261002_104015`.
- Hash server: item`a642e187…`, Random`d59beb95…`, RewardGrant`a32d111f…`; client index`dba1ad83…`, addon`337d43a6…`.
- Rollback: so post-hash/CAS với receipt, stage/atomic rename 3 file backup vào đúng đường dẫn, rolling restart từng node chờ ready; restore index với cache key mới nếu cần. Nếu hash đã đổi, dừng ghi đè và đối chiếu thay đổi mới. Không phục hồi DB/người chơi.
- Canonical source local từng có drift; candidate được dựng từ live. Không deploy cả thư mục local cũ. Addon mới đã đặt đúng `linhhoasu/webgame/game/js/lhs-item-boxes-v1.js`.

Người chơi reload/đăng nhập lại để có đường mở mới trong túi đồ.
