# Tăng sao không tăng cấp kỹ năng thú cưỡi — 17/10/2026 12:28 ICT

## Kết luận

Đã xác định lỗi backend `handleMountSwallow` (RPC3205), không phải chỉ cache/UI. Chỉ audit source/config/live Mongo và fixture RAM; chưa sửa production, không tiêu thú nguyên liệu, không nâng sao hoặc bù kỹ năng người chơi bằng tooling.

## Bằng chứng

- Talo/S1 đang cưỡi `id22506, uid100002`, cấp92, sao5. Bốn passive đúng tên trong ảnh: Choáng106/phẩm6, Kháng tính phản đòn152/phẩm3, Kháng né tránh154/phẩm3, Né tránh104/phẩm6. Cả `skills` và `passiveSkills` đều level1, tổng4.
- Handler live tăng `target.star += material.star + 1` (cap40), cập nhật attrs rồi chỉ chép skills nguyên liệu khi target còn trống (<4). Khi đã đủ4, vòng for dừng ngay; vòng while bổ sung slot cũng không chạy. Không có câu lệnh tăng `skill.level` hoặc phân bổ lượt nâng. Sau đó nguyên liệu bị xóa và lưu thành công.
- Config `SwordPassiveSkillConfig` có cấp1–10 cho toàn bộ12attr,3phẩm3/4/6; không phải kỹ năng bị cap1.
- Native preview tăng sao tính số lượt nâng ngẫu nhiên `min(40 - tổng cấp passive hiện tại, material.star + 1)`; language30030634 là “Tăng ngẫu nhiên {0} lần kỹ năng”. Do vậy phần xử lý server đang thiếu so với contract preview.
- Kỹ năng chủ động khác với bốn passive trong ảnh: `SwordConfig[22506].skillConds=[3,8,13,18,23,28,33,38]`. Native `GetMountSkillByData` chọn active skill theo các mốc sao; không dùng số này làm cấp của passive.
- Tái hiện đúng hàm handler đọc từ VPS trong VM với dữ liệu snapshot: target5sao + nguyên liệu1sao →7sao, response result0, nguyên liệu bị loại khỏi danh sách fixture, bốn passive vẫn1. `productionWrites=0`, `gameRpcCalls=0`, save chỉ là stub RAM.
- Hồ sơ khác cùng player: uid100001 sao23 vẫn bốn passive1; uid100006 sao7 cũng bốn passive1. Có thể ảnh hưởng các thú đã tăng sao trước đây; chưa scan toàn fleet hoặc dựng lịch sử vật liệu để xác định bù.

## File chính và bước sửa

- VPS: `/linhhoasu/lhs/newServer/src/handlers/mount.js`, `handleMountSwallow`; configSwordPassiveSkillConfig/SwordBaseConfig; native `MountSwallowView.updateUI` và `MountModel.GetMountSkillByData`.
- Evidence: `_ai_workbench/temp/mount_skill_star_audit_20261017/{mount.js,live.json,contract.json,reproduction.json}`.
- Hướng sửa: phân bổ đúng lượt nâng passive theo contract, mỗi skill cap10/tổngcap40, giữ quality/ID; validate nguyên liệu/target và xử lý transaction an toàn trước khi tiêu nguyên liệu. Cần tách quyết định phục hồi lịch sử vì hiện không có ledger chứng minh từng lần chọn kỹ năng ngẫu nhiên. Không tự nâng đồng loạt hoặc tự bù theo phỏng đoán.
