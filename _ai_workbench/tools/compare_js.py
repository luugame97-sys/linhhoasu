import sys
sys.stdout.reconfigure(encoding="utf-8")
with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate.txt", "r", encoding="utf-8") as f:
    origs = {line.split("=", 1)[0]: line.split("=", 1)[1].strip() for line in f if line.startswith("JS_")}

with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt", "r", encoding="utf-8") as f:
    for line in f:
        if line.startswith("JS_") and "=" in line:
            key, val = line.split("=", 1)
            val = val.strip()
            if origs.get(key) != val:
                print(f"{key} changed from {origs.get(key)} TO {val}")
