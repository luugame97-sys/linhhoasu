# Xác minh công thức thuộc tính và PK — 22/09/2026

## Kết luận

**Chưa thể chứng nhận combat hiện tại là chuẩn.** Đã kiểm kê toàn bộ **197 ID AttrConfig**, đối chiếu mô tả live, hàm native client và hàm server; đã tái hiện 9 nhóm hành vi/lỗi bằng test cô lập. Đây là audit, không phải bản sửa. Không chỉnh player/config/game source, không deploy/restart, không dùng vé.

“Không ảnh hưởng PK” nên hiểu là không tạo sai lệch ngoài ý muốn và giữ đúng cơ chế từng build. Sửa các lỗi đã chứng minh có thể thay đổi kết quả thắng/thua; không thể vừa sửa công thức sai vừa bảo đảm mọi kết quả cũ giữ nguyên. LC cao hơn không phải điều kiện mặc định thắng.

## Nguồn và mức độ tin cậy

- Production `/linhhoasu/lhs/newServer/src/services/BattleService.js`: SHA256 `4690d027f9e55f17bb6791215e4f10e4bbd4d1b2e260160a32db80b644614530`. Local cùng hash.
- Production `/linhhoasu/webgame/game/js/main.min_drop100.js`: SHA256 `bd7979c98148a2066832fc2ab8d8210a55f21c52788555b20850f0d235ca4585`. Local cùng hash.
- Live ConfigService (môi trường PM2) + LanguageConfig: giải nghĩa 197 ID, loại dữ liệu, trọng số, liên kết và mô tả. Mô tả Việt hóa là bằng chứng về ý nghĩa công khai, **không thay thế engine/server gốc để xác nhận mọi hệ số/thứ tự tính**.
- Native `RoleModel.attrModify`, `changeAllAttr`, `calPowerByAttr`, `MountModel.GetAttrByUid` trích từ bundle hash trên. Differential chạy chính hàm native, không tự viết lại oracle.
- 31 receipt ZâmCaCa đã lấy ở lượt trước; tái sử dụng snapshot đúng trận, không query/đánh lại trên tài khoản.
- Đọc có giới hạn 3 hồ sơ S1/S2: Talo, FoxPlayer, ZâmCaCa, chỉ chạy calculator trên clone. Talo/ZâmCaCa hash đọc trước-sau bằng nhau; FoxPlayer thay đổi trong khi đọc nên chỉ dùng bản sao tại thời điểm fetch, không gán nó là packet HUD đồng thời.
- PM2 không đặt `CONFIG_BIN_PATH`: ConfigService dùng fallback path có sẵn; không coi biến env rỗng là mất config. Probe đã load bảng runtime thành công. Không xác nhận một file config chỉ bằng phỏng đoán env.

## Sai lệch đã xác minh

| Nhóm | Căn cứ native/config | Server hiện tại | Kết luận |
|---|---|---|---|
| Cộng % liên kết | Native cộng từng phần trên **cùng base ban đầu** | Nhân nối tiếp trên base đã tăng | Sai parity. 10.000 +10% +20%: native 13.000, server 13.200 |
| Né 104 / kháng154 | Mô tả có suy giảm sau nhiều lần né trong hiệp | `max(0,104-154)/10000`, không suy giảm | Cặp Zâm/Fox né chắc chắn cả hai; 15 hiệp tự thua bên công |
| Bạo kích105 | Mô tả cơ bản 2×; 202 tăng crit damage, 222 giảm crit damage | Hệ số `1 + attr205/10000`, fallback 1,5×; không đọc202/222 | **Dùng sai ID**: 205 là áp chế linh thú, không phải crit damage |
| Nguyên tố | 5/6 là công/thủ nguyên tố; 161–165 hiệu ứng, 171–175 kháng hiệu ứng | Cộng `max(0,171-181)..(175-185)` vào damage | **Dùng sai nhóm ID**, 181–185 không có trong 197 ID config này; 5/6 bị bỏ qua |
| Chảy máu/quấn/đóng băng/đốt/kiên nhẫn | 161–165 và kháng171–175 có mô tả hiệu ứng rõ | Không có trạng thái/giải quyết hiệu ứng này | Thiếu cơ chế, không phải chỉ lỗi số hiển thị |
| Liên kích/phản kích | Liên kích có suy giảm; phản kích ngắt liên kích | Cố định tối đa2 đòn, không suy giảm; bị phản kích chết vẫn chạy đòn thứ2 | Đã tái hiện đòn của người HP=0 |
| Choáng/phản kích | Mô tả không phản kích khi đang choáng | Ghi stun nhưng vẫn counter trong chuỗi; stun-state không được kiểm ở nhánh counter | Thứ tự và gate trạng thái cần sửa theo contract gốc |
| Hút máu | Theo sát thương, mô tả không thể bị né; có203/223 điều chỉnh trị liệu | Né return trước cả hút máu; bỏ203/223; đầy HP vẫn emit heal1 | Sai/thiếu semantics, heal1 tái hiện |
| Sát thương cuối | 241/242 tăng/giảm sát thương cuối | Không đọc trong simulator | Tăng LC nhưng không làm đổi sát thương trận qua nhóm này |
| Bonus chế độ | 531/532 Võ đạo, 533/534 Đỉnh Phong, 535/536 linh điền | Chỉ nhận `isPvp`, dùng245/246 | Không áp bonus đặc thù chế độ |
| Cương khí | 350–355: khiên, cường hóa, áp chế và chuyển đổi từ thủ | Không có shield HP/state | Chưa được thực thi, không thể coi đã tính đủ chỉ số |
| Hệ phái/ngũ hành/pet/thần binh | Nhóm204–260,261–288,301–315 và skill/buff có nghĩa riêng | Simulator chỉ nhận attrs và vài option, không nhận skill/job/effect context đầy đủ | Thiếu đường thi hành nhiều hiệu ứng; không được chứng nhận chuẩn |
| Bond thú cưỡi | Native cộng bond ngoài block mount được trang bị | `if (!mount) return` trước bond | **Edge regression bản mount**: không equip nhưng có bond bị mất bonus; fixture bond1 native+150 attr51, server0 |
| Nguồn chỉ số | Native có Curios, ValhallaFormation, SpecSpirit | Không có reader tương ứng trong `calcPlayerPower` hiện tại | Cần bổ sung có differential; không nối lại nguyên candidate cũ |

