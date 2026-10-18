import sys
sys.stdout.reconfigure(encoding="utf-8")
js_file = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        if "上一场 JSON Hẹn" in line or "上一场 JSON 约" in line:
            print("Found in done txt:", line.strip())
