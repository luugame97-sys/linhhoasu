'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const WB = path.resolve(__dirname, '..');
const reportDir = path.join(WB, 'reports');
const read = name => JSON.parse(fs.readFileSync(path.join(WB, 'temp', name), 'utf8'));
const fixture = read('items_recheck_production_fixture_20260905.json');
const catalog = read('item_catalog_production_recheck_20260905.json');
const live = read('items_recheck_live_20260905.json');
const byId = new Map(fixture.rows.map(r => [r.id, r]));
const blocked = fixture.rows.filter(r => r.status === 'LOI_DA_XAC_NHAN');
const native = [...new Set(catalog.nativeMisroutes.map(r => r.id))].sort((a,b)=>a-b);
const synthetic = [...new Set(catalog.syntheticOutputs.map(r => r.id))];
const indirect = catalog.indirect.map(r => r.id);
const direct = [...new Set([...blocked.map(r=>r.id), ...native, ...synthetic])].sort((a,b)=>a-b);
const pending = fixture.rows.filter(r => r.status === 'CAN_TEST_NATIVE').map(r => r.id);
assert.equal(catalog.summary.assets, 7951);
assert.equal(fixture.rows.length, 940);
assert.equal(catalog.summary.fixtureCases, 2439);
assert.equal(blocked.length, 263);
assert.equal(native.length, 47);
assert.equal(catalog.nativeMisroutes.length, 474);
assert.equal(direct.length, 311);
assert.equal(indirect.length, 2);
assert.equal(pending.length, 5);
assert.equal(live.runtime.auditedIds, 313);
assert(live.sourceUnchangedDuringAudit);
assert(blocked.every(r=>r.cases.every(c=>c.consumed===0)));
const safe = s => String(s || '').replace(/[\r\n|\t]/g, ' ').trim();
const label = id => safe(byId.get(id)?.name) || '(thiếu AssetsConfig)';
const groups = [
  {title:'P0 — Rương Yêu linh phát sai nơi lưu', code:'NATIVE_ELF_TO_BAG', ids:catalog.summary.nativeByKind.ElfConfig.ids, reason:'Trừ rương, cộng ID Yêu linh vào items nhưng elfInfo.elfData không tăng.',fix:'Grant Yêu linh native đúng ID; xử lý trùng thành mảnh và đồng bộ client theo contract.'},
  {title:'P0 — Rương Bí bảo phát sai nơi lưu', code:'NATIVE_CURIOS_TO_BAG', ids:catalog.summary.nativeByKind.CuriosConfig.ids,reason:'Trừ rương, cộng ID thân Bí bảo vào items nhưng curiosInfo.curiosData không tăng.',fix:'Phát thân Bí bảo vào collection native; phân biệt thân và mảnh, xử lý sở hữu sẵn.'},
  {title:'P0 — Rương Thần văn phát sai nơi lưu', code:'NATIVE_ORB_TO_BAG', ids:catalog.summary.nativeByKind.OrbConfig.ids,reason:'Trừ rương, cộng ID Thần văn vào items nhưng artifactInfo.orbInfo không nhận.',fix:'Grant Orb native đúng id/count/subCount, đồng bộ theo handler client thực tế.'},
  {title:'P0 — Rương Linh trục phát sai nơi lưu', code:'NATIVE_CONNECT_TO_BAG', ids:catalog.summary.nativeByKind.ValhallaFormationConnectItemConfig.ids,reason:'Trừ rương, cộng ID Linh trục vào items nhưng valhallaFormationInfo.connect không tăng.',fix:'Cộng connect native đúng cấp/hình/số lượng và sync; không phát vào túi thường.'},
  {title:'P0 — Rương trả vật phẩm trung gian chưa xử lý',code:'SYNTHETIC_REWARD_NOT_RESOLVED',ids:synthetic,reason:'90151 chọn option index 1 trả 100721 ×2 (type 99, random_connect_01), không sinh Linh trục.',fix:'Resolve 100721 bằng pool Linh trục cấp 1 có nguồn chuẩn; chưa có pool thì từ chối trước consume.'},
  {title:'P1 — Rương ngẫu nhiên đang bị chặn',code:'BLOCKED_RANDOM_POOL',ids:blocked.filter(r=>r.useType===102).map(r=>r.id),reason:'Server từ chối trước consume vì chưa có pool được xác minh.',fix:'Khôi phục bảng thưởng, tỷ lệ, số lượng, duplicate conversion từ nguồn chuẩn; không đoán theo tên/icon.'},
  {title:'P1 — Rương tự chọn thiếu lựa chọn',code:'EMPTY_SELECTION',ids:blocked.filter(r=>[90021,90022].includes(r.id)).map(r=>r.id),reason:'AssetsUseConfig.rewards rỗng; rương không mở được, không bị trừ.',fix:'Cần option/catalog gốc đúng chất lượng; không tự nâng phẩm chất để lấp dữ liệu.'},
  {title:'P2 — Đan thưởng tức thời đang bị chặn',code:'BLOCKED_PILL_CONTRACT',ids:blocked.filter(r=>r.useType===103).map(r=>r.id),reason:'Chặn để tránh mất đan trong khi contract thưởng, hạn mức chung/ngày chưa hoàn chỉnh.',fix:'Hoàn thiện reward thực, cap -802/-804, đặc quyền, reset ngày và đồng bộ login/relog trước bỏ chặn.'},
];
assert.equal(groups.reduce((s,g)=>s+g.ids.length,0),311);
const groupById = new Map(groups.flatMap(g=>g.ids.map(id=>[id,g])));
const rows = direct.map(id=>({id,name:label(id),status:'CONFIRMED_HANDLER_OR_CONFIG',category:groupById.get(id).code,
  symptom:groupById.get(id).reason,fix:groupById.get(id).fix,
  consumed:byId.get(id).cases[0]?.consumed,sourceUseType:byId.get(id).useType}));
