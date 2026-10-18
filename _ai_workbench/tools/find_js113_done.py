import sys
sys.stdout.reconfigure(encoding="utf-8")
with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt", "r", encoding="utf-8") as f:
    for line in f:
        if line.startswith("JS_113="):
            print("Done file JS_113:", line.strip())
        if line.startswith("JS_112="):
            print("Done file JS_112:", line.strip())
