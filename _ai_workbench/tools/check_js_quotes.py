import sys
js_file = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt"
count = 0
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        if line.startswith("JS_"):
            if '"' in line[line.find('=')+1:]:
                print("Line with quote:", line.strip()[:100])
                count += 1
print(f"Total JS translations with double quotes: {count}")
