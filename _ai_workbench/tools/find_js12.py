import sys
sys.stdout.reconfigure(encoding="utf-8")
with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate.txt", "r", encoding="utf-8") as f:
    for line in f:
        if line.startswith("JS_12="):
            print("Orig txt JS_12:", line.strip()[:100])
