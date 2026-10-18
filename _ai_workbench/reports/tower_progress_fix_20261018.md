# Hư Thiên Bảo Điện: sửa mục 2, 3, 4, 5 (18/10/2026)

**Trạng thái:** đã sửa và kiểm thử trong repo, nhánh `claude/project-thread-wq4k1w`. **Chưa deploy lên VPS.**

Hư Thiên Bảo Điện là hệ Tower (RPC 2300 type 9, chọn kỹ năng 3700, bảng xếp hạng 2700/3701). Không cần sửa client: mọi thay đổi nằm ở server và khớp đúng cách client gốc (`main.min_drop200.js`, `ClimbingTowerModel`) đang gửi và đọc dữ liệu.

## 1. Tóm tắt

| Mục | Trước | Sau |
|---|---|---|
| 2. Quét nhanh | Nút quét gửi `{type:9, index:0}`, server coi như đánh 1 tầng. Kỷ lục 800 vẫn phải đánh lại từ tầng 1 mỗi ngày. | Nhấn quét là nhảy thẳng tới tầng quét (kỷ lục 800 thì tới 770), không đánh trận, nhận quà mốc và lượt chọn kỹ năng của các tầng đã vượt. |
| 3. Quà mốc `TowerRewardConfig` | 80 mốc (10, 20, …, 800) không được phát ở đâu. | Quét nhanh phát quà mốc của tầng quét tới (mặc định), hoặc cộng dồn nếu bật biến môi trường. |
| 4. Kỹ năng tháp | Chọn kỹ năng chỉ đổi giao diện, trận đấu không dùng. | Thuộc tính của các ô kỹ năng đã mở được cộng vào nhân vật trong trận tháp. Ô bị khoá theo tầng như client. |
| 5. Xếp hạng tháp | Chỉ cập nhật khi đăng nhập. | Cập nhật ngay khi thắng một tầng vượt kỷ lục cũ. |

## 2. Chi tiết từng mục

### Mục 2: Quét nhanh

- **Tầng quét** tính giống hệt client: `10 × (floor(kỷ lục / 10) − 2)`, riêng kỷ lục ≥ 800 thì tính như 799. Ví dụ: 800 → 770, 505 → 480, 30 → 10. Kỷ lục dưới 30 thì không có quét.
- **Khi nào là quét:** client chỉ hiện nút quét khi tầng hiện tại thấp hơn tầng quét. Vì vậy trong trạng thái đó, mọi yêu cầu type 9 đều được xử lý là quét, kể cả khi client gửi số tầng thường. Như vậy người chơi không thể đánh từng tầng thấp để lấy quà lặp lại.
- **Khi quét, server làm:**
  - đặt tầng hiện tại = tầng quét, kỷ lục giữ nguyên;
  - cộng điểm như đánh tay (`tầng × 10` cho mỗi tầng vượt qua) và cộng số tầng vào `dailyCount`;
  - cộng lượt chọn kỹ năng: 1 lượt cho mỗi khối 10 tầng (quét 0 → 770 được 77 lượt);
  - phát quà mốc (xem mục 3), tính 1 lần nhiệm vụ khiêu chiến, lưu người chơi 1 lần;
  - trả về gói 2300 không có `fightResult`. Client gốc khi đó tự cập nhật thông tin tháp và mở bảng nhận quà.
- **Gửi lại nút quét** (bấm đúp, mất mạng gửi lại) khi không còn gì để quét: server chỉ trả trạng thái hiện tại, quà rỗng, không đánh, không lưu. Client chỉ đồng bộ lại nút.
- **Tầng vượt quá 800:** trả lỗi `invalid tower layer` nhưng vẫn kèm trạng thái tháp để client không bị kẹt.
- Ghi log mỗi lần quét: `[Tower] sweep user=<id> 0->770 picks=77`.

Khác với bản RPC3705 đã rollback hôm 17/10: không thêm RPC mới hay addon client, tầng quét là 770 (bản cũ là 780), và quét không phát quà từng tầng hay quà lần đầu.

### Mục 3: Quà mốc (`TowerRewardConfig`, "quà tốc thông")

