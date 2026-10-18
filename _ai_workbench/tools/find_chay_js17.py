with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_final.txt", "r", encoding="utf-8") as f:
    for line in f:
        if line.startswith("JS_17="):
            import re
            match = re.search(r'.{0,30}Chạy.{0,30}', line)
            if match:
                print(match.group(0))
