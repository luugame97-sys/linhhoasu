# Audit pet Hỗn Độn trong danh sách GM/Giftcode — 30/09/2026

- Read-only trên VPS `103.116.104.165`; không sửa `gmitem.txt`, không gửi thư, không tạo giftcode.
- Runtime game S1–S6 có đủ 5 pet phẩm 10: `810101`, `810201`, `810301`, `810401`, `810501` trong `PetConfig` (46 pet).
- Runtime `ConfigService` cũng có item `90018` và `AssetsUseConfig[90018]`; item này mở rương chọn 1 trong 5 pet Hỗn Độn.
- WebGM live `assets/item/gmitem.txt`: 7.954 dòng; catalog runtime cũng 7.954 ID. Cả 6 ID `810101–810501` và `90018` đều **không có** trong catalog; `99001/99002` là hai custom box duy nhất đang được thêm riêng.
- `vht6ur_item_catalog()` lấy `gmitem.txt` làm whitelist; `vht6ur_item_allowed()` và `hk_reward_exists()` dùng whitelist này. Vì vậy cả GM gửi đồ và giftcode hiện đều không cho chọn/nhận 5 pet trực tiếp hoặc rương `90018`.
- `RewardGrantService` đã có nhánh nhận diện `PetConfig` ID là `pet`, nên sau khi whitelist có kiểm soát, gửi trực tiếp ID pet có thể đi qua mail và grant vào `petInfo`; không cần giả làm item thường. `90018` nên gửi như item rương để người chơi tự mở chọn pet.

## Đã triển khai whitelist — 30/09/2026

- Đã thêm 6 dòng vào live `/linhhoasu/webgame/gm/assets/item/gmitem.txt`: 5 pet Hỗn Độn và `90018`.
- Backup: `/linhhoasu/_ai_workbench/backups/gmitem_chaos_20260930_20260930_184951`.
- CAS preimage: `f23dbfd7…`; postimage: `6954c234…`; catalog tăng từ 7.954 lên 7.960 ID.
- PHP whitelist read-back trả `allowed=true` cho cả 6 ID; `config.php` syntax PASS. Không restart PM2, không ghi player/DB.
