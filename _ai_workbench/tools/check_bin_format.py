import sys
bin_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\update\resource\assets\excel\config_e5ac72c2.bin"
with open(bin_file, "rb") as f:
    data = f.read(20)
print(list(data))
