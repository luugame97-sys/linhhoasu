from pathlib import Path
from PIL import Image

root = Path(r"I:\Linhhoasu\server\server\linhhoasu\webgame\game\update\resource")
exact = []
candidates = []
for path in root.rglob("*.png"):
    try:
        with Image.open(path) as image:
            width, height = image.size
            if 780 <= width <= 800 and 395 <= height <= 415:
                exact.append((width, height, path))
            if width >= 700 and height >= 350 and 1.65 <= width / height <= 2.2:
                candidates.append((width, height, path))
    except Exception:
        pass

print("EXACT", len(exact))
for width, height, path in exact:
    print(width, height, path)
print("CANDIDATES", len(candidates))
for width, height, path in candidates:
    print(width, height, path)
