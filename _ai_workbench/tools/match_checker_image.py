from pathlib import Path
from PIL import Image
import numpy as np

root = Path(r"I:\Linhhoasu\server\server\linhhoasu\webgame\game\update\resource")
target_path = Path(r"C:\Users\vandu\AppData\Local\Temp\codex-clipboard-9f0d6083-d275-420b-b55a-2705714ce383.png")

target_full = Image.open(target_path).convert("RGB").crop((0, 9, 790, 411))
width, height = target_full.size
yy, xx = np.indices((height, width))
checker_gray = np.where((((xx + 1) // 6 + yy // 6) % 2)[..., None] == 0, 204, 255).astype(np.uint8)
checker = Image.fromarray(np.repeat(checker_gray, 3, axis=2), "RGB")
score_size = (158, 80)
target = np.asarray(target_full.resize(score_size, Image.Resampling.LANCZOS), dtype=np.float32)

scores = []
for path in root.rglob("*.png"):
    try:
        with Image.open(path) as source:
            source = source.convert("RGBA")
            sw, sh = source.size
            if sw < 600 or sh < 300 or not (1.6 <= sw / sh <= 2.3):
                continue
            resized = source.resize((width, height), Image.Resampling.LANCZOS)
            rendered = checker.copy()
            rendered.paste(resized, (0, 0), resized)
            sample = np.asarray(rendered.resize(score_size, Image.Resampling.LANCZOS), dtype=np.float32)
            mse = float(np.mean((sample - target) ** 2))
            scores.append((mse, sw, sh, str(path)))
    except Exception:
        pass

scores.sort()
for mse, width, height, path in scores[:40]:
    print(f"{mse:.3f}\t{width}x{height}\t{path}")
