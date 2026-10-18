import sys
sys.stdout.reconfigure(encoding="utf-8")
translated_txt = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt"
with open(translated_txt, "r", encoding="utf-8") as f:
    for line in f:
        if "上一场 JSON 约" in line or "KB，未填入输入框" in line or "JSON" in line or "KB" in line:
            print(line.strip())