Lưu ý: simulator trực tiếp đọc **26/197 ID đang tồn tại**, và đọc thêm5 ID181–185 không có config. Đây là inventory code, **không có nghĩa 171 ID còn lại đều lỗi**: có nhóm chuyển đổi gián tiếp (10/51–56/201/207/221/227,9/801–805), kinh tế/ngoại trận hoặc riêng mode. Xem bảng từng ID ở `combat_attr_catalog_20260922.md`.

## Công thức thực thi hiện tại và phần chưa xác minh chuẩn gốc

- HP lấy1; ATK2; DEF3; speed4, hòa speed bên tấn công đi trước. Mô tả speed xác nhận bên nhanh đi trước; tie-break chưa có nguồn gốc.
- Damage cơ bản `ATK²/(ATK+DEF)` × random `[0,95;1,05)` + nhánh “element” sai ID; sau đó làm tròn và nhân tăng/giảm PVP245/246 hoặc PVE243/244. Rate có sàn10%, damage tối thiểu1. **Chưa có oracle gốc xác nhận công thức ATK/DEF, sàn, random hoặc thứ tự floor này.**
- Sáu proc101–106 trừ tương ứng151–156 rồi /10.000. Type2/format khớp đơn vị phần vạn nhưng không đủ chứng minh hàm xác suất cuối, trần, suy giảm, thứ tự trigger.
- Bạo kích không có202/222; combo cố định2; stun1 lượt; counter1 lần mỗi chuỗi; lifesteal bằng damage đến maxHP. Đây là mô tả implementation hiện tại, không gọi là chuẩn official.
- ConstConfig live `fightMaxRound=15`; timeout hiện `win = defenderHP<=0`. Chưa có nguồn xác nhận luật xử hòa gốc.
- PVE có nhánh min damage7% HP quái và `enforcePvePowerAdvantage` sửa kết quả thua thành thắng trên route áp dụng. Quái ID200000–299999 bị thay stats bằng công thức stage hardcode. Không lấy PVE pass nhờ các nhánh này làm bằng chứng combat chuẩn.
- Power client `ceil(sum(attr*weight))`, bỏ weight=-1; server legacy `floor(sum/100)` và explicit override999/powerScore. Display native và combat attrs phải đồng snapshot; power không thay công thức PK.

## Kiểm kê 21 nguồn native

Đã lập mapping; **chưa differential đủ từng cấu hình sở hữu/cấp/sao/trận hình**:

