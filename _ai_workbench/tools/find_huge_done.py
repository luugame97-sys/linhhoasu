import sys
sys.stdout.reconfigure(encoding="utf-8")
js_file = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        if "se.sineOut).to({right:0}" in line:
            print("FOUND IN DONE TEXT:", line[:100])
