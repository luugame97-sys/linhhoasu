import re

with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

chinese_pattern = re.compile(r'[\u4e00-\u9fa5]')
untranslated = 0
total = 0

for line in lines:
    line = line.strip()
    if not line or line.startswith("#") or line.startswith("[") or line.startswith("="):
        continue
    
    if "=" in line:
        key, val = line.split("=", 1)
        total += 1
        if chinese_pattern.search(val):
            untranslated += 1

print(f"Total entries: {total}")
print(f"Untranslated entries (contain Chinese): {untranslated}")
