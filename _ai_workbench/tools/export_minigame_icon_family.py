from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import hashlib, json, shutil

ROOT = Path(r'I:\Linhhoasu\server\server')
REL = Path('resource/assets/atlas_ui/1_lilian/touxiang/shuangzhuxian/rukou/lang_cn')
CN = ROOT / 'linhhoasu/lhs/update' / REL
VI = ROOT / 'linhhoasu/webgame/game/update' / REL
OUT = ROOT / '_ai_workbench/temp/minigame_icon_family_20260905'
CN_OUT = OUT / '01_original_cn'
VI_OUT = OUT / '02_current_vi'
CN_OUT.mkdir(parents=True, exist_ok=True)
VI_OUT.mkdir(parents=True, exist_ok=True)

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
rows=[]
for src_cn in sorted(CN.glob('minigame_bt_*.png')):
    src_vi = VI / src_cn.name
    if not src_vi.exists(): continue
    dst_cn=CN_OUT/src_cn.name; dst_vi=VI_OUT/src_cn.name
    shutil.copy2(src_cn,dst_cn); shutil.copy2(src_vi,dst_vi)
    with Image.open(src_cn) as a, Image.open(src_vi) as b:
        rows.append({'name':src_cn.name,'original_relative_path':str(src_cn.relative_to(ROOT)).replace('\\','/'),'current_relative_path':str(src_vi.relative_to(ROOT)).replace('\\','/'),'width':a.width,'height':a.height,'original_mode':a.mode,'current_mode':b.mode,'original_sha256':digest(src_cn),'current_sha256':digest(src_vi),'different':digest(src_cn)!=digest(src_vi)})

def sheet(folder, output, title):
    files=sorted(folder.glob('*.png')); cell_w=250; cell_h=150; cols=3; rows_n=(len(files)+cols-1)//cols
    canvas=Image.new('RGBA',(cell_w*cols,50+cell_h*rows_n),(25,34,42,255)); draw=ImageDraw.Draw(canvas)
    draw.text((15,15),title,fill='white')
    for i,p in enumerate(files):
        im=Image.open(p).convert('RGBA'); im.thumbnail((220,105),Image.Resampling.LANCZOS)
        x=(i%cols)*cell_w+(cell_w-im.width)//2; y=50+(i//cols)*cell_h+5
        canvas.alpha_composite(im,(x,y)); draw.text(((i%cols)*cell_w+8,50+(i//cols)*cell_h+115),p.stem[:34],fill=(220,230,235,255))
    canvas.save(output)

sheet(CN_OUT,OUT/'CONTACT_SHEET_ORIGINAL_CN.png','MINIGAME ICONS - ORIGINAL CN')
sheet(VI_OUT,OUT/'CONTACT_SHEET_CURRENT_VI.png','MINIGAME ICONS - CURRENT VI')
(OUT/'manifest.json').write_text(json.dumps({'count':len(rows),'source_family':str(REL).replace('\\','/'),'items':rows},ensure_ascii=False,indent=2),encoding='utf-8')
lines=['name\twidth\theight\toriginal_sha256\tcurrent_sha256\toriginal_path\tcurrent_path']
for r in rows: lines.append('\t'.join([r['name'],str(r['width']),str(r['height']),r['original_sha256'],r['current_sha256'],r['original_relative_path'],r['current_relative_path']]))
(OUT/'manifest.tsv').write_bytes(('\ufeff'+'\r\n'.join(lines)).encode('utf-8'))
(OUT/'README.txt').write_text('01_original_cn: 7 ảnh gốc tiếng Trung để dịch.\n02_current_vi: 7 ảnh Việt hiện tại để đối chiếu.\nGiữ nguyên tên file, kích thước, canvas và alpha khi gửi lại. Dấu chấm than đỏ trong ảnh chụp là lớp thông báo UI riêng, không nằm trong các PNG này.\n',encoding='utf-8')
print(json.dumps({'output':str(OUT),'count':len(rows),'all_different':all(r['different'] for r in rows),'items':[r['name'] for r in rows]},ensure_ascii=False,indent=2))
