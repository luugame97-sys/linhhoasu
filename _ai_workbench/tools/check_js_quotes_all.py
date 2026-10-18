import sys
js_file = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        if line.startswith("JS_"):
            if '"' in line[line.find('=')+1:]:
                print(line.strip()[:150])
