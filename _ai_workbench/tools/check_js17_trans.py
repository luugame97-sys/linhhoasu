import sys
js_file = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        if line.startswith("JS_17="):
            print("Length of JS_17 translation:", len(line))
