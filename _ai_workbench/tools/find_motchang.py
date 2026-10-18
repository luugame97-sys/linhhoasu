import sys
sys.stdout.reconfigure(encoding="utf-8")
with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt", "r", encoding="utf-8") as f:
    for line in f:
        if "Một场" in line:
            print("Found:", line.strip())
