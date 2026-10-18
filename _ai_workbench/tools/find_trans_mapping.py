import sys
sys.stdout.reconfigure(encoding="utf-8")
with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate.txt", "r", encoding="utf-8") as f:
    for line in f:
        if "上一场" in line or "未填入" in line:
            print("Orig:", line.strip())

with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt", "r", encoding="utf-8") as f:
    for line in f:
        if "上一场" in line or "未填入" in line or "Một" in line or "Hẹn" in line or "Chạy" in line:
            print("Done:", line.strip())
