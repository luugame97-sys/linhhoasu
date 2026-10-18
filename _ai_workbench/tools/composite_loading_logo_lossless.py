from pathlib import Path
from PIL import Image

target_path = Path(r"I:\Linhhoasu\server\server\linhhoasu\webgame\game\update\resource\assets\spine\ui\loading_dzz\lang_cn\loading_dzz_1_ec107ed3.png")
logo_path = Path(r"C:\Users\vandu\Desktop\MEGAME365\ảnh\banner\linhhoasu\70cc8535-ab78-4a93-9038-3d2c4d1289ae.png")
output_path = target_path.with_name("loading_dzz_1_ec107ed3_logo.png")

target = Image.open(target_path).convert("RGBA")
logo = Image.open(logo_path).convert("RGBA")

# Remove only the old vertical title strip.
target.paste((0, 0, 0, 0), (0, 250, 190, target.height))

logo_width = 480
logo_height = round(logo.height * logo_width / logo.width)
logo = logo.resize((logo_width, logo_height), Image.Resampling.LANCZOS)
target.alpha_composite(logo, (0, 350))
target.save(output_path, format="PNG", optimize=False)
print(output_path)
