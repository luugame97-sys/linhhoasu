import sys
sys.stdout.reconfigure(encoding="utf-8")
translated_txt = r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt"
js_translations = {}
with open(translated_txt, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip("\n")
        if line.startswith("JS_") and "=" in line:
            key, val = line.split("=", 1)
            val = val.replace("\\n", "\n").replace("\\r", "\r")
            
            # Check for quotes or newlines
            if '"' in val or "'" in val or "\n" in val:
                print(f"Warning: {key} contains quotes or newlines: {repr(val)}")
