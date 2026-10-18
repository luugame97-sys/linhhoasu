# Audit Uy áp / Hồn thú — 01/10/2026

## Kết luận

1. **Chốt mở Hồn thú ngăn người chơi tăng Uy áp hiện tại.** System 231 yêu cầu mở Pet 206, nhân vật **cấp >=135**, ngày server **>=43**. S1–S6 chưa đủ ngày; không node nào force-unlock 231, bỏ qua ngày cho 231 hoặc disable riêng 231.
2. **Màn chi tiết pet thiếu cập nhật khi Uy áp đổi.** `PetDetailView.OnOpen` không subscribe `PET_SOUL_STAR_UPDATE` / `PET_SOUL_DATA_UPDATE`; màn đang mở có thể giữ trần cũ tới khi được refresh. Đã tái hiện bằng đúng hàm client với event bus giả lập; chưa quan sát lifecycle thực trên trình duyệt đăng nhập.
3. **Chưa thấy lỗi công thức Uy áp/trần cấp hoặc nhánh tăng sao hợp lệ trong các ca đã kiểm.** Client và server tính cùng kết quả. Đây không phải chứng nhận toàn bộ Hồn thú hay gameplay E2E.

Bản trần 1000 trước đó chỉ thay giới hạn stage cuối; chưa giải quyết điều kiện mở Hồn thú để người chơi đạt stage đó. Hướng dẫn trước đây “vào Hồn thú nâng sao ngay” đã bỏ sót chốt ngày 43. Ảnh cấp 210 không chứng minh chính xác stage 3; các player trong phạm vi audit thực tế đang **stage 5**.

## Bằng chứng live read-only

Snapshot **01:19 ICT ngày 01/10/2026**, VPS `103.116.104.165`. Đọc Mongo bằng driver trực tiếp, chỉ `find` với projection, `maxTimeMS=5000` và giới hạn 1.000 row/server; không import model có seed, không gọi RPC hay savePlayer production. Số liệu dưới đây chỉ gồm nhân vật sở hữu pet phẩm 7/9/10 cấp >=200, không phải toàn bộ người chơi.

| Server | Ngày server theo runtime | Nhân vật trong phạm vi | Đã mở Hồn thú | Có pet đúng cấp 210 |
|---|---:|---:|---:|---:|
| S1 | 33 | 13 | 0 | 1 |
| S2 | 26 | 8 | 0 | 2 |
| S3 | 18 | 5 | 0 | 1 |
| S4 | 15 | 3 | 0 | 0 |
| S5 | 11 | 7 | 0 | 1 |
| S6 | 4 | 3 | 0 | 2 |
| Tổng | | 39 | 0 | 7 |

- Không truy vấn nào chạm giới hạn 1.000 row. Cả 39 row đều 3 Hồn thú, sao 0, Uy áp **420**, stage **5**, trần pet phẩm 7/9/10 **210**; 33/39 nhân vật đã đạt cấp 135 nhưng vẫn khóa Hồn thú. Không có row soul sai config/ngoài bậc sao hoặc ID trùng trong nhóm này.
- `ensurePetSoulInfo` khởi tạo `210101/210201/210301`, sao 0; Uy áp tương ứng **80+130+210=420**. Cộng mặc định này vẫn có hiệu lực tính trần pet trước khi menu Hồn thú mở.
- Cả sáu node dùng cùng cwd `/linhhoasu/lhs/newServer`, không override `CONFIG_BIN_PATH`. Ba fashion overlay hiện không chứa Pet/Coercion/SystemConfig.
- Hash config server/client đều `01e4adbdd5ba7283f0bebbf525eb69a27434a8dcaf15d57189a39d0d10663a25`; pet handler `e6653487…`, live pet-soul handler `d1e7972a…`, upgrade handler `48798f66…`, client bundle `1ae070b1…`.
- Lưu ý source local `src/handlers/pet-soul.js` cũ hơn production; fixture dùng bản `_ai_workbench/temp/pet_soul_candidate_20260923/pet-soul.js` có SHA-256 khớp live. Không đồng bộ/ghi đè source production.

