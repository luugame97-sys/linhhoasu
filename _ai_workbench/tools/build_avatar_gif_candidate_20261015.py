from pathlib import Path
from PIL import Image
import json, hashlib

src = Path(r'C:/Users/vandu/Desktop/5d19a15e410e6650d97a70b094eb1f23.gif')
out = Path(__file__).resolve().parents[1] / 'temp/avatar_11315_candidate_20261015'
out.mkdir(parents=True, exist_ok=True)
im = Image.open(src)
frames = []
for i in range(getattr(im, 'n_frames', 1)):
    im.seek(i)
    frame = im.convert('RGBA')
    frame.thumbnail((256, 256), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    canvas.alpha_composite(frame, ((256-frame.width)//2, (256-frame.height)//2))
    frames.append(canvas)
sheet = Image.new('RGBA', (256*9, 256*9), (0, 0, 0, 0))
for i, frame in enumerate(frames):
    sheet.paste(frame, ((i % 9)*256, (i // 9)*256))
sheet_path = out / 'sp_ui_touxiang_11315_candidate.png'
sheet.save(sheet_path, optimize=True)
preview = out / 'preview.gif'
frames[0].save(preview, save_all=True, append_images=frames[1:], duration=30, loop=0, disposal=2, optimize=True)
manifest = {
    'itemId': 11315, 'fashionType': 102, 'appearanceId': 11315,
    'resourceBase': 'sp_ui_touxiang_11315', 'source': str(src),
    'frames': len(frames), 'frameSize': [256,256], 'grid': [9,9],
    'nativeSpineSkeleton': None, 'status': 'BLOCKED_UNTIL_SPINE_EXPORT',
    'sha256': hashlib.sha256(sheet_path.read_bytes()).hexdigest()
}
(out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps({**manifest, 'sheet': str(sheet_path), 'preview': str(preview)}, ensure_ascii=False))
