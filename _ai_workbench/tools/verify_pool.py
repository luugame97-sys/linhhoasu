with open("_ai_workbench/temp/language_cn.json", "rb") as f:
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
for _ in range(length_array):
    length = 0
    shift = 0
    while True:
        b = data[pos]
        pos += 1
        length |= (b & 0x7f) << shift
        if not (b & 0x80):
            break
        shift += 7
    s_bytes = data[pos:pos+length]
    strings.append(s_bytes.decode("utf-8", errors="ignore"))
    pos += length

print(f"Valid array size: {len(strings)}")
print(f"Pos after valid array: {pos}")
remaining_bytes = data[pos:]

# Now load translations
translations = {}
with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()
for line in lines:
    line = line.strip()
    if line.startswith("CFG_") and "=" in line:
        key, val = line.split("=", 1)
        idx = int(key.replace("CFG_", ""))
        # Un-escape newlines
        val = val.replace("\\n", "\n").replace("\\r", "\r")
        translations[idx] = val

# Check how many valid strings will be translated
translated_count = 0
for idx in range(length_array):
    if idx in translations:
        strings[idx] = translations[idx]
        translated_count += 1

print(f"Applied {translated_count} translations to the valid string pool.")
