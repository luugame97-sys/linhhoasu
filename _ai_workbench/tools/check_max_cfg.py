with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

max_cfg = -1
for line in lines:
    if line.startswith("CFG_"):
        try:
            idx = int(line.split("=")[0].replace("CFG_", ""))
            if idx > max_cfg:
                max_cfg = idx
        except:
            pass

print(f"Max CFG index: {max_cfg}")
