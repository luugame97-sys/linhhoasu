"""Build a reviewable fashion update inventory and verified portable source pack."""
import hashlib
import json
import re
import struct
import zipfile
import zlib
from pathlib import Path

from recover_cn_fashion_20260909 import OUT, WB, write_json


def load(name):
    return json.loads((OUT / name).read_text(encoding='utf-8'))


def validate_png(data):
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos, chunks, dimensions = 8, [], None
    while pos < len(data):
        length = struct.unpack_from('>I', data, pos)[0]
        kind = data[pos+4:pos+8]
        payload = data[pos+8:pos+8+length]
        stored = struct.unpack_from('>I', data, pos+8+length)[0]
        assert zlib.crc32(kind + payload) & 0xffffffff == stored
        if kind == b'IHDR':
            dimensions = struct.unpack_from('>II', payload)
        if kind == b'IDAT':
            chunks.append(payload)
        pos += length + 12
        if kind == b'IEND':
            break
    assert pos == len(data) and dimensions and min(dimensions) > 0
    assert len(zlib.decompress(b''.join(chunks))) > 0
    return dimensions


def main():
    a, resources, downloaded, fixture = map(load, ['system-audit.json','resource-audit.json','assets-download.json','compat-fixture.json'])
    assert not downloaded['errors'] and fixture['productionWrites'] == fixture['networkAttempts'] == 0
    assert not a['integrity'] and not a['missingDependencies']
    verified, pngs, png_dimensions = [], 0, []
    for row in downloaded['files']:
        source = Path(row['storedAt'])
        data = source.read_bytes()
        assert len(data) == row['bytes'] and hashlib.sha256(data).hexdigest() == row['sha256']
        expected = re.search(r'_([0-9a-f]{1,8})\.[a-z]+$', source.name)
        if expected:
            assert zlib.crc32(data) & 0xffffffff == int(expected.group(1),16)
        if source.suffix == '.png':
            w,h = validate_png(data);pngs += 1;png_dimensions.append({'name':row['name'],'width':w,'height':h})
        verified.append({'name':row['name'],'path':row['path'],'bytes':len(data),'sha256':row['sha256'],'storage':row['storage']})
    check = {'result':'PASS','files':len(verified),'totalBytes':sum(r['bytes'] for r in verified),'pngStructureAndZlibVerified':pngs,
             'reusedLocal':sum(r['storage']=='existing-local-CRC-verified' for r in verified),
             'pngs':png_dimensions,'visualRenderTested':False,'filesVerified':verified}
    write_json(OUT/'asset-verification.json',check)
    translations={28310:'Trần Diệu Thương Khung (tạm dịch)',28370:'Viêm Đế Tiêu Viêm',28380:'Võ Tổ Lâm Động',28410:'Tinh La Trùng Ảnh (tạm dịch)',29280:'Phi Tuyết Nhân Mặc (tạm dịch)',29820:'Thương Lan Vân Mộng (tạm dịch)'}
    types={0:'Bộ thường',1:'Bộ liên động/nâng cấp',2:'Bộ đổi màu',3:'Áo tắm',4:'Bộ kết liễu'}
    standalone_vi={11291:'Họa Trung Tiên Cảnh',11292:'Tự Tại Tu Hành',11466:'Khung đại diện động Côn Du',11566:'Bong bóng chat động Côn Du',11837:'Ảnh đại diện Viêm Đế Tiêu Viêm',11838:'Ảnh đại diện Võ Tổ Lâm Động',12078:'Linh Họa Hà Sơn',12079:'Yên Mặc Lưu Kim',15002:'Linh Tịch Liên Hoa',15502:'Bào Bào Áp Thú',21141:'Nguyệt Tướng Nhiễu Đình',21150:'Thương Tùng Hàm Hi',22041:'Nguyệt Ảnh Thành Thố',22050:'Phù Chu Độ Mặc',23038:'Tinh Hà Lãm Nguyệt',23046:'Côn Khiếu Thương Khung · Bích Lan',23047:'Côn Khiếu Thương Khung · Sương Diệu',23048:'Côn Khiếu Thương Khung · Huyền Tẫn',23049:'Hú Diệu Mặc Tùng',24140:'Châm Tinh Chước Nguyệt',24142:'Lưu Phong Phá Không',24149:'Côn Du Họa Cảnh · Bích Lan',24150:'Côn Du Họa Cảnh · Sương Diệu',24151:'Côn Du Họa Cảnh · Huyền Tẫn',24152:'Túy Mặc Lưu Thương'}
    lines=['# Kiểm kê và kế hoạch cập nhật toàn bộ thời trang — 09/09/2026','',
      '**Đã kiểm kê cấu hình và hợp đồng client/backend; đã lấy dữ liệu nguồn. Chưa tích hợp hoặc phát hành bản thời trang mới.**','',
      '## 1. Nguồn và phạm vi','',
      f"- Nguồn Trung được lấy lại từ [entrypoint của APK đã cung cấp](https://lhsi.guangzhougy.com/agent/70000001/index.html): `{a['sourceBuild']}`, cấu hình `{a['sourceConfig']}`. Đây là build đang được entrypoint này công bố, không khẳng định mọi kênh Trung cùng phiên bản.",
      '- Đã thay mốc so sánh cũ `main.min_97d2b812.js` bằng build hiện hành; bản cũ chỉ dùng truy nguyên. Không chép main bundle Trung đè bản Việt.',
      '- Phạm vi: đủ 13 bảng Fashion*, 2.078 dòng FashionConfig, 65 khai báo bộ, quan hệ mảnh/biến thể, item/rương, appearance, kỹ năng/hiệu ứng liên quan, ngôn ngữ, manifest và pack tài nguyên.',
      '- Local được đối chiếu live 14 file. Một file config server khác byte nén nhưng **20 bảng liên quan khớp nội dung** giữa local/server/client; những file code được kiểm đều khớp live.',
      '- Kiểm thử hành vi bằng handler và hàm native thật trong RAM, cấm network; productionWrites=0. Không thử mọi model trên trình duyệt ở lượt kiểm kê này.','',
      '## 2. Thống kê chênh lệch','',
      '| Hạng mục | Bản Việt | Bản Trung | Phần cập nhật |','|---|---:|---:|---|',
      '| Khai báo bộ, gồm bộ mặc định/hệ thống | 59 | 65 | Thêm 6 |',
      '| FashionConfig | 1.976 | 2.078 | Thêm 102, sửa 46, không xóa |',
      '| Bảng điểm sao màu | 151 | 201 | Thêm 50 dòng (151–200) |',
      '| Ngoại quan lẻ mới | — | 25 | Không tính mảnh thuộc bộ |',
      '| Biến thể đặc biệt bộ 28340 | 0 | 5 | 20 mảnh spFashionIds |',
      '| Loại slot trong preset | 9 | 10 | Thêm 306: hiệu ứng vào trận |','',
      '**102 dòng mới = 57 mảnh thuộc 6 bộ mới + 20 mảnh đặc biệt của bộ 28340 + 25 ngoại quan lẻ.** Các con số mảnh không phải 102 bộ mới. Số biến thể cấp/màu của mỗi loại cần đọc đúng bảng; cấp nâng sao không được gọi chung là màu.','',
      '## 3. Sáu bộ cần bổ sung','',
      '| ID | Tên nguồn / tên Việt | Loại | Cấp hoặc biến thể | Cách nhận theo cấu hình |','|---|---|---|---:|---|']
    for row in a['suitRows']:
        if row['status']=='added':
            receive='Rương 4 mảnh' if row['box'] else 'Mua tại áo tắm: 456 ×30; không có rương'
            if row['id']==28410:receive='Rương 5 item: 4 mảnh + 28416 (slot 306)'
            lines.append(f"| {row['id']} | {row['nameCn']} / {translations[row['id']]} | {types[row['type']]} | {row['variantsCn']} | {receive} |")
    lines += ['', '- 28370 và 28380 có cấp 0–4, mỗi cấp 4 mảnh; nguyên liệu riêng 837/838, yêu cầu 100 →150 →250 →500. Giữ quy tắc thay bằng nguyên liệu chung theo server.',
      '- 28310 dùng skillId 28290 trong nguồn gốc; không tự đổi ID kỹ năng để trùng ID bộ.',
      '- 29280 có điều kiện hiển thị theo ngày 57. Không bỏ điều kiện ngày hoặc mở miễn phí chỉ để test xanh.',
      '- 29820 có phụ kiện mặt 29825, slot305, đặc quyền 38/50; phải kiểm cùng preset suối nóng 999.','',
      '## 4. Bộ cũ có thay đổi','',
      '- **28340 Mặc Nhiễm Tinh Hà**: mỗi màu 0–4 có thêm nhánh `spFashionIds` với 2844/8012844…8042844. Không phải thêm 5 màu thường. Client Trung gửi `color=100…104` để mặc nhánh này; client Việt không có hàm chọn và backend hiện từ chối cả 5 mã.',
      '- **29070 Tiên nhân Thanh Khâu**: thêm/đổi điều kiện khu vực TW và ngày57; cần giữ chính sách khu vực hiện hành khi cập nhật.',
      '- **29160 Điểm Mặc Đoạt Hồn**: thay showTypeTw của hai màu; không đổi quyền sở hữu.',
      '- **46 FashionConfig cũ đổi**: chi tiết từng field ở `fashion-table-deltas.json`; gồm hiển thị khu vực/ngày và các metadata khác. Không áp đè tất cả chỉ vì cùng ID.',
      '- **43 SkillEffectConfig khác cùng ID**, 32 node phụ thuộc mới trong đồ thị đã thu thập. Ví dụ 283700 đổi type42→54 và nhánh hiệu ứng; 284100 có args cuối 1000→100. Đây là khác biệt gameplay, phải kiểm nội dung và bộ giải kỹ năng trước nhập.',
      '- Trong dữ liệu phụ thuộc: AppearanceConfig thêm108; EffectConfig thêm15/sửa5; SkillConfig và SkillBehaviorConfig mỗi bảng thêm1. Không được coi đủ ảnh là đủ kỹ năng.','',
      '## 5. Ngoại quan lẻ mới','',
      'Tên Việt dưới đây là tên làm việc/tạm dịch để kiểm kê, chưa nhập bảng dịch game.','',
      '| ID | Nhóm | Tên Trung | Tên Việt làm việc |','|---|---|---|---|']
    for row in a['newStandalone']:
        lines.append(f"| {row['id']} | {row['typeName']} | {row['nameCn']} | {standalone_vi.get(row['id'],'Chờ dịch')} |")
    lines += ['', 'Loại106 hiện ghi nhãn trung tính vì cần xác nhận đúng màn sử dụng; không tự gọi đó là skin chiến đấu. Chủ đề15502 dùng FashionBtnConfig/theme2, không có AppearanceConfig là hợp đồng riêng của renderer (tương tự15501), không phải tài nguyên bị mất.','',
      '## 6. Lỗi và điểm chặn đã tái hiện','',
      '| Mức | Phát hiện | Bằng chứng / việc phải làm |','|---|---|---|',
      '| P0 | Chỉ số bộ bị cộng khi chưa sở hữu | Helper addFashionAttrs trong BattleService duyệt attrs của bộ mà thiếu gate ownership; nạp6 bộ mới trong RAM làm nhân vật không sở hữu tăng thêm attrs51=1900,52=1300,53=1800. Sửa và so sánh naked/partial/full trước nhập config. |',
      '| P0 | Chọn chủ đề1812 thiếu kiểm tra | Gọi15502 chưa sở hữu hoặc ID99999999 đều ACK0; lưu vào officialActivity.mainPanel thay vì fashionInfo.mainPanel. Sửa quyền sở hữu/ID/expiry và save-sync-relog trước thêm theme2. |',
      '| P1 | Rương28410 chưa mở được | Guard hiện yêu cầu rewards trùng đúng4parts. Nguồn có item28416 thứ5. Cần validate riêng reward hiệu ứng và giữ transaction/receipt. |',
      '| P1 | Slot306 chưa dùng được | Client Việt thiếu beginEffectId/UI; server từ chối mặc28416 với WHOLE_SUIT_REQUIRED dù đã sở hữu. Phải tách quyền bật hiệu ứng khỏi mặc mảnh nguyên bộ. |',
      '| P1 | Nhánh đặc biệt28340 | Native Việt trả mảnh thường khi yêu cầu special; backend trả lỗi color100–104 ngay cả khi đã cấp đủ mảnh trong RAM. Cần protocol/preset/sync và ownership của nhánh. |',
      '| P1 | Mua áo tắm cấp0 bị từ chối | 29810 hiện có và29820 mới, đủ456×30 vẫn ACK-1, tiền được giữ. Handler1803 chặn isSuit3/color0; sau cấp ownership trong RAM thì mặc preset999 được. |',
      '| P1 | Tăng trần sao màu | Có thêm50 dòng nhưng chưa chứng minh UI/handler/attribute aggregation dùng đúng tổng sao; kiểm cấp150/151/200 và hồi quy bộ liên động/bathrobe. |',
      '| P1 | Icon/hiệu ứng unresolved | Có tên cấu hình không nằm trong manifest/pack, bao gồm các alias cũ; phải trace renderer hoặc fallback đúng loại trước nghiệm thu. Không tự lấy ID gần kề. |','',
      'Trong fixture cập nhật config cô lập, bốn rương28310/28370/28380/29280 mở và mặc được; 25 ngoại quan lẻ được grant ownership. Đây **không phải** xác nhận hình ảnh/hiệu ứng hiển thị đúng hoặc đủ hành vi shop/giftcode production.','',
      '## 7. Tài nguyên đã lấy và kiểm tra','',
      f"- Đã resolve đồ thị {sum(resources['fileCounts'].values()):,} key tài nguyên file và {sum(resources['packCounts'].values()):,} entry pack liên quan toàn hệ thống; so sánh theo manifest và payload pack.",
      f"- File: {resources['fileCounts']}; pack: {resources['packCounts']}.",
      f"- Bộ chọn cập nhật: **{check['files']} file**, {check['totalBytes']:,} byte (~{check['totalBytes']/1e6:.1f} MB); {check['reusedLocal']} file đã có local được xác minh CRC và tái dùng. Tất cả file đã kiểm SHA-256 và CRC từ tên manifest; {pngs} PNG kiểm chunk CRC + giải nén IDAT, không phải render gameplay.",
      f"- Đã trích {resources['selectedPackEntries']} entry gốc vào 3 pack riêng atlas/skel/plist, giữ nguyên từng payload. Khi tích hợp phải merge entry, không thay pack toàn game.",
      f"- Có {len(resources['unresolvedDeltaStrings'])} chuỗi tài nguyên ở phần thay đổi chưa resolve trực tiếp. Danh sách trong resource-audit.json; một số là placeholder/alias/hiệu ứng tùy chọn đã có từ nguồn. Chưa được tính là lỗi download.",
      f"- Ngôn ngữ: {a['language']['referenced']} ID được tham chiếu trong cấu hình đã chọn, {len(a['language']['missing'])} ID chưa có bản Việt. Cần dịch bổ sung và rà chuỗi UI mới trong bundle riêng; không thay mọi text Việt bằng tiếng Trung.",
      '- Chưa kiểm trực quan toàn bộ ảnh, animation, âm thanh; chưa kết luận tất cả tài nguyên trong gói hoạt động với engine Việt.','',
      '## 8. Thứ tự thực hiện cập nhật','',
      '| Đợt | Công việc | Điều kiện qua |','|---|---|---|',
      '| 0 | Chốt mốc source/config và nhóm diff; tạo candidate độc lập | Hash baseline và manifest khớp, không import bảng ngoài thời trang |',
      '| 1 | Sửa tính attrs/ownership,1812,áo tắm0,slot306,special color | Negative/replay/save failure/expiry tests đạt; người chưa sở hữu không tăng chỉ số hay mặc được |',
      '| 2 | Merge6bộ+102dòng+13bảngliênquan và ngôn ngữ | Parent/parts/appearance/reward mapping đạt; giữ delta khác đã có ở bản Việt |',
      '| 3 | Merge manifest và selected pack, xử lý UI/renderer mới | Nam/nữ,0–4/special100–104,begin effect,theme2,bubble động render đúng |',
      '| 4 | Đối chiếu gameplay kỹ năng và50bậc sao | Quyết định rõ43effect thay đổi, không áp số/loại hiệu ứng mù; damage/stat tests có oracle |',
      '| 5 | Cập nhật catalog GM/webshop/giftcode/mail theo ID đã sẵn sàng | Chỉ phát item hỗ trợ; nhận≠mở; trùng đổi đúng swaps; không tự đổi gói bán/giá |',
      '| 6 | QA hoàn chỉnh và phát hành có backup/CAS | Handler+native+browser+WS S2→S1; relog,preset,hot spring,timed,màu,rollback; không repair lịch sử tự động |','',
      'Chính sách mặc bộ thường/phối lẻ hiện tại, patch đánh xa và cơ chế receipt phải được giữ. Không cấp bù/di chuyển dữ liệu người chơi trong gói content. Kênh nhận mới (shop/sự kiện) cần xác định nơi phát hành dựa trên thiết kế hiện tại, không bê nguyên lịch thanh toán/sự kiện Trung.','',
      '## 9. Danh mục đầy đủ 65 khai báo bộ','',
      'Số biến thể là số row cấp/màu cơ bản, chưa cộng nhánh special. Có bộ mặc định/hệ thống không phải rương thương phẩm.','',
      '| ID | Tên Việt hoặc tên gốc | Loại | Việt→Trung | Tình trạng |','|---|---|---|---|---|']
    for row in sorted(a['suitRows'],key=lambda r:r['id']):
        label=row['nameVi'] or translations.get(row['id']) or row['nameCn'] or 'Bộ mặc định/hệ thống'
        state='Thêm mới' if row['status']=='added' else 'Cần cập nhật nhánh đặc biệt' if row['specialVariants'] else 'Có sẵn'
        lines.append(f"| {row['id']} | {label} | {types[row['type']]} | {row['variantsVn']}→{row['variantsCn']} | {state} |")
    lines += ['', '## 10. File để triển khai tiếp','',
      '- Báo cáo này: `_ai_workbench/reports/fashion_system_update_audit_20260909.md`.',
      '- `fashion-inventory.json`: toàn bộ2078dòng với ID,tên,nhóm,parent,status vàrow gốc.',
      '- `fashion-table-deltas.json`: thêm/sửa/xóa của13bảng, có cặp VN/CN cho từng row thay đổi.',
      '- `fashion-cn-tables.json`, `fashion-related-cn.json`, `fashion-language-cn.json`: dữ liệu nguồn theo phạm vi.',
      '- `native-method-reference.json`: hàm client gốc liên quan special/effect để đối chiếu, không phải patch.',
      '- `resource-audit.json`, `assets-download.json`, `asset-verification.json`: tài nguyên, nguồn URL và hash.',
      '- `compat-fixture.json`: kết quả handler/nativeRAM; `live-baseline.json`, `baseline-table-comparison.json`: đối chiếu live.',
      '- Mọi artifact nằm trong `_ai_workbench/temp/fashion_cn_recovery_20260909/`; source gameplay/DB/live chưa đổi ở lượt này.',
      '- Gói ZIP là **dữ liệu nguồn để tích hợp**, không phải bản thả vào server chạy ngay.','']
    report=WB/'reports/fashion_system_update_audit_20260909.md'
    report.write_text('\n'.join(lines),encoding='utf-8')
    # Archive exactly selected dependencies + inventories. No credentials/player dumps.
    archive=OUT/'fashion_update_source_20260909.zip'
    entries={}
    for name in ['system-audit.json','fashion-cn-tables.json','fashion-table-deltas.json','fashion-related-cn.json','fashion-inventory.json','fashion-language-cn.json','native-method-reference.json','compat-fixture.json','resource-audit.json','assets-download.json','asset-verification.json','current-build.json','config-download.json','baseline-table-comparison.json']:
        entries['audit/'+name]=OUT/name
    entries['README.md']=report
    for row in downloaded['files']:
        entries[row['path'].replace('\\','/')]=Path(row['storedAt'])
    for row in resources['exportedPacks']:
        entries[row['path'].replace('\\','/')]=OUT/row['path']
    manifest=[]
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for name,source in sorted(entries.items()):
            data=source.read_bytes();z.writestr(name,data);manifest.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
        z.writestr('MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert len(z.namelist())==len(entries)+1
        for row in manifest:
            assert hashlib.sha256(z.read(row['path'])).hexdigest()==row['sha256']
    result={'result':'PASS','archive':str(archive),'archiveBytes':archive.stat().st_size,'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'entries':len(entries)+1,'assets':check['files'],'pngs':pngs,'report':str(report)}
    write_json(OUT/'package.json',result)
    print(json.dumps(result))


if __name__=='__main__':
    main()
