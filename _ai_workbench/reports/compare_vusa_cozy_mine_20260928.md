# Đối chiếu bản hiện tại, VUSA và Cozy — 28/09/2026

## Cập nhật kiểm chứng port — 28/09/2026 23:00 ICT

- **Đã lấy được assets; kết luận thiếu assets bên dưới là lịch sử.** Manifest mới `default.res_main_56f938ac.bin` có 38.939 resources. Gói `_ai_workbench/temp/vusa_login_assets_20260928/` có 30 file của 5 pet; read-back SHA-256 khớp `download_results.json` **30/30**, tổng **11.469.981 byte**. Mỗi pet có JSON Spine, atlas, PNG và 3 icon/minh họa. Chưa kiểm thử render trên client.
- Tải bổ sung language VUSA qua đúng URL resource công khai vào `config_lang_c2fa8585_vusa.bin`: 796.344 byte, SHA-256 `d33804329b459a99e12e1f0f95e4e9dcaf6e44527657bf5727b2278ea3136519`; decode 38.488 keys, có 47 keys mới. Không thay language đang dùng của bản mình.
- **Chặn phát hành logic, không chỉ thiếu extraSkill:** `raid.js:453` chỉ chọn skill chính; `:609` phát lại sát thương pet bằng 25% sát thương đòn nhân vật. `BattleService.simulateBattle()` nhận attrs/options, không nhận và thực thi bộ PetSkillConfig theo chu kỳ, hệ số, buff của 5 pet. Nhánh CustomCombatService là công thức custom và được chọn qua flag; lượt này chưa xác minh flag production hiện tại.
- Mô tả VUSA yêu cầu chu kỳ 1/2 lượt, hệ số riêng theo cấp skill, buff cộng dồn, hồi máu và extraSkill suy yếu/chuyển thuộc tính trước trận. Có config type45/args3000, nhưng config + text chưa đủ chứng minh thứ tự xử lý, tie-break, làm tròn và tương tác toàn bộ giống backend VUSA. Không sửa battle bằng hiệu ứng hiển thị giả.
- **Rủi ro hợp thành:** local `PetQualityConfig[9].composeSuccessRate=0`; VUSA là `10`. Bổ sung quality 10 làm `canPetCompose()` chấp nhận q9. Nhánh thất bại `handlePetCompose()` hiện tạo pet kết quả và xóa cả hai UID đầu vào; language VUSA `39100002` mô tả giữ pet chính, tiêu hao pet phụ. Đây là khác biệt source/text cần đối chiếu runtime, chưa dùng text làm bằng chứng backend VUSA đã thực thi đúng.
- Chỉ audit source/config và xác minh file trong lượt này; **chưa tạo candidate tích hợp, chưa sửa source/config đang dùng, chưa deploy/restart/ghi player**. Trạng thái: đủ dữ liệu để bắt đầu port cô lập, chưa đủ điều kiện đưa online với cam kết chuẩn logic VUSA. Bước tiếp: fixture hợp thành q9→q10 thất bại/thành công, port battle có kết quả HP/buff authoritative và replay khớp, rồi QA client/canary. Giữ nguyên các extension và công thức ngoài phạm vi 5 pet.

## Kết luận nhanh

- **VUSA live mới hơn về linh thú**: có **46** pet; bản hiện tại và Cozy có **41**.
- VUSA chỉ hơn **5 pet**, nhưng đây là một tier mới hoàn chỉnh: **quality 10 / Hỗn Độn**, kèm skill, effect, ngôn ngữ và cấu hình hợp thành.
- **Chưa thể chép thẳng** vào bản hiện tại. VUSA config mới nhưng manifest client công khai hiện chưa thấy asset thân/icon `sp_pet_810*`; nếu chỉ chép config sẽ có nguy cơ pet hiện ô trống hoặc lỗi khi preview/chiến đấu.
- Bản hiện tại mới hơn ở nhiều phần mở rộng riêng: thời trang, đá/gem, cấp tiến triển, fish scene và các patch/runtime custom. Không được ghi đè toàn bộ config/client VUSA.
- Cozy **không có 5 pet Hỗn Độn**. Cozy mới hơn chủ yếu ở reward/economy và gói Việt hóa; nhiều reward thêm item `1001` (**Xu Nạp**).

## Nguồn và độ tin cậy

Đối chiếu raw config đã giải mã, không dùng dữ liệu player/DB và chưa thay đổi production:

