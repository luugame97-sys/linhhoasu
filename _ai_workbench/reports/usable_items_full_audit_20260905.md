# Audit toàn bộ item sử dụng và rương — 05/09/2026

## 1. Tóm tắt công việc

- Quét đúng source/config production, không kết nối database trong fixture: **940 item có `AssetsUseConfig`**.
- Với rương chọn, đã chạy từng lựa chọn riêng; tổng ca test lớn hơn số item.
- Kết quả: **664 item PASS**, **271 item lỗi code đã xác nhận**, **5 item cần test native/orphan config**.
- Nhóm lỗi: 116 rương ngẫu nhiên bị trừ nhưng thưởng rỗng; 150 item type 103 có reward cấu hình nhưng handler bỏ qua; 3 rương tự chọn phát toàn bộ; 2 rương tự chọn không có option.
- Audit runtime Mongo chỉ đọc, ẩn danh; không mở rương trên người chơi thật, không sửa production.

## 2. Phạm vi theo useType

| useType | Số item | Ý nghĩa chính |
|---:|---:|---|
| 101 | 246 | Rương tự chọn chuẩn |
| 102 | 153 | Rương/túi ngẫu nhiên |
| 103 | 458 | Đan/đồ ăn hoặc vật phẩm cộng thuộc tính lâu dài |
| 104 | 2 | Rương thần binh cố định thuộc tính |
| 105 | 59 | Bộ thời trang |
| 106 | 1 | Rương thần binh tối thượng |
| 107 | 12 | Gói tài nguyên công trình |
| 108 | 1 | Luồng client đặc biệt Thất Tịch |
| 110 | 8 | Rương chọn hệ Old Trek/thuỷ thủ |

## 3. Lỗi đã xác nhận

### P0 — Rương tự chọn phát toàn bộ (3 ID)

```text
90044,90045,90046
```

- `90044`: chọn một thần binh nhưng server tạo cả 6.
- `90045`: chọn một thần binh tối thượng nhưng server tạo cả 18.
- `90046`: chọn một thần binh trác việt nhưng server tạo cả 18.
- Nguyên nhân: handler chỉ coi useType 101/110 là chọn một; type 104/106 rơi vào nhánh cấp toàn bộ `rewards`.

### P0/P1 — Rương ngẫu nhiên bị trừ nhưng không có quà (116 ID)

```text
412,413,94301,94401,94416,94418,94419,94420,94421,94422,94515,94701,94702,94703,94704,94705,94706,94707,94708,94709
94711,94712,94713,94715,94716,94718,94719,94720,94721,94722,94724,94725,94726,94727,94729,94801,94802,94821,94822,94823
94824,94825,94902,94904,94908,94911,94923,94926,94929,94932,94935,94938,94941,100019,100020,100021,100022,100023,100024,100025
100026,100030,100031,100032,100033,100034,100035,100036,100040,100060,100061,100062,100063,100080,100139,100160,100170,100171,100172,100173
100174,100185,100190,100200,100201,100202,100203,100230,100231,100232,100233,100250,100251,100252,100253,100501,100502,100503,100641,100642
100643,100701,100702,100703,100704,100705,100706,100707,100708,100709,100810,100811,100812,100813,101000,101310
```

- Khi dùng: response `result=0`, item nguồn giảm 1, packet có `1202/1300`, nhưng `rewardInfo` rỗng và state không đổi.
- 41 ID trong nhóm này đang được ít nhất một bảng config khác tham chiếu; 75 ID hiện chưa có tham chiếu catalog ngoài chính item/use row.
- Một số rương 944xx đã có pool hard-code và PASS; không phải toàn bộ useType 102 đều lỗi.

### P1 — Rương chọn không có lựa chọn (2 ID)

```text
90021,90022
```

- `90021`, `90022`: `AssetsUseConfig.rewards=[]`; client không thể dựng option và server trả `selection required` mà không trừ item.

### P2 — Item type 103 bỏ qua reward (150 ID)

```text
110122,110123,110124,110126,110127,110142,110143,110144,110146,110147,110222,110223,110224,110226,110227,110242,110243,110244,110246,110247
110322,110323,110324,110326,110327,110342,110343,110344,110346,110347,110422,110423,110424,110426,110427,110442,110443,110444,110446,110447
110522,110523,110524,110526,110527,110542,110543,110544,110546,110547,110622,110623,110624,110626,110627,110642,110643,110644,110646,110647
110722,110723,110724,110726,110727,110742,110743,110744,110746,110747,110822,110823,110824,110826,110827,110842,110843,110844,110846,110847
110922,110923,110924,110926,110927,110942,110943,110944,110946,110947,111022,111023,111024,111026,111027,111042,111043,111044,111046,111047
111122,111123,111124,111126,111127,111142,111143,111144,111146,111147,111222,111223,111224,111226,111227,111242,111243,111244,111246,111247
111322,111323,111324,111326,111327,111342,111343,111344,111346,111347,111422,111423,111424,111426,111427,111442,111443,111444,111446,111447
111522,111523,111524,111526,111527,111542,111543,111544,111546,111547
```

