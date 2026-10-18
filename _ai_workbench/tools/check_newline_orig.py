import sys

trans_file = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate.txt"
with open(trans_file, "r", encoding="utf-8") as f:
    for line in f:
        if "\\n" in line and line.startswith("CFG_"):
            print("Found escaped newline in original:", line.strip()[:100])
            break
