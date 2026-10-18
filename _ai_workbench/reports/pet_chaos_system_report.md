# Báo Cáo Tổng Hợp: Hoàn Thiện Hệ Thống 5 Tinh Linh Hỗn Độn (Chaos Pets)

**Thời gian hoàn thành:** 30/09/2026 00:20 ICT  
**Phạm vi hệ thống:** 5 Tinh linh Hỗn Độn (`810101` $\rightarrow$ `810501`)  
**Môi trường triển khai:** VPS `103.116.105.154` (Server game S1001 $\rightarrow$ S1006)

---

## 1. Tổng quan 5 Tinh linh Hỗn Độn (Phẩm 10)

| ID | Tên Tinh Linh | Hệ Nguyên Tố | Kỹ Năng Chủ Động | Hiệu Ứng Tiên Thiên (Hiệp 0) | Cướp Công (Overlap: 3) |
| :---: | :--- | :---: | :---: | :--- | :---: |
| **810101** | Hỗn Độn Thánh Kỳ Lân | Kim (1) | Đánh mỗi 1 hiệp | -30% Công, -10% Kháng Liên Kích | Cướp 10% Công (2 hiệp) |
| **810201** | Hỗn Độn Bắc Minh Huyền Vũ | Thủy (3) | Đánh mỗi 2 hiệp | -30% Công, -10% Kháng Phản Kích | Cướp 13% Công (2 hiệp) |
| **810301** | Hỗn Độn Hạo Thiên Thần Khuyển | Thổ (5) | Đánh mỗi 2 hiệp | -30% Công, -10% Kháng Choáng | Cướp 13% Công (2 hiệp) |
| **810401** | Hỗn Độn Nam Minh Chu Tước | Hỏa (4) | Đánh mỗi 2 hiệp | -30% Công, -10% Kháng Bạo Kích | Cướp 10% Công (2 hiệp) |
| **810501** | Hỗn Độn Địa Tạng Đế Thính | Mộc (2) | Đánh mỗi 2 hiệp | -30% Công, -10% Kháng Hút Máu / Né | Cướp 13% Công (2 hiệp) |

---

## 2. Chi tiết 4 Trụ Cột Đã Hoàn Thiện

### Phần 1: Dữ liệu & Giao diện (Assets & HUD)
- **Cấu hình:** Đầy đủ 46 pet trong `PetConfig`, `PetQualityConfig` (phẩm 10 có 7 passive skills, level trần 200).
- **Giao diện HUD:** Bộ avatar tròn trong suốt `head_810101.png` $\rightarrow$ `head_810501.png` chuẩn kích thước `100x100` px hiển thị sắc nét khi xuất chiến.
- **Đồ Giám:** Tab Phẩm 10 tải chuẩn asset `common_bm_quality_10_264c3006.png`, thưởng 400 Kim Cương mỗi khi kích hoạt pet mới.

### Phần 2: Mô phỏng Kỹ năng Chiến đấu (Authoritative Combat & Raid Replay)
- **Hiệu ứng Tiên Thiên (ExtraSkill type 45):** Tự động thi triển ở hiệp 0, trừ vĩnh viễn $30\%$ Công đối thủ và trừ $10\%$ Kháng nguyên tố tương ứng.
- **Nhịp độ ra chiêu (Cadence):** Kỳ Lân đánh mỗi hiệp (hiệp 1, 2, 3...); 4 linh thú còn lại đánh mỗi 2 hiệp (hiệp chẵn 2, 4, 6...).
- **Sát thương & Hồi máu:** Sát thương bằng $120\% + (\text{level}-1) \times 5\%$ Công nhân vật (đạt $140\%$ ở cấp 5). Hồi phục HP cho nhân vật bằng $30\%$ lượng sát thương gây ra.
- **Đồng bộ Replay Client (`raid.js`):** Phát sự kiện hiệp 0 `events[0]`, gán buff hint 45, phát animation kỹ năng `typ: 1, c: 10100`, hồi máu `typ: 7`, và buff công dồn 3 tầng `typ: 4, as: [44, stack]`.

### Phần 3: Tẩy luyện & Nâng cấp (Wash & Upgrade)
- **Loại trừ trùng lặp tuyệt đối:** Thuật toán `pickDistinctWashSkill` và `pickPassiveSkills` bảo đảm không bao giờ trùng lặp ID kỹ năng hoặc trùng nhóm gia tộc kỹ năng (`skillName`).
- **Tôn trọng ô khóa:** Các ô khóa (`lockSkills`) được bảo lưu 100%, không bị roll đè và không bị roll trùng.
- **Bảng chi phí khóa ô:** Khớp chuẩn công thức client `PetRefreshView.getRefreshCost` (10, 30, 90, 200, 400, 600, 800 viên Tẩy Tinh Đan).
- **Kích hoạt theo hệ nguyên tố:** Chỉ roll ra kỹ năng cùng hệ với Tinh linh (`type === pet.type`) hoặc hệ Chung (`type: 0`), loại bỏ tình trạng kỹ năng bị mờ.
- **Nâng cấp & Mở khóa skill:** Tiêu hao Quả Linh (item 36) theo `PetQualityConfig[10]`. Cấp 1, 40, 80, 120, 160 tự động nâng bậc kỹ năng từ 1 $\rightarrow$ 5. Tính năng Reset hoàn trả 100% Quả Linh.

