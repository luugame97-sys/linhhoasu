import os
import sys
from pathlib import Path
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(r"I:\Linhhoasu\server\server")
BUILD_DIR = ROOT / "_ai_workbench" / "temp" / "pc_client_build"
BUILD_DIR.mkdir(parents=True, exist_ok=True)

ICON_SRC = ROOT / "linhhoasu" / "webgame" / "game" / "icon-web.png"
if not ICON_SRC.exists():
    raise FileNotFoundError(f"Icon source not found: {ICON_SRC}")

print(f"Loading icon from {ICON_SRC}...")
img = Image.open(ICON_SRC).convert("RGBA")

# 1. Generate PWA icons
icon_192 = BUILD_DIR / "icon-192.png"
icon_512 = BUILD_DIR / "icon-512.png"

img.resize((192, 192), Image.Resampling.LANCZOS).save(icon_192, "PNG")
img.resize((512, 512), Image.Resampling.LANCZOS).save(icon_512, "PNG")
print(f"Generated {icon_192} and {icon_512}")

# 2. Generate multi-size Windows .ico
icon_ico = BUILD_DIR / "icon.ico"
sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
img.save(icon_ico, format="ICO", sizes=sizes)
print(f"Generated {icon_ico} with sizes {sizes}")

# Verify ICO file
print(f"ICO size: {icon_ico.stat().st_size} bytes")
