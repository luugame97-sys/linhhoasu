import sys
import re

trans_file = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt"
with open(trans_file, "r", encoding="utf-8") as f:
    lines = f.readlines()

mangled = 0
for line in lines:
    if line.startswith("CFG_"):
        key, val = line.split("=", 1)
        # Check for % s, % d
        if re.search(r"%\s+[sd]", val) or re.search(r"{\s+\d+\s+}", val):
            print(f"Mangled format in {key}: {val.strip()}")
            mangled += 1

print(f"Total mangled found: {mangled}")
