import zlib
import sys

bin_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\update\resource\assets\excel\lang_cn\config_lang_c2fa8585.bin"
with open(bin_file, "rb") as f:
    data = f.read()

idx = data.find(b"x\x9c")
zlib_data = data[idx:]
try:
    decompressed = zlib.decompress(zlib_data)
    print(f"Decompression successful! Size: {len(decompressed)}")
except Exception as e:
    print(f"Decompression failed: {e}")