const refreshedInventory = catalog.inventory.map(r=>({...r,
  auditStatus:groupById.has(r.id)?'CONFIRMED_HANDLER_OR_CONFIG':indirect.includes(r.id)?'DOWNSTREAM_BLOCKED':pending.includes(r.id)?'PENDING_NATIVE':byId.has(r.id)?'BASIC_FIXTURE_ONLY':'STATIC_ONLY_NOT_TAG1300'}));
const summary={catalogAssets:7951,useConfigRows:940,caseCount:2439,confirmedDirect:311,
  blocked:263,stillConsumesWithWrongDestination:48,downstreamBlocked:2,pending:5,basicFixtureOnly:622,
  nativeMisrouteCases:474,missingUseConfig:catalog.summary.missingUse,
  invalidRewardReferences:catalog.summary.invalidRewardRefs,invalidRewardCounts:catalog.summary.invalidCounts};
const output={generatedAt:live.generatedAt,scope:'Production code/config offline fixture + read-only inventory; not native E2E',summary,
  rows,downstream:catalog.indirect,pending:pending.map(id=>({id,name:label(id),issues:byId.get(id).issues})),inventory:refreshedInventory,
  sourceHashes:live.manifest,fixturePath:'items_recheck_production_fixture_20260905.json',catalogPath:'item_catalog_production_recheck_20260905.json'};
