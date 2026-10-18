import sys
bin_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\update\resource\assets\excel\lang_cn\config_lang_c2fa8585.bin.bak"
with open(bin_file, "rb") as f:
    data = f.read(20)
print(list(data))