Theo hướng dẫn gốc của game, quà mốc là quà của quét nhanh, nên chỉ phát khi quét. Đánh tay vẫn giữ nguyên như cũ (quà thường và quà lần đầu của `TowerConfig`).

- **Mặc định (`tier`, "Một mốc"):** phát quà của đúng mốc tầng quét tới. Kỷ lục 800 quét tới 770 nhận 2.370 vật phẩm id 60, 16 vật phẩm id 6 và 77.000 bạc.
- **Tuỳ chọn (`cumulative`, "Cộng dồn"):** đặt biến môi trường `TOWER_SWEEP_REWARD_MODE=cumulative`. Khi đó phát mọi mốc nằm giữa tầng đang đứng và tầng quét tới. Quét trọn 0 → 770 sẽ nhận khoảng 94.710 vật phẩm id 60, 632 vật phẩm id 6 và 3.003.000 bạc, tức gấp khoảng 40 lần phương án mặc định.
- Vì reset ngày đưa tầng hiện tại về 0 lúc 00:00, mỗi người chơi quét được 1 lần mỗi ngày.

### Mục 4: Kỹ năng tháp có tác dụng trong trận

- Thuộc tính cộng thêm = `TowerAttrConfig.attrs × cấp` của từng ô đã mở, giống cách client hiển thị.
- **Ô mở theo tầng** (`TowerBaseConfig.attrCond = [1,1,1,31,61,91,121,151]`): 3 ô đầu mở từ tầng 1, ô 4 mở khi đánh tới tầng 31, ô 5 ở tầng 61, và cứ thế. Server không cho đặt kỹ năng vào ô còn khoá (`tower_slot_locked`). Trước đây server cho đặt cả 8 ô ngay từ đầu, đây cũng là một phần của mục 6 trong lần kiểm tra trước.
- Chỉ áp dụng trong trận tháp. Lực chiến hiển thị và các chế độ khác không thay đổi.
- Các chỉ số phần trăm (id 51–54) được cộng trước bước quy đổi phần trăm, nên tăng đúng theo tỉ lệ.
- **Lượt chọn kỹ năng:** 1 lượt cho mỗi khối 10 tầng, ở các tầng 1, 11, 21, … (theo hướng dẫn gốc: "mỗi 10 tầng một lần chọn"). **Trước đây mỗi trận thắng được 1 lượt, nên giờ người chơi sẽ nhận ít lượt hơn.** Đánh lại tầng đã qua không cho thêm lượt.
- Sau mỗi lần chọn, nếu còn lượt thì server đưa ngay một bộ lựa chọn mới để bảng chọn tiếp tục mở.
- **Chống bấm đúp:** gửi cùng một lựa chọn vào cùng ô trong 1,5 giây thì lần sau bị bỏ qua (`tower_pick_repeat`), để không mất 2 lượt.

### Mục 5: Bảng xếp hạng tháp

- Thắng một tầng vượt kỷ lục cũ thì ghi `rank.updateScore('tower', playerId, maxlayer)` ngay sau khi lưu.
- Đánh lại tầng thấp hơn kỷ lục và quét nhanh không làm đổi kỷ lục, nên không ghi.
- Bot (`isBot`, `managedBot`, userId bắt đầu bằng `lhs_real_bot_`) không được ghi.
- Nếu Redis lỗi, trận vẫn thành công và chỉ ghi một dòng cảnh báo vào log.

## 3. Những gì chưa làm

- **Mục 1** (đưa source đang chạy trên VPS vào repo): chưa làm. Vì vậy bản sửa này được giao dưới dạng script vá theo mốc, không phải file thay thế.
- **Mục 6, phần số lựa chọn:** mỗi lần server vẫn đưa 8 lựa chọn (`attrCount`). Chưa kiểm chứng số của bản gốc.
- **Nâng cấp kỹ năng:** bộ lựa chọn mới loại các kỹ năng đã trang bị, nên kỹ năng hầu như không lên cấp được. Client gốc có đường nâng cấp khi chọn trùng kỹ năng.
- **Bỏ qua chọn kỹ năng:** mất toàn bộ lượt đang chờ (giữ như trước). Sau khi quét 77 lượt mà bấm bỏ qua thì mất hết.
- **Tự chọn kỹ năng** (cài đặt `autoSelect`) chưa được xử lý riêng cho trường hợp nhiều lượt.
- **Một số loại thuộc tính** trong `TowerAttrConfig` không được engine trận dùng, nên kỹ năng loại đó vẫn không có tác dụng.
- **Thưởng xếp hạng tuần** (`TowerRankRewardConfig`) chưa có.
- Handler cũ của tag 2350 (`handleTowerFight`) vẫn là code không dùng.

