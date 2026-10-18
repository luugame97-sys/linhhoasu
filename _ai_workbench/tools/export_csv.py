import csv
import re

# Read strings from language_cn.json
with open("language_cn.json", "rb") as f:
    data = f.read()

pos = 2
length_array = 0
shift = 0
while True:
    b = data[pos]
    pos += 1
    length_array |= (b & 0x7f) << shift
    if not (b & 0x80):
        break
    shift += 7

strings = []
while pos < len(data):
    length = 0
    shift = 0
    while True:
        if pos >= len(data):
            break
        b = data[pos]
        pos += 1
        length |= (b & 0x7f) << shift
        if not (b & 0x80):
            break
        shift += 7
    if pos >= len(data) and length == 0:
        break
    
    s_bytes = data[pos:pos+length]
    try:
        s = s_bytes.decode("utf-8")
    except:
        s = "<INVALID_UTF8>"
    strings.append(s)
    pos += length

# We only want to translate strings that contain Chinese characters
chinese_pattern = re.compile(r'[\u4e00-\u9fa5]')

with open("i:/Linhhoasu/server/server/LinhHoaSu_Translate.csv", "w", encoding="utf-8-sig", newline="") as out:
    writer = csv.writer(out)
    writer.writerow(["ID", "Original", "Translated"])
    for i, s in enumerate(strings):
        if chinese_pattern.search(s):
            writer.writerow([i, s, ""])

print(f"Exported to LinhHoaSu_Translate.csv")
