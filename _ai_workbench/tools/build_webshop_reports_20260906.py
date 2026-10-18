"""Generate complete hidden-set ID listing and WebGM handoff report."""
import json
from pathlib import Path
WB=Path(__file__).resolve().parents[1];R=WB/'temp/webshop_upgrade_20260906';REPORT=WB/'reports';C=R/'candidate'
doc=json.loads((C/'assets/item/hidden_fashion_sets.json').read_text(encoding='utf-8'));sets=doc['sets'];images=json.loads((C/'assets/item/item_images.json').read_text(encoding='utf-8'))['items']
lines=['# Các bộ thời trang có thành phần ẩn — Linh Họa Sư','',
'Nguồn: FashionDressConfig và các bảng cấp/màu, FashionConfig showType/showTypeTw=0. Tổng38 bộ /101 biến thể. Đây là danh mục cấu hình, không khẳng định tất cả đang mở bán hoặc hiện trong sự kiện.','',
'Gói Webshop nên chứa từng ID trong cột Thành phần, số lượng1 mỗi ID. Hộp ID bộ là đường khác: người nhận cần dùng hộp. Không trộn cả hộp và đủ thành phần vào một gói nếu không muốn phát hai lần giá trị.','',
'Ví dụ Phượng Cầu Hoàng: ID bộ/hộp28040; gói cấp thẳng gồm28041,28042,28043,28049.','',
'| ID bộ | Cấp/màu | Tên | ID toàn bộ thành phần | Hộp gửi được |','|---:|---:|---|---|---|']
for s in sets:lines.append('| %s | %s | %s | %s | %s |'%(s['id'],s['color'],s['name'].replace('|','/'),', '.join(str(p['id'])for p in s['parts']),str(s['boxId'])if s['boxId']else'Không có hộp; dùng ID phần'))
lines+=['','## JSON nhập gói','', 'Trang quản trị có nút “Thêm đủ bộ” để điền danh sách tự động. Trang tra cứu có nút copy JSON và tải CSV, tìm theo ID/tên.','',
'- [Tra ảnh và các bộ ẩn trên web admin](http://103.116.105.154:88/admin/item_catalog.php) — cần đăng nhập admin.','- [Danh mục bộ ẩn JSON](http://103.116.105.154:88/assets/item/hidden_fashion_sets.json).','- [Danh mục ảnh tất cả item JSON](http://103.116.105.154:88/assets/item/item_images.json).']
(REPORT/'hidden_fashion_sets_20260906.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
(REPORT/'hidden_fashion_sets_20260906.txt').write_text('\n'.join('%s | cấp/màu %s | %s | %s'%(s['id'],s['color'],s['name'],','.join(str(p['id'])for p in s['parts']))for s in sets)+'\n',encoding='utf-8')
(REPORT/'item_image_links_20260906.txt').write_text('\n'.join('%s | %s | http://103.116.105.154:88/api/item_icon.php?id=%s | %s'%(id,r['name'],id,r['source'])for id,r in images.items())+'\n',encoding='utf-8')
print(json.dumps({'sets':38,'variants':len(sets),'imageLinks':len(images),'reports':'hidden_fashion_sets_20260906.md/.txt and item_image_links_20260906.txt'}))