## 4. File thay đổi

Mới (copy lên VPS):

- `lhs/newServer/src/services/TowerProgressService.js`: toàn bộ quy tắc (tầng quét, quà mốc, số lượt, ô mở, thuộc tính, ghi rank).
- `lhs/newServer/scripts/apply-tower-progress-20261018.js`: script vá theo mốc, có chạy thử, chạy trên bản sao, áp dụng và hoàn tác.
- `lhs/newServer/scripts/test-tower-progress-contract.js`: kiểm thử hợp đồng 11 nhóm.

Sửa (chỉ qua script, **không copy từ repo lên VPS**):

- `src/handlers/raid.js`: chặn quét, xử lý quét, thuộc tính tháp, lượt chọn, ghi rank.
- `src/handlers/tower.js`: cộng nhiều lượt, ô khoá, chống bấm đúp, đưa lựa chọn mới.
- `src/services/BattleService.js`: `calcPlayerPower(player, { extraAttrs })`.

Bản trong repo chính là kết quả chạy script trên code hiện có của repo.

## 5. Kiểm thử đã chạy

- `test-tower-progress-contract.js`: **11/11 nhóm PASS**. Các nhóm gồm: tầng quét; quét 0 → 770 (quà, 77 lượt, không trận, lưu 1 lần); gửi lại quét; quét khi client gửi số tầng thường; vượt tầng 800; quét dở 755 → 770; dưới 30 tầng; chế độ cộng dồn; lượt chọn mỗi 10 tầng; ghi rank (kỷ lục mới, đánh lại, bot, Redis lỗi); thuộc tính trong trận (có kiểm tra giá trị thực đưa vào `simulateBattle`); chọn kỹ năng (đưa lại lựa chọn, ô khoá, bấm đúp, bỏ qua).
- **Toàn bộ 52 script test của server:** 37 PASS. 15 FAIL, cả 15 cũng FAIL y hệt trên code trước khi sửa (thiếu file trong `_ai_workbench/temp`, thiếu Mongo, ...). Không có hồi quy.
- **Script vá** đã thử trên bản sao: chạy thử, `--stage`, `--apply`, chạy lại (báo đã vá), `--rollback` (khôi phục đúng từng byte), rollback lần 2 (báo không cần), phát hiện file bị sửa tay sau khi vá (từ chối rollback), file kiểu xuống dòng CRLF.
- **Chưa kiểm:** chạy script trên file thật của VPS (repo không có bản reset ngày đang chạy), chơi thử trong game, và qua mốc 00:00 thật.

## 6. Hướng dẫn deploy lên VPS

Làm vào giờ ít người chơi, tránh khoảng 23:50–00:10 (reset ngày). Các lệnh dưới đây chạy trong `/linhhoasu/lhs/newServer`.

> **Không** copy `raid.js`, `tower.js`, `BattleService.js` từ repo lên VPS. Bản trên VPS có các sửa đổi reset ngày và chống đánh lại tầng mà repo không có. Ghi đè sẽ làm mất các sửa đổi đó. Chỉ dùng script vá.

**Bước 1. Upload 3 file mới** vào đúng đường dẫn:

```
/linhhoasu/lhs/newServer/src/services/TowerProgressService.js
/linhhoasu/lhs/newServer/scripts/apply-tower-progress-20261018.js
/linhhoasu/lhs/newServer/scripts/test-tower-progress-contract.js
```

**Bước 2. Chạy thử** (không ghi gì):

```bash
cd /linhhoasu/lhs/newServer
node --check src/services/TowerProgressService.js
node scripts/apply-tower-progress-20261018.js
```

