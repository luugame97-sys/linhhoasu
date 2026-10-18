import sys
sys.stdout.reconfigure(encoding="utf-8")
translated_txt = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt"
with open(translated_txt, "r", encoding="utf-8") as f:
    for line in f:
        if "Chạy dữ liệu chiến đấu" in line or "KB" in line or "JSON" in line:
            print(line.strip())
