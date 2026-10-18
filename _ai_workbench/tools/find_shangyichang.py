import sys
sys.stdout.reconfigure(encoding="utf-8")
with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate.txt", "r", encoding="utf-8") as f:
    for line in f:
        if "上一场" in line:
            print("Found in orig txt:", line.strip())