fs.writeFileSync(path.join(WB,'temp/items_deep_audit_final_20260905.json'),JSON.stringify(output,null,2)+'\n');
const txt = rows.map(r=>`${r.id}\t${r.name}\t${r.category}\t${r.symptom}`).join('\n')+'\n';
fs.writeFileSync(path.join(reportDir,'items_need_fix_deep_20260905.txt'),txt,'utf8');
assert.equal(txt.trim().split('\n').length,311);
const md = [
  '# Kiểm tra toàn bộ danh mục item và rà sâu rương — 05/09/2026', '',
  `Thời điểm xác minh production: ${live.generatedAt}. Chỉ đọc source/config và tồn kho; không deploy, không restart, không phát quà, không ghi MongoDB.`, '',
  '## 1. Kết luận và phạm vi', '',
  '- Quét cấu hình **7.951 item** trong AssetsConfig; chạy **940 mục AssetsUseConfig / 2.439 case**, gồm từng lựa chọn của rương chọn.',
  '- **311 ID lỗi trực tiếp cần fix**: 263 ID đang bị chặn và **48 ID vẫn trừ rương nhưng thưởng bị lưu sai/chưa resolve**.',
  '- **2 ID bị ảnh hưởng gián tiếp** vì một lựa chọn phát ra rương đang bị khóa. Tổng danh sách cần xử lý trực tiếp/gián tiếp: **313 ID**.',
  '- **5 ID chờ kiểm tra riêng**; **622 ID còn lại mới qua tiêu chí fixture cơ bản**, không khẳng định mọi pool, tỷ lệ, duplicate, quyền mở và native UI đều đúng.',
  '- 7.020 asset không khai báo useType được rà cấu hình, không ép gọi tag 1300 vì nhiều loại phải dùng trong hệ riêng. Có 5 asset không khai báo useType nhưng vẫn có AssetsUseConfig (94821–94825); thêm 4 use row không có AssetsConfig (94355–94358). Vì vậy không được cộng đơn giản 7.020 + 940 thành tổng catalog.',
  '- Không có item khai báo useType mà thiếu AssetsUseConfig; mọi reward id/count trong AssetsUseConfig đều có tham chiếu và số lượng hợp lệ theo kiểm tra tĩnh.', '',
  '| Nhóm | ID | Hành vi đã quan sát |', '|---|---:|---|',
  '| Yêu linh / Bí bảo / Thần văn / Linh trục | 47 | 474 case trừ rương, có dòng reward nhưng không cập nhật ownership native |',
  '| Rương 90151 | 1 | Option index 1 trả vật phẩm ảo 100721 ×2, không sinh Linh trục |',
  '| Rương random thiếu pool chuẩn | 111 | Từ chối, không trừ item |',
  '| Rương tự chọn thiếu option | 2 | 90021/90022 không có lựa chọn |',
  '| Đan type 103 có reward | 150 | Tạm chặn, không trừ đan |',
  '| Ảnh hưởng dây chuyền | 2 | 93065 / 100803 phát ra rương bị khóa |',
  '| Chờ native/config nguồn | 5 | 227 và 94355–94358 |', '',
  '## 2. Vì sao báo cáo cũ bỏ sót 48 ID?', '',
  'Fixture cũ xem result=0 và rewardInfo có dòng là đạt. Điều này chưa đúng: các ID thân Yêu linh/Bí bảo/Thần văn/Linh trục bị rơi qua RewardGrantService thành item túi. Việc tăng items không thay cho elfData/curiosData/orbInfo/connect. Audit này kiểm tra cả loại đầu ra và collection tương ứng.', '',
  '| Rương / lựa chọn | Đầu ra thực tế | State native |', '|---|---|---|',
  '| 90026, index 0 | items[154101] +1, trừ 1 rương | elfInfo.elfData không tăng |',
  '| 90101, index 0 | items[131301] +1, trừ 1 rương | curiosInfo.curiosData không tăng |',
  '| 90201, index 0 | items[9101] +1, trừ 1 rương | artifactInfo.orbInfo không tăng |',
  '| 90211, index 0 | items[200101] +1, trừ 1 rương | valhallaFormationInfo.connect không tăng |',
  '| 90151, index 1 | items[100721] +2, trừ 1 rương | Không resolve random_connect_01; 100721 không có use config |', '',
  'Đối chiếu source: item.js:addRewardRowsToPlayer/handleUseItem; RewardGrantService.js:getRewardKind/grantRewardRow; native handlers elf.js:handleElfSummon, curios.js:applyCuriosSummonRewardRows, artifact.js:handleArtifactOrbSummon và valhalla-formation.js:handleValhallaFormationSet. Đây là lỗi server ở handler/config được tái hiện trên source production; chưa thao tác UI hoặc lưu/relog một nhân vật thật trong phiên này.', '',
  '## 3. Danh sách đầy đủ 311 ID lỗi trực tiếp', '',
  'Có thể tìm bằng Ctrl+F theo ID/tên. Bản TXT: [items_need_fix_deep_20260905.txt](items_need_fix_deep_20260905.txt).', '',
];
for(const group of groups){
  md.push(`### ${group.title} (${group.ids.length} ID)`,'',group.reason,'',`Cần fix: ${group.fix}`,'',
    '| ID | Tên trong client | UseType |','|---:|---|---:|');
  for(const id of group.ids)md.push(`| ${id} | ${label(id)} | ${byId.get(id).useType} |`);
  md.push('');
}
md.push('## 4. Hai rương bị ảnh hưởng gián tiếp','',
  '| ID | Tên | Lựa chọn lỗi dây chuyền | Xử lý |','|---:|---|---|---|',
  '| 93065 | Hộp quà Tự chọn tọa kỵ | Index 13 → 94719 ×1; 94719 đang bị chặn | Fix pool 94719 rồi test lại; không kết luận mọi lựa chọn của 93065 đều hỏng |',
  '| 100803 | Hộp quà mê hạm | Index 2 → 94709 ×3; 94709 đang bị chặn | Fix pool 94709 rồi test lại |','',
  '## 5. Chờ xác minh, không trộn vào 311 lỗi trực tiếp','',
  '| ID | Hiện trạng |','|---:|---|',
  '| 227 | Chỉ đoản tình trường; useType 108, flow client riêng, không kết luận lỗi từ tag 1300 |',
  '| 94355 / 94356 / 94357 / 94358 | Có AssetsUseConfig nhưng không có AssetsConfig, chưa biết có được phát thực tế hay là cấu hình dư |','',
  '- 94821–94825 đã nằm trong 111 rương bị chặn. Đồng thời AssetsConfig không khai báo useType/ẩn hiển thị; cần xác nhận luồng kho báu câu cá, không tự bật useType.',
  '- Tra cứu trong file ngôn ngữ cho thấy 569 ID thiếu chuỗi tên, 2.866 ID thiếu chuỗi mô tả. Đây chỉ là cảnh báo lookup/cấu hình có cả asset ẩn; chưa chứng minh từng ID bị lỗi hiển thị trên client, không cộng vào lỗi mở rương.',
  '- Chưa audit E2E mọi hệ tiêu nguyên liệu, trang bị, ngoại quan, limit/conditions, mua/bán, expiry, concurrent/retry/save-failure. Danh sách là lỗi đã chứng minh trong phạm vi trên, không phải bảo đảm các ID ngoài danh sách hoàn toàn tốt.','',
  '## 6. Tồn kho hiện tại và thứ tự nên sửa','',
  `Read-only MongoDB lúc ${live.runtime.generatedAt}; scope 313 ID.`, '',
  '| Server | Người thật được đọc | Người giữ ID trong danh sách | Item đang giữ |','|---|---:|---:|---|');
