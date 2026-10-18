import re
import csv

file_path = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js"

chinese_pattern = re.compile(r'[\u4e00-\u9fa5]')

with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

strings = re.findall(r'"([^"]*[\u4e00-\u9fa5]+[^"]*)"|\'([^\']*[\u4e00-\u9fa5]+[^\']*)\'|`([^`]*[\u4e00-\u9fa5]+[^`]*)`', content)

extracted = set()
for match in strings:
    for s in match:
        if s and chinese_pattern.search(s):
            extracted.add(s)

with open("i:/Linhhoasu/server/server/LinhHoaSu_Translate_JS.csv", "w", encoding="utf-8-sig", newline="") as out:
    writer = csv.writer(out)
    writer.writerow(["Original", "Translated"])
    for s in sorted(extracted):
        writer.writerow([s, ""])

print(f"Exported JS strings to LinhHoaSu_Translate_JS.csv")
