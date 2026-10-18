import re
js_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js.bak"
with open(js_file, 'r', encoding='utf-8', errors='ignore') as f:
    js_content = f.read()
if "超值豪礼" in js_content:
    print("Found Chaozhi Haoli in main.min.js!")
else:
    print("Not found in main.min.js")
    
bin_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\update\resource\assets\excel\lang_cn\config_lang_c2fa8585.bin.bak"
import zlib
with open(bin_file, "rb") as f:
    raw = f.read()
idx = raw.find(b"x\x9c")
decompressed = zlib.decompress(raw[idx:])
if b"\xe8\xb6\x85\xe5\x80\xbc\xe8\xb1\xaa\xe7\xa4\xbc" in decompressed: # UTF-8 for 超值豪礼
    print("Found Chaozhi Haoli in config_lang!")
else:
    print("Not found in config_lang")
