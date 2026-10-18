with open(r"i:\Linhhoasu\server\server\_ai_workbench\tools\LinhHoaSu_Translate_final.txt", "r", encoding="utf-8") as f:
    for line in f:
        if "超值豪礼" in line:
            print(line.strip())