for(const [db,r] of Object.entries(live.runtime.databases))md.push(`| ${db} | ${r.humanCount} | ${r.affectedHumans} | ${r.humanItems.map(i=>`${i.id} ×${i.count}`).join('; ')||'Không thấy'} |`);
md.push('',
  '- Không thấy attachment mail chưa nhận hoặc GiftCode active chứa 313 ID trong các collection được kiểm tra.',
  '- Tồn kho không chứng minh lịch sử đã mất quà. Không bù/thu hồi tự động nếu thiếu ledger giao dịch.',
  '1. Ưu tiên 90027, 90202, 90214 đang có trên người thật và vẫn tiêu rương; sửa chung router cho 47 ID native cùng 90151.',
  '2. Khôi phục 100139 vì 3 người giữ tổng 823 cái; sau đó 110 rương bị chặn còn lại. 100139 là mảnh huyết mạch, không tự đổi thành nguyên thân.',
  '3. Sửa contract 150 đan, bổ sung option gốc 90021/90022; test 93065/100803 sau khi rương con chạy đúng.',
  '4. Mỗi nhóm: đúng ID/count/quality/level; đã sở hữu; mở nhiều; selection sai; retry; lỗi save; relog; native client. Chỉ bỏ chặn sau khi đạt contract.','',
  '## 7. Bằng chứng và giới hạn','',
  '- Fixture được chạy trực tiếp với source/config production trong tiến trình riêng qua SSH stdin; savePlayer/savePlayerDeferred chỉ ghi vào object fixture, không kết nối DB. Các filesystem write API bị chặn; không upload script lên VPS.',
  '- Manifest 142 file source/package và 2 config kiểm trước/sau không đổi. Local khác production ở 49 file và base config; kết luận cuối dùng production, không dùng local để thay thế.',
  '- Contract safe-release local chạy lại PASS: 42 option P0, 42 random hỗ trợ, 111 random bị chặn, 150 đan giữ nguyên. Đây chỉ là hồi quy bản thu hẹp, không phủ nhận 48 lỗi vừa phát hiện.',
  '- Source game, client, tài khoản/người chơi và dịch vụ không chỉnh sửa; chỉ thêm tool, evidence và báo cáo dưới _ai_workbench.', '',
  '| Artifact | SHA-256 |','|---|---|');
