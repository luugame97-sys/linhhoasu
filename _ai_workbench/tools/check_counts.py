with open(r"i:\Linhhoasu\server\server\LinhHoaSu_Translate_done.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

config_count = 0
js_count = 0
current = None

for line in lines:
    if line.startswith("[CONFIG_STRINGS]"):
        current = "cfg"
    elif line.startswith("[JS_STRINGS]"):
        current = "js"
    elif line.startswith("CFG_"):
        config_count += 1
    elif line.startswith("JS_"):
        js_count += 1

print(f"CFG strings: {config_count}")
print(f"JS strings: {js_count}")