### Phần 4: Phân phối & Kinh tế (Economy & Distribution)
- **Hoán Đổi (Swap - Tag 3312):** Khắc phục lỗi `quality >= getMaxPetQuality()`. Mở khóa hoán đổi phẩm 10 dùng 10 Đá Hoán Đổi (#162) hoặc 1 pet phẩm 7 làm phôi. Giữ nguyên 100% cấp độ, kỹ năng và ô khóa.
- **Nguyện Vọng Hoán Đổi (Wish - Tag 3313):** Đặt tâm nguyện phẩm 10, tỷ lệ trúng thực tế đạt **$62.5\%$** ($50\%$ ưu tiên + $12.5\%$ ngẫu nhiên).
- **Hợp Thành Thường (Compose - Tag 3302):** Ghép 2 pet phẩm 9 tốn 150 Quả Linh với tỷ lệ $0.1\%$. Khi thất bại bảo lưu linh thú chính cấp 65, chỉ tiêu hao linh thú phụ làm phôi.
- **Bảo vệ Tự Động Ghép (Auto-compose - Tag 3314):** Cố định trần tự động ghép $\le 8$, bảo vệ 100% pet phẩm 9 khỏi bị đốt nhầm.
- **Khóa trần Ấp Trứng 26 (Egg 26):** Dải phẩm chất mở trứng là `[4, 9]`, bảo vệ tính độc quyền của phẩm 10 Hỗn Độn.
- **Rương Tinh Linh Hỗn Độn Tự Chọn (Item 90018):** Hỗ trợ item `90018` mở tự chọn 1 trong 5 Tinh linh Hỗn Độn (đủ 7 kỹ năng bị động) phục vụ Sự Kiện, Quà Nạp Đầu, WebGM.
- **Phóng sinh & Đồ Giám:** Phóng sinh nhận 10.000.000 Bạc + hoàn Quả Linh; Đồ giám thưởng 400 Kim Cương.
- **Quyết định Hoạt ảnh Client:** Giữ nguyên $100\%$ hoạt ảnh gốc 4 tầng Spine của bản Trung theo đúng lựa chọn (Hướng 3).

---

## 3. Danh Sách File Cốt Lõi & Hash Xác Thực

| File | Đường Dẫn | SHA-256 Checksum | Trạng Thái |
| :--- | :--- | :---: | :---: |
| **pet.js** | `linhhoasu/lhs/newServer/src/handlers/pet.js` | `d764759b3ac00737a4cec224154d25b32ed615f87d044b71eb0f2242df7d6893` | Đã deploy |
| **ConfigService.js** | `linhhoasu/lhs/newServer/src/services/ConfigService.js` | `56f1e447f0ce889fc3cc7cc82055ea2731b9712c4323156b2665c49f46786da6` | Đã deploy |
| **BattleService.js** | `linhhoasu/lhs/newServer/src/services/BattleService.js` | `7e6d8b58c3ea6825362696694b30073bb269afe2a5f1d16b84e9fa008848ac91` | Đã deploy |
| **raid.js** | `linhhoasu/lhs/newServer/src/handlers/raid.js` | `4501cc2806ceb1399ebe97610e5f85c542129d579f2de7ea30ccda35d0daa1c6` | Đã deploy |
| **main.min_drop100.js** | `linhhoasu/webgame/game/js/main.min_drop100.js` | Native Chinese + Avatar Round Map + Compose Guard | Đã deploy |

---

## 4. Bằng Chứng Kiểm Thử Tự Động (100% PASS)

1. `test_pet_economy_complete.js`: **8/8 Tests PASS** (Swap 162, Swap Q7, Wish 64%, Compose q9 retain primary, Auto-compose guard, Egg 26 capped, Chest 90018, Atlas & Release).
2. `test_pet_wash_upgrade_complete.js`: **6/6 Tests PASS** (Deduplication 50 washes, Lock preservation, Cost scaling, Exp wash, Level up 1-160 milestones, Reset refund).
3. `test_pet_combat_skills.js`: **8/8 Tests PASS** (Hiệp 0 extraSkill debuff, cadence 1/2, cướp công 10%/13%, hút máu 30%, stack buff).
4. `test_raid_replay_contract.js`: **100% PASS** (Events format, PvP Duel, PvE Boss).
5. `test-core-gameplay-contract.js`: **PASS (718 tables)**.
6. **Hạ tầng VPS:** 6 node game `lhs-s1001` $\rightarrow$ `lhs-s1006` trạng thái `online`, HTTP port 81 `200 OK`, Domain HTTPS `200 OK`.
