bin_file = r"i:\Linhhoasu\server\server\linhhoasu\webgame\game\update\resource\assets\excel\lang_cn\config_lang_c2fa8585.bin.bak"
import zlib
with open(bin_file, "rb") as f:
    raw = f.read()
idx = raw.find(b"x\x9c")
decompressed = zlib.decompress(raw[idx:])

words = ["主线", "洞府", "仙盟", "挑战", "活动", "渡劫"]
for w in words:
    if w.encode("utf-8") in decompressed:
        print(f"Found {w} in config_lang!")
    else:
        print(f"NOT found {w} in config_lang!")