| Nguồn native | Server hiện tại | Trạng thái |
|---|---|---|
| Equip | equipSetMap[curIndex] → addAttrs | Có; cần parity defineLink và preset |
| Mount | addMountAttrs | Level/star đã có; phát hiện bond khi không equip |
| Formation | addFormationProgressionAttrs + formation base | Có; chưa full differential |
| Stage | RoleStageConfig | Có; server thêm level/box hardcode chưa xác nhận native |
| Pet | addPetAttrs | Có, passive `quality*12` cần oracle native |
| Fashion | addFashionAttrs | Có; cần đủ ownership/suit/echo |
| Item | addItemRecordAttrs | Có; cần ledger/ownership parity |
| Artifact | addArtifactAttrs + addOrbAttrs | Có; orb multiplier hardcode cần kiểm riêng |
| Spirit | addSpiritAttrs | Có; cần kiểm cộng cache và bảng tránh double count |
| Gem | addGemAttrs | Có; cần position/echo |
| Fate | addFateAttrs | Có; cần skill/job và effect runtime |
| Fishing | addFishingAttrs | Có; cần source/scale/fetter/rod/raft |
| Valhalla | addValhallaAttrs | Có; cần plan/upgrade/skill |
| Bloodline | addBloodlineAttrs | Có; cần tier/refine/echo và skill |
| Curios | Không thấy trong calculator | Thiếu reader |
| Elf | addElfAttrs | Có; chưa chứng nhận đầy đủ star/weapon/skill |
| Homeland | addHomelandAttrs | Có; cần bonus đất/nước/all và ownership |
| ValhallaFormation | Không thấy trong calculator | Thiếu reader |
| PetSoul | addPetSoulAttrs | Có; cần dispatch/ratio/star/skill |
| OldTrek | addOldTrekAttrs | Chỉ ship skins attrsExternal; cần đối chiếu phạm vi native |
| SpecSpirit | Không thấy trong calculator | Thiếu reader |

## Kiểm thử đã chạy

1. Native linked attrs: 11 test đơn từng linked ID khớp khi một nguồn; test hai nguồn% cùng base **không khớp**. Không có flat `linkId` dataType1 trong config live này, nên không gọi đây là lỗi flat đang ảnh hưởng player hiện tại.
2. Thay bước linked server bằng đúng hàm native **trên cùng bản sao raw server**, không ghi player:
   - Talo: LC786.127.052 →613.054.590; HP180.354.146 →136.994.245.
   - ZâmCaCa: LC6.996.618.129 →6.877.690.373.
   - FoxPlayer: LC5.570.213.523 giữ nguyên ở phép linked-only.
   Các số này **không phải full native parity hoặc số HUD cần áp dụng**: nguồn raw server còn thiếu/sai; sửa chỉ linked có thể làm LC giảm trong khi bonus thiếu chưa được bù đúng.
3. `test_combat_formula_audit_20260922.js`: **9 nhóm tái hiện PASS**, bao gồm exact pair và đảo chiều, sai ID crit/element, ignored attrs, counter-death/combo, stun/counter, heal1, mount bond. PASS nghĩa là tái hiện lỗi, **không phải combat đã sửa/đúng**.
4. Sweep197 ID với fixture ATK/DEF cùng seed; so rounds/outcome, tách `powerScore` vì đổi LC không đồng nghĩa đổi combat. Chưa bao mọi tổ hợp proc/state/skill.
5. Syntax diagnostic PASS; không live E2E trận mới, không reward/ticket mutation.

## Điều kiện để chốt bản sửa chuẩn

- Cần engine/source server gốc cùng phiên bản hoặc tài liệu công thức và battle traces gốc có thể đối chiếu. Bundle hiện chứng minh công thức **cộng thuộc tính**, không đủ để chứng minh mọi hệ số chiến đấu server-authoritative.
- SkillBehaviorConfig có5615 row, SkillConfig4357, SkillEffectConfig6977: có ID/type/args/effects nhưng chưa giải được toàn bộ semantics chỉ từ tên. Chưa tìm thấy bảng formula hoàn chỉnh trong nhóm config đã kiểm. Không tự đặt95% né, đổi mẫu số hoặc đoán hệ số suy giảm.
- Nếu không có nguồn gốc: phải chốt **quy tắc custom** rõ ràng; không gắn nhãn “chuẩn gốc”. Hiện chưa sửa theo hướng custom.
- Trình tự sửa đề xuất: (1) freeze fixture/version và backup chọn lọc; (2) parity21 nguồn + linked; (3) mapping197 ID/skill/state; (4) order/proc/timeout/mode; (5) đồng bộ client/self/other và snapshot đối thủ; (6) kiểm cô lập, canary, CAS/hash/rollback rồi native E2E có kiểm soát.
- Regression bắt buộc: build né/kháng, crit/kháng, combo/counter, lifesteal/heal, stun/freeze, shield, pet/artifact/element; speed tie; HP0; safe numeric limits; snapshot cũ và relog; Arena/CrossArena/Farm/PVE. Không ép thắng dựa LC và không rollback cả player DB để rollback code.

## Evidence

- `_ai_workbench/temp/combat_parity_20260922/formula_audit.json`: toàn bộ AttrConfig+language, native source trích, source hashes, component attrs3 player, link differential.
- `formula_regressions.json`: 9 nhóm tái hiện và sweep197 ID.
- `skill_config_audit.json`: inventory bảng skill/bond và samples.
- `cross_arena_case.json`: receipt trận thật từ lượt trước.
- `_ai_workbench/tools/audit_combat_formulas_20260922.{js,py}` và `test_combat_formula_audit_20260922.js`: diagnostic tái sử dụng, không deploy.
