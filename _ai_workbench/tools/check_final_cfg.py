with open(r"i:\Linhhoasu\server\server\_ai_workbench\tools\LinhHoaSu_Translate_final.txt", "r", encoding="utf-8") as f:
    for line in f:
        if line.startswith("CFG_14128=") or line.startswith("CFG_14133=") or line.startswith("CFG_14159=") or line.startswith("CFG_15093=") or line.startswith("CFG_15606="):
            print(line.strip())
