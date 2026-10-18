# Đỉnh Phong Diễn Võ: ZâmCaCa / FoxPlayer — 22/09/2026

## Kết quả đã kiểm chứng

- Đọc trực tiếp VPS runtime `/linhhoasu/lhs/newServer`, PM2 `lhs-s1002`; URI Mongo và identity DB lấy từ môi trường PM2, không suy đoán. Không gọi handler game, không ghi DB, không trừ vé, không restart/deploy.
- Dữ liệu trận xác định ZâmCaCa thuộc **S2/1002**, FoxPlayer đối thủ thuộc **S1/1001**. Trận này là liên server, không phải cả hai cùng S2.
- 31 receipt gần nhất liên quan ZâmCaCa; hai trận khớp tên, level và LC trong ảnh diễn ra **00:48:13 và 00:53:02 ngày 22/09/2026 GMT+7**. Receipt cuối: `515eb2cafd8e437f5c4bac061db7232d25ed8da1a326d0843307502debd82580`.
- Cả hai: LC trận ZâmCaCa **6.987.597.336**, FoxPlayer **1.739.151.947**, kết quả lưu `win=0`.
- Source runtime BattleService SHA256: `4690d027f9e55f17bb6791215e4f10e4bbd4d1b2e260160a32db80b644614530` (đối chiếu evidence). Giới hạn config thực tế `fightMaxRound=15`.

## Nguyên nhân trực tiếp — không phải RNG xui

`BattleService.simulateBattle` dùng `Math.random() < max(0, né - kháng né)/10000`.

| Bên né | Né (104) | Kháng né đối thủ (154) | Tỷ lệ tính ra |
|---|---:|---:|---:|
| ZâmCaCa | 102584 | 76664 | 259,20% |
| FoxPlayer | 350758 | 83840 | 2669,18% |

Cả hai tỷ lệ lớn hơn 100%, nên mọi đòn thường đều vào nhánh `evade` và return trước sát thương/combo/hút máu/choáng/phản kích. Sau 15 hiệp, `win = mHP <= 0` luôn false vì đối thủ vẫn nguyên HP. Ai làm người tấn công trong cặp chỉ số này cũng sẽ thua.

Chạy lại **hàm simulator production** trong process đọc độc lập, trên bản sao `atkAttr/defAttr` của từng receipt, 40 seed/trận: **0 thắng, 40 thua do hết hiệp** cho mỗi trận. Mẫu có 15 né mỗi bên, HP giữ nguyên **1.524.417.363 / 454.994.441**. Đây là tái hiện từ snapshot thật, không tạo trận mới trong game.

Giới hạn bằng chứng: receipt đã xóa `events` khi compact, không lưu RNG/rounds nguyên bản. Vì vậy không tuyên bố khôi phục từng animation trận cũ. Riêng nhánh hai bên né chắc chắn được chứng minh bằng điều kiện toán học, không phụ thuộc seed. Trường `damage` receipt bằng 0 không dùng làm bằng chứng độc lập, vì builder lấy các field simulator chưa trả về.

## Phạm vi sửa an toàn

- Mount fix trước đó không giải quyết nhánh xác suất/timeout này. Đính chính nhận định trước: không thể quy cặp trận này cho RNG; Đỉnh Phong là `CrossArena`/system317, không phải `TopCombat`/system315.
- Chỉ clamp xác suất về 100% **không** sửa được kẹt; đổi mẫu số hoặc tự đặt trần 70–95% là đổi cân bằng khi chưa có nguồn xác thực.
- Cần xác minh cách native/config quy đổi và giới hạn né/kháng né, đồng thời nguồn cộng attr104/154; sau đó mới chọn bản sửa công thức. Chính sách xử lý hết hiệp phải được xác minh riêng, không tự ép bên LC cao thắng.
- Regression bắt buộc: exact pair trên và đảo chiều; proc dưới/bằng/trên ngưỡng; choáng/né/hút máu; PVP/PVE dùng chung simulator; kết quả, packet và receipt nhất quán. Backup chọn lọc + hash CAS trước sửa/deploy game.
- Chênh LC self/list trong ảnh và roster cũ vẫn là vấn đề riêng; chưa tuyên bố full parity hay toàn bộ PK/PVE đã sửa.

## Bằng chứng và file

- `_ai_workbench/temp/combat_parity_20260922/cross_arena_case.json`: snapshot và 31 receipt rút gọn, hash runtime, kết quả simulator.
- `_ai_workbench/tools/audit_cross_arena_case_20260922.js` và `.py`: probe chỉ đọc có query giới hạn/maxTimeMS; chỉ ghi evidence local.
- Snapshot player S2 trước/sau đọc giữ nguyên hash. Không sửa game/DB trong lượt này; chưa triển khai fix proc/timeout.
