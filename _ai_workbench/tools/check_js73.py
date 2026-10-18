with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate.txt", "r", encoding="utf-8") as f:
    for line in f:
        if line.startswith("JS_73="):
            print("Original:", repr(line.strip()))
            
with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt", "r", encoding="utf-8") as f:
    for line in f:
        if line.startswith("JS_73="):
            print("Translated:", repr(line.strip()))