for(const filename of ['items_recheck_production_fixture_20260905.json','item_catalog_production_recheck_20260905.json','items_recheck_live_20260905.json']){
  md.push(`| temp/${filename} | ${crypto.createHash('sha256').update(fs.readFileSync(path.join(WB,'temp',filename))).digest('hex')} |`);
}
md.push('','## 8. Nhật ký lỗi và chống lặp','',
  '| Lỗi/phát hiện | Nguyên nhân | Xử lý trong phiên audit | Cách tránh lặp |','|---|---|---|---|',
  '| Fixture xanh giả cho reward native | Chỉ kiểm có dòng reward, không kiểm collection | Phân loại lại 47 ID và 1 ID synthetic | Assert đúng nơi sở hữu, output contract và duplicate |',
  '| Local khác production | Cây source/config chưa đồng nhất | Đọc manifest, chạy fixture trên production | Gắn mọi kết luận với hash/time/scope |',
  '| Quét JS minify trả output quá lớn | Một dòng chứa cả bundle | Không dùng kết quả bị cắt để kết luận | Giới hạn match/substrings hoặc parser, không in cả dòng minify |',
  '| Mongoose cảnh báo isNew | Tên field model trùng thuộc tính reserved | Ghi nhận; không sửa model ngoài scope | Tách task model và migration nếu cần |',
  '| HTML session cũ thiếu cập nhật cuối | Markdown mới hơn HTML | Render lại đầy đủ sau append | Luôn sinh và kiểm cả MD/HTML |','');
md.pop();
md.push('| Lệnh kiểm HTML one-liner lỗi escape | PowerShell truyền dấu nháy sang node -e sai | Chuyển kiểm tra vào verify_item_deep_audit_report_20260905.js | Dùng script với assertion cho chuỗi HTML có nháy |','');
const markdown = md.join('\n');
assert(!markdown.includes('\uFFFD'));
fs.writeFileSync(path.join(reportDir,'items_deep_audit_20260905.md'),markdown,'utf8');
console.log(JSON.stringify({result:'PASS',summary,report:path.join(reportDir,'items_deep_audit_20260905.md'),list:path.join(reportDir,'items_need_fix_deep_20260905.txt')}));
