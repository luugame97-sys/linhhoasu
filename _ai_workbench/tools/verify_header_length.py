import struct
import sys

bin_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\update\resource\assets\excel\lang_cn\config_lang_c2fa8585.bin"
with open(bin_file, "rb") as f:
    data = f.read()

idx = data.find(b"x\x9c")
header = data[:idx]
length_in_header = struct.unpack(">I", header[-4:])[0]
actual_zlib_length = len(data[idx:])

print(f"Header length: {length_in_header}")
print(f"Actual zlib length: {actual_zlib_length}")
print(f"Match: {length_in_header == actual_zlib_length}")