Kết quả đúng: 16 dòng `OK`, dòng `raid.invalidLayer` có thể là `SKIP (optional, ...)`, cuối cùng là `dry run: 3 file(s) would change, syntax OK`. Nếu có dòng `MISSING`, `AMBIGUOUS` hoặc `CONFLICT`, script không ghi gì cả. Khi đó dừng lại và gửi mình toàn bộ output.

**Bước 3. Chạy kiểm thử trên bản sao của code đang chạy:**

```bash
node scripts/apply-tower-progress-20261018.js --stage
```

Kết quả đúng: `{"ok":true,"groups":11}` và `contract test PASSED on the patched live code`. Code đang chạy chưa bị đụng tới. Sau đó xoá bản sao:

```bash
rm -r /linhhoasu/lhs/newServer_stage_tower_progress_20261018
```

Nếu báo `FAILED`, dừng lại và gửi mình output.

**Bước 4. Áp dụng:**

```bash
node scripts/apply-tower-progress-20261018.js --apply
```

Script tự sao lưu 3 file gốc vào `/linhhoasu/_ai_workbench/backups/tower_progress_20261018_<thời gian>` và in ra lệnh rollback. **Ghi lại đường dẫn backup này.**

**Bước 5. Khởi động lại từng server game** đang chạy từ thư mục này. Lấy danh sách:

```bash
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>JSON.parse(s).filter(p=>p.pm2_env.pm_cwd==="/linhhoasu/lhs/newServer"&&/^lhs-s/.test(p.name)).forEach(p=>console.log(p.name)))'
```

Restart lần lượt từng cái, xong cái này mới tới cái sau:

```bash
pm2 restart lhs-s1001
pm2 logs lhs-s1001 --lines 50 --nostream
```

Kiểm tra process `online`, log không có lỗi, rồi kiểm tra readiness như các lần deploy trước (ví dụ `curl -s http://127.0.0.1:8080/ready` cho server chính). Các worker bot (`lhs-real-bots*`) không dùng 3 file này nên không cần restart. Xong hết thì chạy `pm2 save`.

**Bước 6. Kiểm tra trong game** bằng tài khoản test có kỷ lục ≥ 30 tầng và hôm nay chưa leo:

1. Vào Hư Thiên Bảo Điện. Chỉ có nút quét nhanh. Bấm nút.
2. Không có trận đánh, hiện bảng nhận quà mốc (kỷ lục 800 thì là quà mốc 770), tầng nhảy lên tầng quét và bảng chọn kỹ năng mở ra.
3. Chọn vài kỹ năng. Sau mỗi lần chọn có bộ lựa chọn mới, số lượt giảm 1. Ô 4 trở đi bị khoá tới khi đủ tầng.
4. Thoát ra vào lại hoặc bấm quét lần nữa: không nhận thêm quà.
5. Đánh tầng tiếp theo (771) bình thường. So sánh sát thương hoặc máu trước và sau khi có kỹ năng.
6. Thắng tầng vượt kỷ lục cũ: bảng xếp hạng tháp cập nhật ngay.
7. Trong log có dòng `[Tower] sweep user=...`.

**Rollback** nếu có vấn đề:

```bash
node scripts/apply-tower-progress-20261018.js --rollback /linhhoasu/_ai_workbench/backups/tower_progress_20261018_<thời gian>
```

Sau đó restart lại các server như bước 5. Nếu script báo `ROLLBACK_DRIFT` (file bị sửa sau khi vá), nó không khôi phục gì cả. Khi đó copy 3 file trong thư mục backup về chỗ cũ bằng tay. File `TowerProgressService.js` có thể để lại vì không còn được gọi.

**Đổi sang chế độ quà cộng dồn** (không cần sửa code): thêm `TOWER_SWEEP_REWARD_MODE: 'cumulative'` vào `env` của từng server game trong file ecosystem mà pm2 đang dùng, rồi restart từng server bằng `pm2 restart <file ecosystem> --only <tên> --update-env`. Kiểm tra bằng `pm2 env <id>`. Bỏ biến này đi thì quay về mặc định "Một mốc".
