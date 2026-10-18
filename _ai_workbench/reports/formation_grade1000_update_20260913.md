# Triển khai Pháp tướng bậc 1000 — 13/09/2026

## Phạm vi

- Giữ nguyên toàn bộ `FormationGradeConfig` bậc 1–10 từ snapshot live.
- Thêm bậc 11–1000 trong server config, client config cơ sở và client fashion config; không đổi bảng khác.
- Không tạo item ID mới: dùng item `7` (**Mảnh pháp tướng**) cho tăng level/exp và item `8` (**Tinh linh pháp tướng**) cho tiến bậc.

## Công thức bậc mới

Tiếp tục quy luật đã quan sát từ bậc 6–10:

- `maxLevel(g) = 280 × (g − 5)` với `g ≥ 6`.
- `maxExp(g) = 5 × g − 5` với `g ≥ 7` (giữ nguyên bậc 6 = 30).
- Mỗi lần tăng cấp: item `7 × 1`; `levelUpAttrs = {1: 100g+200, 2: 12g+24, 3: 2g+4}`.
- Tiến bậc từ `g` sang `g+1`: item `8 × 840 × (g − 5)` với `g ≥ 6`.

Bậc 1000: `level=278.600`, `exp=4.995`, attrs mỗi lần `{1:100.200, 2:12.024, 3:2.004}`. Dòng bậc 1000 giữ cost item 8 theo quy luật (`835.800`) nhưng không có bậc 1001 nên không thể tiến tiếp.

## Nguyên liệu cần

| Phạm vi | Item 7 — Mảnh pháp tướng | Item 8 — Tinh linh pháp tướng |
|---|---:|---:|
| Từ **max bậc 10** (`1400/45`) lên max bậc 1000 | **463.167.055.725** | **415.384.200** |
| Từ bậc 10 level 1/exp 0 lên max bậc 1000 | 463.167.118.680 | 415.384.200 |
| Từ bậc 1 level 1/exp 0 lên max bậc 1000 | 463.167.222.607 | 415.393.080 |

Tổng đã đối chiếu bằng 1000 lượt nâng max bậc và 999 lượt tiến bậc trong sandbox chạy đúng thân handler đã deploy, không ghi DB. Handler khởi tạo level 1 và tự đầy thanh exp khi chạm cấp cuối: chi phí mỗi bậc là `(levelMax - 1) × exp`, không phải `levelMax × exp`. Đây là đính chính số sơ bộ trước đó. Không trừ số dư của người chơi; không bao gồm phụ linh. Hơn 463 tỷ mảnh là tổng dài hạn của công thức tăng tuyến tính đồng thời level/exp, chưa chứng minh cân bằng thời gian chơi thực tế.

## Candidate/evidence

- Builder: `_ai_workbench/tools/build_formation_grade1000_20260913.js`.
- Snapshot live đầu vào: server/client config và `config_fashion_20260909.bin`; bậc 1–10 được assert giữ nguyên; output có đúng 1000 row và parity 3 config.
- Candidate binary: `_ai_workbench/temp/formation_grade1000_20260913/{server.next.bin,client.next.bin,client-fashion.next.bin}`.
- `index.html` cache token candidate: `20260913_formation_grade1000_v1`.
- Đã deploy 3 config + index sau backup `/linhhoasu/_ai_workbench/backups/formation_grade1000_20260913_pre`; S1/S2/S3 restart một lần, ready 200. Không migration hay chỉnh player/DB/Redis trực tiếp.
- Post-check độc lập xác minh hash disk + HTTP theo đúng bản client (khác hash server), 1000 row, process online: `deploy.json`. Lệnh deploy gốc không xuất báo cáo cuối nên không chạy lại mutation; dùng read-only post-check để xác định trạng thái.
- `verification.json`: 713 bảng khác không đổi, 10 bậc cũ giữ nguyên, parity 3 config, mô phỏng đủ 1000 bậc/999 lần tiến bậc, debit bằng tổng nêu trên, chặn bậc 1001. Core contract 714 bảng PASS với candidate.
- Language không đổi vì help cũ không có hard cap 10; không deploy language chỉ để đổi hash. Local config được sinh riêng để bảo toàn khác biệt local ngoài FormationGradeConfig.
- Còn thiếu native UI/player E2E tại 10→11 và 999→1000; không dùng nicky để ép bậc hoặc trừ hàng trăm tỷ vật liệu. Không coi handler sandbox/ready 200 là chứng minh cân bằng combat hay hiển thị số lớn ở bậc 1000.