## Kiểm thử cách ly

`test_coercion_audit_20261001.js`: **7/7 ca kiểm chứng đạt**; một ca là tái hiện lỗi refresh UI, không có nghĩa hệ thống không còn lỗi. Source/config pin theo SHA-256; savePlayer giả lập, không có network/DB import hay player thật.

- Trạng thái mặc định: 420 điểm, stage 5, cap 210 ở cả client/server.
- Gọi đúng hàm client tăng sao → handler server → callback client: Hồn `210101` sao 0→1→2 làm Uy áp **420→460→500**, cap **210→210→220**. Dùng vật liệu 263 theo ngưỡng đủ 100%: lần đầu 23, lần sau 37; đồng bộ item `1202` và sao `6901` đúng. Sau đó pet **210→211** được chấp nhận.
- Chạy **185 lần chuyển sao hợp lệ** qua 25 Hồn thú: mọi lần cap client/server khớp. Khi đủ toàn bộ Hồn thú max sao, Uy áp tối đa **35.125**, cap 1000. Pet **999→1000** thành công; **1000→1001** bị chặn, không trừ thêm vật liệu.
- Thiếu điểm nguyên liệu, thiếu tồn kho, dùng sai vật liệu: bị từ chối, không đổi sao/không gọi lưu/không trừ vật liệu trong fixture.
- Biên mở khóa: level134/day43 fail; level135/day42 fail; level135/day43 pass; level200/day33 fail.
- 51 ngưỡng stage khớp; phẩm 6 giữ cap 200. Stage49: Uy áp33500/cap390; stage50: Uy áp35000/cap1000. Đây là bước nhảy cấu hình của bản mở rộng, không phải tăng đều đến1000; ngưỡng35000 gần mức tối đa35125 nên đòi tiến độ Hồn thú gần hoàn chỉnh.
- UI đang mở: cap thực đổi210→220 sau tăng sao nhưng không nhận sự kiện refresh; gọi update/mở lại mới hiển thị220. Chưa xác nhận mọi đường đóng/mở panel ngoài fixture.

## Log và giới hạn

- Log đọc tới khoảng01:24 ICT chưa thấy exception nêu `PetSoul`, `coercion`, `pet-soul.js` hay tag6901. Một request triệu hồi6920 lúc01:11:59 chậm746ms; không phải bản ghi thất bại tăng sao.
- Log hệ thống vẫn có các timeout/MongoDB timeout/EPIPE ở tag khác; không gán chúng là nguyên nhân Uy áp. Không có log mọi giao dịch tăng sao thành công/thất bại nên thiếu log6901 không chứng minh không ai đã gọi.
- Chưa đăng nhập người chơi hay thực hiện tăng sao trên production; không kết luận riêng tài khoản trong ảnh vì chưa có định danh/server.

## Hướng sửa đề xuất — chưa triển khai

- Nếu muốn người chơi vượt210 ngay: thay điều kiện ngày của **riêng System231**, giữ cấp135 và Pet206; đồng bộ cấu hình client/server và kiểm các cửa triệu hồi/tăng sao. Không đổi ngày mở toàn server vì tác động tới các sự kiện khác.
- Bổ sung refresh `PetDetailView` cho cập nhật sao/dữ liệu Hồn thú để nút nâng cấp nhận trần mới ngay.
- Không cần đổi công thức cộng Uy áp hoặc sửa lại manifest Spine để giải quyết chốt này. Mốc35000/độ dốc390→1000 là lựa chọn cân bằng riêng cần thống nhất nếu muốn đổi.

Evidence: `_ai_workbench/temp/coercion_audit_20261001/live.json`, `fixture.json`. Tools: `_ai_workbench/tools/audit_coercion_20261001.py`, `audit_coercion_live_20261001.js`, `test_coercion_audit_20261001.js`.
