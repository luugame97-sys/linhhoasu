import sys
sys.stdout.reconfigure(encoding="utf-8")
js_file = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate.txt"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        if line.startswith("JS_17="):
            print("Found in orig txt:", len(line))