- Bản hiện tại: `linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin` — 4,043,507 bytes.
- VUSA live tải trực tiếp từ `https://tutien.vusagaming.net/update/resource/assets/excel/config_e5ac72c2.bin` — 1,443,490 bytes; language live 796,344 bytes.
- Cozy: `_ai_workbench/temp/cozy_rip/config_e5ac72c2.bin` — 1,450,552 bytes; language 707,667 bytes.
- Bảng so sánh máy: `_ai_workbench/temp/compare_three_versions_live_20260928.json`.
- Manifest VUSA live đã parse: `_ai_workbench/temp/vusa_manifest_live.json` — 38,908 resources.

Trang công khai VUSA hiện ghi Linh Họa Sư đang mở, Open Beta và phiên bản “Đang cập nhật”; phần chơi yêu cầu VUSA ID ([trang VUSA](https://vusagaming.net/games/linh-hoa-su)).

## 1. Linh thú mới của VUSA

| ID | Tên VUSA | Hệ | Quality | Điểm chính |
|---:|---|---|---:|---|
| 810101 | Hỗn Độn Thánh Kỳ Lân | Kim | 10 | skill `Hỗn Độn · Lôi đình vạn quân` |
| 810201 | Hỗn Độn Bắc Minh Huyền Vũ | Thủy | 10 | skill `Hỗn Độn · Băng hồn hỏa tiễn` |
| 810301 | Hỗn Độn Hạo Thiên Thần Khuyển | Thổ | 10 | skill `Hỗn Độn · Bão bóng tối` |
| 810401 | Hỗn Độn Nam Minh Chu Tước | Hỏa | 10 | skill `Hỗn Độn · Nam Minh Niết Bàn Hỏa` |
| 810501 | Hỗn Độn Địa Tạng Đế Thính | Mộc | 10 | skill `Hỗn Độn · Nguyệt tận cùng` |

VUSA bổ sung đồng bộ:

- `PetConfig`: +5 pet.
- `PetQualityConfig`: quality `10`, 7 passive skills, compose success `0`, consume `250` item `36`, add consume `180`.
- `PetBaseConfig.breakLimitPetQuality`: thêm `10`.
- `PetSkillConfig`: +5 bộ skill, mỗi pet có 5 cấp + extra skill.
- `SkillConfig`: +30 rows; `SkillBehaviorConfig`: +48; `SkillEffectConfig`: +18; `EffectConfig`: +5.
- `AssetsConfig` và `AppearanceConfig`: +5 rows.
- Language: +47 key, gồm tên pet, tên skill, mô tả 5 cấp và mô tả Hỗn Độn.

## 2. Asset client VUSA — điều kiện chưa đạt

Manifest live VUSA có resource skill/effect dùng chung (ví dụ `sp_skill_baodian_89101`, `89301`, `89501`, `sp_skill_buff_89201`), nhưng khi lọc 38,908 resource:

- Không thấy `sp_pet_810101`, `sp_pet_810201`, `sp_pet_810301`, `sp_pet_810401`, `sp_pet_810501`.
- Không thấy icon riêng `icon_810101` … `icon_810501`.
- Vì vậy hiện mới chứng minh được **config + skill pipeline**, chưa chứng minh được đủ sprite/skeleton/icon để client hiển thị 5 pet mới. Có thể VUSA đang dùng manifest/asset route khác, nhưng chưa có bằng chứng công khai trong manifest hiện tại.

## 3. Bản hiện tại mới hơn VUSA/Cozy

Raw config hiện tại có nhiều row mở rộng mà cả VUSA live và Cozy không có:

- `FashionConfig`: +102; `AssetsConfig`: +597; `AppearanceConfig`: +108.
- `FashionDressConfig`: +6; `FashionDressLevelConfig`: +3; các bảng button/color/bubble/end-dress cũng có row riêng.
- `FormationGradeConfig`: +990 rows.
- `SpiritGradeConfig`: +960 rows.
- `GemLevelConfig`: +540; `GemComposeConfig`: +540; `GemShapeConfig`: +90.
- `PlantLevelConfig`: +60.
- `FishSceneConfig`: +3.
- Client hiện tại `main.min_drop100.js` 8,985,417 bytes, lớn hơn VUSA live `main.min_vi_1e47377c.js` 8,872,077 và Cozy `main.min_a6195824.js` 8,910,631; source local còn các patch/runtime custom trong `linhhoasu/lhs/newServer/src`.

Đây là phần custom của bản mình, không nên coi là “rác” rồi thay bằng config VUSA.

## 4. VUSA mới hơn ngoài pet

Ngoài 5 pet, VUSA live có thêm các nhóm liên quan:

- Shop/Pay riêng: `ShopConfig` +6 rows, `PayConfig` +4 rows, trong đó có banner `store_banner_lingsui`.
- Các row skill/effect mới nói trên đều liên quan trực tiếp đến 5 pet Hỗn Độn.
- VUSA language có 38,488 rows; bản hiện tại 38,441; Cozy 38,441. 47 key dư của VUSA chính là bộ tên/mô tả Hỗn Độn và skill mới.

## 5. Cozy mới hơn VUSA ở đâu

Cozy vẫn chỉ có 41 pet, không có quality 10. Các khác biệt chính so với VUSA live:

- Có thêm row nền trong 8 bảng: `AlchemyBaseConfig`, `ConstConfig`, `CrossArenaBaseConfig`, `DemonBossBaseConfig`, `DoubleTowerBaseConfig`, `FishBaseConfig`, `OldTrekBaseConfig`, `SwordParadiseBaseConfig` — tổng 15 row.
- Có 184 row khác giá trị; 126 row có thêm item `1001` (**Xu Nạp**) vào reward/economy.
- Gói Việt hóa Cozy có 707,667 bytes và 2,334 ảnh UI lang đã được bóc tách trước đó; chất lượng Việt hóa UI tốt hơn raw text hiện tại.

Cozy không phải nguồn pet mới trong dữ liệu hiện có; điểm mạnh của Cozy là Việt hóa và economy/reward tuning.

## 6. Hướng update an toàn

### Giai đoạn A — không đụng production

1. Giữ backup/CAS cho toàn bộ file config, client và manifest.
2. Tạo candidate riêng bằng cách merge **chỉ delta pet VUSA**, không ghi đè raw `config_e5ac72c2.bin`.
3. Merge tối thiểu các bảng: `PetConfig`, `PetQualityConfig`, `PetBaseConfig`, `PetSkillConfig`, `SkillConfig`, `SkillBehaviorConfig`, `SkillEffectConfig`, `EffectConfig`, `AssetsConfig`, `AppearanceConfig`, và 47 key language.
4. Không đưa `ShopConfig/PayConfig` vào production ở bước đầu; đây là scope kinh tế riêng, cần policy giá và reward được duyệt.

### Giai đoạn B — bổ sung asset bắt buộc

1. Lấy đủ asset gốc hợp lệ cho 5 pet: body/skeleton/PNG/KTX, icon và resource-map/manifest tương ứng.
2. Kiểm tra hash, tên resource, `appearId`, `effect`, preview, battle và cache-bust.
3. Nếu chưa có asset 5 pet, **không bật pet mới cho player**; chỉ giữ candidate để tiếp tục kiểm tra.

### Giai đoạn C — test offline và canary

1. Decode/validate 714 bảng; xác nhận quality 10, break-limit 10, 5 pet, 30 skill, 48 behavior, 18 effect, 5 effect.
2. Test server-authoritative: grant pet, level skill, passive skill count = 7, compose fail/success, swap/wish, atlas, reset và reward payload.
3. Test client: pet list, icon, preview, battle effect, skill text, no missing-resource/network 404.
4. Chạy trên test/canary riêng, read-back hash và readiness; chưa gửi reward hay tạo player thật trên production.

### Quyết định hiện tại

**Có thể port về mặt cấu hình, nhưng chưa đủ điều kiện deploy.** Ưu tiên lấy/khẳng định đủ 5 bộ asset client trước; sau đó mới merge delta bằng CAS và test từng pipeline. Không chép nguyên bản VUSA hoặc Cozy vì sẽ làm mất các extension thời trang/progression/fishing của bản hiện tại.

### Kiểm chứng bổ sung sau audit

- Fixture server-only đã pass khi merge delta trong memory: grant `810101` tạo pet quality 10, 7 passive skills và mở atlas; `productionWrites=0`, `networkAttempts=0`.
- `raid.js` hiện chỉ resolve skill chính từ `PetSkillConfig`; field VUSA `extraSkill` chưa được xử lý trong server battle event. Muốn parity đầy đủ với VUSA phải bổ sung/kiểm thử extra-skill buff riêng; nếu không, pet vẫn grant/đánh được nhưng có thể thiếu hiệu ứng phụ.
- Vì vậy trạng thái chính xác là: **server-side port khả thi; client asset và extra-skill parity còn thiếu; chưa deploy**.
