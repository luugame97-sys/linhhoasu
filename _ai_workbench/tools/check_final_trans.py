import sys

count_trans = 0
with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_final.txt", "r", encoding="utf-8") as f:
    for line in f:
        if "=" in line:
            key, val = line.split("=", 1)
            # check if val has chinese
            import re
            if not re.search(r'[\u4e00-\u9fa5]', val):
                count_trans += 1
                
print(f"Total fully translated lines: {count_trans}")
