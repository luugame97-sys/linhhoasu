with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_final.txt", "r", encoding="utf-8") as f:
    for line in f:
        if "Chạy" in line and "JS_" in line:
            print(line.strip())
