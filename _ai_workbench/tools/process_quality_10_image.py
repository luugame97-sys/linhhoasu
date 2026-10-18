from PIL import Image
import numpy as np

src_path = 'C:/Users/vandu/.gemini/antigravity/brain/af4a9ab9-7a34-4bd0-abc1-9a184e95c448/.user_uploaded/media_1790692141232.jpg'
img = Image.open(src_path).convert('RGBA')
arr = np.array(img, dtype=np.float32)

r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
max_c = np.maximum(np.maximum(r, g), b)

# For black background removal with glow preservation:
# Let threshold_low = 10, threshold_high = 70
low, high = 10.0, 75.0
alpha = np.clip((max_c - low) / (high - low), 0.0, 1.0) * 255.0

# When alpha > 0, slightly brighten colors that were dimmed by black blending
scale = np.where(alpha > 0, 255.0 / np.maximum(alpha, 1.0), 1.0)
scale = np.clip(scale, 1.0, 2.0) # avoid over-amplifying noise

r_out = np.clip(r * scale, 0, 255)
g_out = np.clip(g * scale, 0, 255)
b_out = np.clip(b * scale, 0, 255)

out_arr = np.stack([r_out, g_out, b_out, alpha], axis=-1).astype(np.uint8)
out_img = Image.fromarray(out_arr, 'RGBA')

# Crop to content bounding box
bbox = out_img.getbbox()
print('Content bbox:', bbox)
cropped = out_img.crop(bbox)

# Target size is 90x90
# Maintain aspect ratio, center in 90x90 canvas
w, h = cropped.size
aspect = w / h
if aspect > 1:
    nw = 88
    nh = int(88 / aspect)
else:
    nh = 88
    nw = int(88 * aspect)

resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
final_img = Image.new('RGBA', (90, 90), (0, 0, 0, 0))
offset_x = (90 - nw) // 2
offset_y = (90 - nh) // 2
final_img.paste(resized, (offset_x, offset_y), resized)

final_img.save('_ai_workbench/temp/test_quality_10.png')
print('Saved to _ai_workbench/temp/test_quality_10.png successfully')
