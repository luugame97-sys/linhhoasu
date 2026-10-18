# Phương án túi tự chọn Hồn ngọc cấp6–12 — 05/10/2026

## Trạng thái / phạm vi

Chỉ kiểm tra live source/config và tính phương án; chưa thêm/bật SKU, sửa giá, sửa handler, restart hoặc ghi player/DB. Không thử mua/mở túi trên nhân vật thật.

## Giá hiện tại và công thức được xác minh

- Tiệm Ngọc/tab10 có6SKU: túi ngẫu nhiên cấp1/3/5 giá1/9/81 Hồn ngọc tệ (item62), hoặc40/360/3.240 Nguyên bảo (item1). Ba mốc có cùng giá trị nguyên liệu:40NB cho một viên cấp1.
- Cấp1→6:3 viên cùng ID lên1 viên kế tiếp. Cấp6→7 dùng2A6+2B6, tổng4viên. Có6cặp từ4loại cơ bản; cấp8→12 dùng3viên cùng dòng cấp trước.
- Nâng hợp lệ chắc chắn thành công;3902/3903/3906 compose=true không thu Nguyên bảo. GemBase.price200/500 là phí phân giải compose=false, không cộng vào giá nâng.
- Giá trị nguyên liệu: P6=3×P5=9.720; P7=4×P6=38.880; từP8 trở lên P(L)=3×P(L−1). Nhân3 xuyên suốt từ cấp1 làm cấp7+ thấp hơn đúng25%.

| Túi cấp | Số ngọc cấp6 tương đương | Số ngọc cấp5 tương đương | Giá theo nguyên liệu NB | Hồn ngọc tệ tương đương |
|---:|---:|---:|---:|---:|
|6|1|3|9.720|243|
|7|4|12|38.880|972|
|8|12|36|116.640|2.916|
|9|36|108|349.920|8.748|
|10|108|324|1.049.760|26.244|
|11|324|972|3.149.280|78.732|
|12|972|2.916|9.447.840|236.196|

Kiểm bằng graph công thức live cho cả40 lựa chọn:4loại cấp6+6loại/mỗi cấp7–12. Cả ba đường mua cấp1/3/5 cho cùng giá trị nguyên liệu. Cấp10 khớp giá lịch sử1.049.760 trong overlay, nhưng SKU cấp10 hiện vẫn tắt theo yêu cầu02/10.

## Phân biệt ngẫu nhiên và tự chọn

Đây là **giá trị nguyên liệu chính xác**, không phải bảo đảm rằng mua đúng số túi ngẫu nhiên sẽ ra đủ một loại cụ thể. Ghép thường yêu cầu cùng ID, recipe cấp7 yêu cầu đúng hai loại. Những viên khác vẫn có giá trị và được giữ, nên cũng không thể coi mọi ngọc lệch loại là mất trắng để tự cộng phí tùy ý.

Đề xuất lấy túi tự chọn6 làm giá gốc9.720NB; tất cả túi tự chọn7–12 bám đúng chi phí mua túi tự chọn cấp thấp rồi dùng công thức hiện có, không chiết khấu/không phí nâng giả. Khi đó7–12 có đường mua nguyên liệu chọn đúng loại với chi phí chính xác bằng bảng. Giá của túi6 là chuẩn định giá theo lượng nguyên liệu của shop, không phải chi tiêu chắc chắn/chi tiêu kỳ vọng để săn một loại từ RNG. Không gọi hai chuẩn này là cùng một giá.

Nếu chủ đích là thu thêm cho quyền chọn loại so với mua RNG, cần chọn chuẩn phí riêng; không có một mức chi tiêu hữu hạn bảo đảm RNG cho ra đúng loại. Chưa tự thêm markup vì yêu cầu là bằng giá mua và nâng.

## Catalog dự kiến

- Dùng túi6/7/8 sẵn có90076/90077/90078; túi10 là100097. Mỗi túi chọn1viên đúng cấp.
- Thêm túi9/11/12 mới. ID90079/100098/100099 chưa có trong Assets/AssetsUse của snapshot; vẫn cần kiểm tra toàn bộ tham chiếu và lịch sử trước khi chốt ID.
- Cấp6 chọn4loại; cấp7–12 chọn6dòng kết hợp. Không tự cấp ngọc vào ô đã trang bị hoặc thay thuộc tính.
- Giữ6SKU ngẫu nhiên hiện tại. Có thể thêm7SKU Nguyên bảo và7SKU Hồn ngọc tệ theo cùng bảng; không coi tỷ lệ shop1tệ/40NB là API đổi tiền hai chiều.
- SKU mới tránh ID10000007 đang bị addon cũ/overlay tắt; dùng ID mới đã kiểm tra xung đột. Túi10 đã sở hữu vẫn dùng bình thường.

## Hai điều kiện cần xử lý trước triển khai

1. **Luồng đổi ngọc3904 sai cấp.** Handler live đăng ký trực tiếp; VM thực thi source live cho thấy inputcấp4/requesttype1→cấp6, inputcấp1/type23→cấp100, không có recipe tương ứng. Đây là kiểm chứng RAM, không phải bằng chứng người chơi khai thác. Cần sửa giữ cấp/phạm vi loại/ngọc đang trang bị/giới hạn lượt theo contract native; không đưa đường lỗi này vào giá nguyên liệu. Audit loại khỏi phép tính, không sửa production trong lượt này.
2. **Mua/mở giá trị cao cần confirmed-save và receipt.** Shop chung đã có khóa, fresh-load, kiểm tiền trước trừ; nhưng save=null không bị chặn ở mọi nhánh và không có durable requestId receipt cho SKU thường. Cần xác nhận lưu và chống retry trừ/cấp lần hai trước mở bán.

## Trình tự triển khai đề xuất

- Chốt chuẩn giá theo nguyên liệu/túi6 gốc ở trên. Sửa hai đường rủi ro, không thay giá6SKU cũ hoặc phí nâng.
- Thêm3túi còn thiếu, đồng bộ Assets/AssetsUse/nhãn/icon/client/server, thêmSKU mới cho6–12 và xác thực toàn bộ40lựa chọn.
- QA RAM: thiếu tiền/đủ tiền/trừ đúng/lưu lỗi/retry/concurrent, mở chọn đúng1viên, không đổi stats/shape ngoài cơ chế gốc; kiểm codec/UI giá triệu và tổng mua lớn. Qty9999×giá12≈94,47tỷ còn trong safeintegerJS nhưng vượt32bit, không mặc định UI/protocol an toàn.
- QA bulk100/1000 với bag lớn để tránh tái diễn nghẽn chuẩn hóa GemInfo; thử native mobile/desktop hiển thị nguyên giá hoặc tooltip tổng tiền chính xác.
- Sau khi phương án được chấp thuận: backup/CAS, triển khaiS1–S7 theo readiness và read-back; thử giao dịch có kiểm soát khi được cho phép. Không dùng player thật để đoán/tự tiêu tiền trong bước lên phương án.

## Bằng chứng

- `_ai_workbench/temp/gem_shop_pricing_20261005/live_config.json`, `calculation.json`, `route_audit.json`, `source/`.
- `_ai_workbench/tools/calculate_gem_choice_prices_20261005.py` tính graph nguyên liệu; kiểm cả40 lựa chọn và3mốc giá.
- `_ai_workbench/tools/audit_gem_pricing_routes_20261005.js` dùng source live trong VM, mock3save, productionWrites0.