- Đây là 75 đan tu vi và 75 đan Tịch Cốc thuộc asset type 8/subType 2 hoặc 4.
- Config có reward như tu vi ID 3 hoặc Baozi ID 4, nhưng handler type 103 chỉ tăng `itemUseRecords/other_attr_info`, không gọi router cấp reward.
- Cả 150 ID hiện không có inbound reference ngoài AssetsUse/Assets trong bản config này, nhưng nếu GM/mail cấp trực tiếp thì người chơi dùng sẽ mất item mà không nhận reward mô tả.

## 4. Item cần test native/orphan, chưa gắn lỗi chắc chắn (5 ID)

```text
227,94355,94356,94357,94358
```

- `227` dùng màn tương tác Thất Tịch riêng, không nên kết luận bằng tag 1300 generic.
- `94355–94358` có `AssetsUseConfig` nhưng thiếu `AssetsConfig` và không có inbound reference; hiện là orphan config, không xuất hiện như item bình thường.

## 5. Ảnh hưởng runtime production

- S1: 1774 player/614 người thật; 4 người thật đang giữ ID lỗi.
- Item lỗi đang có trên người thật: `100080 ×1`, `100139 ×823`.
- S2: 581 player/1 người thật; affected=0.
- Thư chưa nhận chứa ID lỗi: S1=0, S2=0.
- RedemptionCode active chứa ID lỗi: S1=0, S2=0.
- Một người có thể giữ nhiều item; audit không công khai account/UID.

## 6. File/thư mục đã thay đổi

- Source game/production: **không thay đổi**.
- Tool audit catalog/runtime/runner/report đặt trong `_ai_workbench/tools/`.
- Evidence: `_ai_workbench/temp/usable_item_audit_prod_20260905.json` và `_ai_workbench/temp/usable_item_runtime_audit_20260905_015937.json`.
- Danh sách: `usable_items_full_audit_20260905.csv`, `usable_items_confirmed_problems_20260905.csv`, `usable_items_confirmed_problem_ids_20260905.txt`.

## 7. Lỗi đã gặp & giải pháp

| Lỗi khi audit | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Fixture đứng ở rương pet 90011 | Ép `Math.random=0` khiến vòng chọn skill unique lặp vô hạn | Dùng PRNG xác định có biến thiên | Không ép random hằng số khi code có vòng unique |
| Chạy một rương một lần không đủ | Rương chọn có 1–40 option | Chạy từng index lựa chọn | Contract bao phủ mọi option |
| Type 102 config rewards rỗng chưa chắc lỗi | Một số rương có pool hard-code theo ID/icon | Đo item delta + rewardInfo + state | Kết luận theo behavior, không chỉ config rỗng |
| Orphan use row nhìn như item lỗi | Thiếu AssetsConfig và không có nguồn phát | Tách `CAN_TEST_NATIVE/orphan` | Không trộn item không thể nhận với item đang nuốt quà |

## 8. Kỹ năng / kinh nghiệm mới

- Rương ngẫu nhiên phải có registry/pool server-authoritative; không nên suy reward từ text dịch lúc runtime.
- useType 104/106 vẫn là chọn một dù khác giao diện 101; server phải xác minh selection đúng schema.
- Item permanent attr và item có reward tức thời cần tách nhánh theo nội dung config, không chỉ theo useType.

## 9. Trạng thái hiện tại

- Audit production 940/940 item: PASS về độ phủ.
- 271 ID lỗi đã xuất đầy đủ tên, mô tả, route, option, packet và nguồn tham chiếu.
- Source hashes: item handler `700a0c86c3c3a2f4a7b8473e890b3b208ae3cd97c577c2dc268d3f9b47274277`, RewardGrant `ae42d855c6e295aa0e2aa23a1a5091fe739dea6f5de66c2dca1cdc1422a8868d`.
- Production vẫn healthy; không gửi item, không sửa DB, không restart.

## 10. Bước tiếp theo

1. Fix P0 `90044/90045/90046` trước để chặn phát thừa.
2. Fix `100080` và `100139` trước trong nhóm nuốt quà vì người thật đang giữ; sau đó triển khai registry cho đủ 116 rương ngẫu nhiên.
3. Sửa 150 item type 103 theo hai nhánh: reward tức thời dùng router chung; attrs lâu dài giữ ledger/cap hiện tại.
4. Bổ sung option đúng cho `90021/90022`; chỉ repair/hoàn rương cũ sau khi có ledger hoặc bằng chứng sử dụng, tránh phát bù trùng.
