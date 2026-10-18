import sys
sys.stdout.reconfigure(encoding="utf-8")
with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt", "r", encoding="utf-8") as f:
    for line in f:
        if "JSON" in line:
            print("Found in done:", line.strip())
